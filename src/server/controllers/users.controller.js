// User management for administrators (FR-1, FR-2): list, view, create and edit accounts,
// activate/deactivate them, set a new password and unlock locked accounts.
// Every user has a row in `user` plus one row in the table of their role
// (student, supervisor, examiner or admin) that holds the role's profile fields.
// Password hashes and reset tokens are never selected, so they can never be returned.

import { query, withTransaction, likePattern } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import {
  requireFields,
  isBlank,
  oneOf,
  toInt,
  toBool,
  trimOrNull,
  checkMaxLength,
} from '../utils/validate.js';
import { notify } from '../services/notify.js';
import { loadUserContext } from '../services/access.js';
import { signToken, getBearerToken } from '../middleware/auth.js';
import { refreshUserRooms } from '../socket.js';
import {
  assertValidEmail,
  assertValidNewPassword,
  hashPassword,
  savePassword,
  isLocked,
} from './auth.controller.js';

const ROLES = ['Student', 'Supervisor', 'Examiner', 'Administrator'];
const DEFAULT_MAX_GROUPS = 3; // same default as supervisor.NumberOfGroups in schema.sql
const DUPLICATE_EMAIL = 'A user with this email already exists.';

// The query behind every endpoint that returns users. The role tables are joined, so each
// user comes back with the profile fields of their own role (the other fields are null).
const USER_SELECT = `
  SELECT u.UserID AS id, u.Name AS name, u.Email AS email, u.Role AS role,
         u.IsActive AS isActive, u.LockedUntil AS lockedUntil, u.CreatedAt AS createdAt,
         CASE u.Role
           WHEN 'Administrator' THEN a.AdminDepartment
           WHEN 'Supervisor'    THEN sp.SupervisorDepartment
           WHEN 'Examiner'      THEN e.ExaminerDepartment
         END AS department,
         s.StudentMajor AS major, s.GPA AS gpa, s.GroupID AS groupId, g.GroupName AS groupName,
         sp.NumberOfGroups AS numberOfGroups, sp.IsAvailable AS isAvailable,
         CASE u.Role
           WHEN 'Supervisor' THEN (SELECT COUNT(*) FROM project_group pg WHERE pg.SupervisorID = sp.SupervisorID)
           WHEN 'Examiner'   THEN (SELECT COUNT(*) FROM project_group pg WHERE pg.ExaminerID = e.ExaminerID)
         END AS assignedGroups
    FROM \`user\` u
    LEFT JOIN admin a         ON a.UserID = u.UserID
    LEFT JOIN supervisor sp   ON sp.UserID = u.UserID
    LEFT JOIN examiner e      ON e.UserID = u.UserID
    LEFT JOIN student s       ON s.UserID = u.UserID
    LEFT JOIN project_group g ON g.GroupID = s.GroupID`;

// Administrators first, then supervisors, examiners and students; A-Z inside each role
const USER_ORDER = "ORDER BY FIELD(u.Role, 'Administrator', 'Supervisor', 'Examiner', 'Student'), u.Name";

// ---------------------------------------------------------------------
// Endpoints (all of them are for Administrators only, see users.routes.js)
// ---------------------------------------------------------------------

/**
 * GET /api/users?role=&search=&active=
 * role = one of the four roles, search = part of a name or email, active = true | false
 */
export async function listUsers(req, res) {
  const conditions = [];
  const params = [];

  if (!isBlank(req.query.role)) {
    conditions.push('u.Role = ?');
    params.push(oneOf(req.query.role, ROLES, 'Role'));
  }

  if (!isBlank(req.query.active)) {
    const active = oneOf(String(req.query.active), ['true', 'false', '1', '0'], 'Active filter');
    conditions.push('u.IsActive = ?');
    params.push(toBool(active) ? 1 : 0);
  }

  if (!isBlank(req.query.search)) {
    const pattern = likePattern(String(req.query.search).trim());
    conditions.push('(u.Name LIKE ? OR u.Email LIKE ?)');
    params.push(pattern, pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(`${USER_SELECT} ${where} ${USER_ORDER}`, params);
  res.json(rows.map(toUserResponse));
}

// GET /api/users/:id
export async function getUser(req, res) {
  const id = toInt(req.params.id, 'User id');
  res.json(await findUserOrFail(id));
}

/**
 * POST /api/users  { name, email, password, role, department?, major?, gpa?, numberOfGroups?, isAvailable? }
 * Creates the login account AND the profile row of its role in one transaction.
 */
export async function createUser(req, res) {
  requireFields(req.body, { name: 'Name', email: 'Email', password: 'Password', role: 'Role' });
  const role = oneOf(req.body.role, ROLES, 'Role');
  const name = readName(req.body.name);
  const email = assertValidEmail(req.body.email);
  assertValidNewPassword(req.body.password);
  const profile = readProfileFields(req.body, role);
  await assertEmailIsFree(email);

  const passwordHash = await hashPassword(req.body.password);

  let newUserId;
  try {
    // Both rows are saved together: if the profile insert fails, the account is not created either
    newUserId = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        'INSERT INTO `user` (Name, Email, Password, Role) VALUES (?, ?, ?, ?)',
        [name, email, passwordHash, role]
      );
      await saveRoleProfile(conn, result.insertId, role, profile);
      return result.insertId;
    });
  } catch (err) {
    // Someone else saved the same email a moment ago (the UNIQUE key stops it)
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, DUPLICATE_EMAIL, { field: 'email' });
    throw err;
  }

  res.status(201).json(await findUserOrFail(newUserId));
}

/**
 * PUT /api/users/:id  { name, email, department?, major?, gpa?, numberOfGroups?, isAvailable? }
 * Updates the account and its role profile. Profile fields that are not sent keep their value.
 */
export async function updateUser(req, res) {
  const id = toInt(req.params.id, 'User id');
  const existing = await findUserOrFail(id);

  // The role decides which profile table the user lives in, so it cannot be changed
  if (req.body.role !== undefined && req.body.role !== existing.role) {
    throw new HttpError(
      400,
      'The role of an existing user cannot be changed. Please create a new account for the new role.',
      { field: 'role' }
    );
  }

  requireFields(req.body, { name: 'Name', email: 'Email' });
  const name = readName(req.body.name);
  const email = assertValidEmail(req.body.email);
  const profile = readProfileFields(req.body, existing.role, existing);
  await assertEmailIsFree(email, id);

  // FR-5: a supervisor's maximum cannot be lower than the groups they already supervise
  if (existing.role === 'Supervisor' && profile.numberOfGroups < existing.assignedGroups) {
    throw new HttpError(
      400,
      `This supervisor already has ${existing.assignedGroups} groups, so the maximum cannot be lower than that.`,
      { field: 'numberOfGroups' }
    );
  }

  try {
    await withTransaction(async (conn) => {
      await conn.query('UPDATE `user` SET Name = ?, Email = ? WHERE UserID = ?', [name, email, id]);
      await saveRoleProfile(conn, id, existing.role, profile);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, DUPLICATE_EMAIL, { field: 'email' });
    throw err;
  }

  res.json(await findUserOrFail(id));
}

/**
 * PATCH /api/users/:id/status  { isActive: true | false }
 * Deactivated users cannot log in; their open sessions stop working immediately.
 */
export async function updateUserStatus(req, res) {
  const id = toInt(req.params.id, 'User id');
  if (typeof req.body.isActive !== 'boolean') {
    throw new HttpError(400, 'Active status must be true or false', { field: 'isActive' });
  }
  const isActive = req.body.isActive;

  // An administrator must not lock themself out (this also keeps at least one active admin)
  if (id === req.user.id && !isActive) {
    throw new HttpError(400, 'You cannot deactivate your own account.');
  }

  await findUserOrFail(id);
  await query('UPDATE `user` SET IsActive = ? WHERE UserID = ?', [isActive ? 1 : 0, id]);

  // requireAuth already rejects the next request of a deactivated user;
  // this also closes their live chat/notification connections right away
  if (!isActive) await refreshUserRooms(id);

  res.json(await findUserOrFail(id));
}

/**
 * POST /api/users/:id/reset-password  { password } -> { message, token? }
 * The administrator sets a new password for a user. This also unlocks the account and ends
 * the user's sessions. When admins change their OWN password this way, a new token is
 * returned so their current tab stays signed in.
 */
export async function resetUserPassword(req, res) {
  const id = toInt(req.params.id, 'User id');
  const user = await findUserOrFail(id);

  requireFields(req.body, { password: 'New password' });
  assertValidNewPassword(req.body.password);
  const isSelf = id === req.user.id;
  await savePassword(id, req.body.password, { keepToken: isSelf ? getBearerToken(req) : null });

  // Let the user know, in case they did not ask for it
  if (!isSelf) {
    await notify(id, {
      type: 'System',
      title: 'Your password was changed by an administrator',
      message: 'If you did not ask for this change, please contact the administrator.',
      link: '/profile',
    });
  }

  const response = { message: `The new password for ${user.name} has been saved.` };
  if (isSelf) response.token = signToken(await loadUserContext(id));
  res.json(response);
}

/**
 * POST /api/users/:id/unlock -> the user
 * Removes a login lock (UC1) without changing the password.
 */
export async function unlockUser(req, res) {
  const id = toInt(req.params.id, 'User id');
  await findUserOrFail(id);
  await query('UPDATE `user` SET FailedLoginAttempts = 0, LockedUntil = NULL WHERE UserID = ?', [id]);
  res.json(await findUserOrFail(id));
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Loads one user in API shape, or throws 404
async function findUserOrFail(id) {
  const rows = await query(`${USER_SELECT} WHERE u.UserID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found');
  return toUserResponse(rows[0]);
}

// Turns a database row into the JSON the API returns (flags become true/false)
function toUserResponse(row) {
  const isStudent = row.role === 'Student';
  const isSupervisor = row.role === 'Supervisor';
  const locked = isLocked(row.lockedUntil);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: toBool(row.isActive),
    isLocked: locked,
    lockedUntil: locked ? row.lockedUntil : null,
    createdAt: row.createdAt,
    // Staff profile
    department: isStudent ? null : row.department ?? null,
    // Student profile
    major: isStudent ? row.major : null,
    gpa: isStudent ? row.gpa : null,
    groupId: isStudent ? row.groupId : null,
    groupName: isStudent ? row.groupName : null,
    // Supervisor profile (numberOfGroups = the maximum number of groups they accept)
    numberOfGroups: isSupervisor ? row.numberOfGroups : null,
    isAvailable: isSupervisor ? toBool(row.isAvailable) : null,
    // How many groups a supervisor or examiner has right now
    assignedGroups: row.assignedGroups ?? null,
  };
}

// Throws 409 when another account already uses this email
async function assertEmailIsFree(email, exceptUserId = 0) {
  const rows = await query('SELECT UserID FROM `user` WHERE Email = ? AND UserID <> ?', [
    email,
    exceptUserId,
  ]);
  if (rows.length > 0) throw new HttpError(409, DUPLICATE_EMAIL, { field: 'email' });
}

// A trimmed name of at most 100 characters (the size of user.Name)
function readName(value) {
  const name = String(value).trim();
  return checkMaxLength(name, 100, 'Name');
}

// Optional text: trimmed, empty becomes null, with a maximum length
function readOptionalText(value, maxLength, label) {
  const text = trimOrNull(value);
  return text === null ? null : checkMaxLength(text, maxLength, label);
}

// Optional GPA between 0 and 5 (works for 4-point and 5-point scales), rounded to 2 decimals
function readGpa(value) {
  if (isBlank(value)) return null;
  const gpa = Number(value);
  if (!Number.isFinite(gpa) || gpa < 0 || gpa > 5) {
    throw new HttpError(400, 'GPA must be a number between 0 and 5', { field: 'gpa' });
  }
  return Math.round(gpa * 100) / 100;
}

/**
 * Reads the profile fields that belong to a role from the request body.
 * A field that is not in the body keeps its current value (when creating: the default).
 */
function readProfileFields(body, role, current = {}) {
  const pick = (field) => (body[field] !== undefined ? body[field] : current[field]);

  if (role === 'Student') {
    return {
      major: readOptionalText(pick('major'), 100, 'Major'),
      gpa: readGpa(pick('gpa')),
    };
  }

  const department = readOptionalText(pick('department'), 100, 'Department');

  if (role === 'Supervisor') {
    const maxGroups = pick('numberOfGroups');
    const isAvailable = pick('isAvailable');
    return {
      department,
      numberOfGroups: isBlank(maxGroups)
        ? DEFAULT_MAX_GROUPS
        : toInt(maxGroups, 'Maximum number of groups', { min: 1, max: 20 }),
      isAvailable: isBlank(isAvailable) ? true : toBool(isAvailable),
    };
  }

  return { department }; // Examiner and Administrator
}

/**
 * Creates or updates the role profile row of a user (inside a transaction).
 * "ON DUPLICATE KEY UPDATE" updates the row when it already exists (UserID is UNIQUE).
 */
async function saveRoleProfile(conn, userId, role, profile) {
  switch (role) {
    case 'Student':
      await conn.query(
        `INSERT INTO student (UserID, StudentMajor, GPA) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE StudentMajor = VALUES(StudentMajor), GPA = VALUES(GPA)`,
        [userId, profile.major, profile.gpa]
      );
      break;
    case 'Supervisor':
      await conn.query(
        `INSERT INTO supervisor (UserID, SupervisorDepartment, NumberOfGroups, IsAvailable) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE SupervisorDepartment = VALUES(SupervisorDepartment),
           NumberOfGroups = VALUES(NumberOfGroups), IsAvailable = VALUES(IsAvailable)`,
        [userId, profile.department, profile.numberOfGroups, profile.isAvailable ? 1 : 0]
      );
      break;
    case 'Examiner':
      await conn.query(
        `INSERT INTO examiner (UserID, ExaminerDepartment) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE ExaminerDepartment = VALUES(ExaminerDepartment)`,
        [userId, profile.department]
      );
      break;
    default: // Administrator
      await conn.query(
        `INSERT INTO admin (UserID, AdminDepartment) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE AdminDepartment = VALUES(AdminDepartment)`,
        [userId, profile.department]
      );
  }
}
