// "My profile" for every role: view my account and role details, and edit my name plus
// my major (students) or department (staff). The email address and the GPA can only be
// changed by an administrator (see users.controller.js). Password changes use
// POST /api/auth/change-password.

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, trimOrNull, checkMaxLength, toBool } from '../utils/validate.js';
import { loadUserContext, toPublicUser } from '../services/access.js';
import { normalizeEmail } from './auth.controller.js';

// Where the department of each staff role is stored (fixed names, never user input)
const DEPARTMENT_COLUMNS = {
  Supervisor: { table: 'supervisor', column: 'SupervisorDepartment' },
  Examiner: { table: 'examiner', column: 'ExaminerDepartment' },
  Administrator: { table: 'admin', column: 'AdminDepartment' },
};

/**
 * GET /api/profile -> the logged-in user plus the details of their role:
 *   Student:       major, gpa, groupName, supervisorName, examinerName, projectTitle, projectStatus
 *   Supervisor:    department, numberOfGroups (maximum), isAvailable, groupCount, currentGroups
 *   Examiner:      department, groupCount, currentGroups
 *   Administrator: department
 */
export async function getProfile(req, res) {
  res.json(await buildProfile(req.user));
}

/**
 * PUT /api/profile  { name, major? (students), department? (staff) } -> the updated profile
 */
export async function updateProfile(req, res) {
  const user = req.user;

  // Only administrators may change these (a student must not raise their own GPA)
  if (req.body.email !== undefined && normalizeEmail(req.body.email) !== normalizeEmail(user.email)) {
    throw new HttpError(400, 'Only an administrator can change your email address.', { field: 'email' });
  }
  if (req.body.gpa !== undefined) {
    throw new HttpError(400, 'Only an administrator can change your GPA.', { field: 'gpa' });
  }

  requireFields(req.body, { name: 'Name' });
  const name = checkMaxLength(String(req.body.name).trim(), 100, 'Name');

  // undefined = "not sent, keep the current value"
  const major = req.body.major === undefined ? undefined : readOptionalText(req.body.major, 'Major');
  const department =
    req.body.department === undefined ? undefined : readOptionalText(req.body.department, 'Department');

  await withTransaction(async (conn) => {
    await conn.query('UPDATE `user` SET Name = ? WHERE UserID = ?', [name, user.id]);

    if (user.role === 'Student' && major !== undefined) {
      // Insert-or-update, in case the student profile row is missing
      await conn.query(
        `INSERT INTO student (UserID, StudentMajor) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE StudentMajor = VALUES(StudentMajor)`,
        [user.id, major]
      );
    }

    const target = DEPARTMENT_COLUMNS[user.role];
    if (target && department !== undefined) {
      await conn.query(
        `INSERT INTO ${target.table} (UserID, ${target.column}) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE ${target.column} = VALUES(${target.column})`,
        [user.id, department]
      );
    }
  });

  // Reload the user so the answer shows the new name
  const freshUser = await loadUserContext(user.id);
  res.json(await buildProfile(freshUser));
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Optional text of at most 100 characters; empty text is saved as NULL
function readOptionalText(value, label) {
  const text = trimOrNull(value);
  return text === null ? null : checkMaxLength(text, 100, label);
}

// The user (req.user shape) + createdAt + the details of their role
async function buildProfile(user) {
  const rows = await query('SELECT CreatedAt FROM `user` WHERE UserID = ?', [user.id]);
  const profile = { ...toPublicUser(user), createdAt: rows[0]?.CreatedAt ?? null };

  switch (user.role) {
    case 'Student':
      return { ...profile, ...(await getStudentDetails(user.id)) };
    case 'Supervisor':
      return { ...profile, ...(await getSupervisorDetails(user.id)) };
    case 'Examiner':
      return { ...profile, ...(await getExaminerDetails(user.id)) };
    default:
      return { ...profile, ...(await getAdminDetails(user.id)) };
  }
}

// Major, GPA, group, supervisor, examiner and project of a student
async function getStudentDetails(userId) {
  const rows = await query(
    `SELECT s.StudentMajor AS major, s.GPA AS gpa, g.GroupName AS groupName,
            su.Name AS supervisorName, eu.Name AS examinerName,
            p.ProjectTitle AS projectTitle, p.Status AS projectStatus
       FROM student s
       LEFT JOIN project_group g      ON g.GroupID = s.GroupID
       LEFT JOIN supervisor sp        ON sp.SupervisorID = g.SupervisorID
       LEFT JOIN \`user\` su          ON su.UserID = sp.UserID
       LEFT JOIN examiner ex          ON ex.ExaminerID = g.ExaminerID
       LEFT JOIN \`user\` eu          ON eu.UserID = ex.UserID
       LEFT JOIN graduation_project p ON p.GroupID = g.GroupID
      WHERE s.UserID = ?`,
    [userId]
  );
  const row = rows[0] || {};
  return {
    major: row.major ?? null,
    gpa: row.gpa ?? null,
    groupName: row.groupName ?? null,
    supervisorName: row.supervisorName ?? null,
    examinerName: row.examinerName ?? null,
    projectTitle: row.projectTitle ?? null,
    projectStatus: row.projectStatus ?? null,
  };
}

// Department, capacity, availability and current groups of a supervisor
async function getSupervisorDetails(userId) {
  const rows = await query(
    `SELECT SupervisorID, SupervisorDepartment AS department, NumberOfGroups AS numberOfGroups,
            IsAvailable AS isAvailable
       FROM supervisor WHERE UserID = ?`,
    [userId]
  );
  const row = rows[0];
  const currentGroups = row ? await getGroupsWhere('g.SupervisorID = ?', row.SupervisorID) : [];

  return {
    department: row?.department ?? null,
    numberOfGroups: row?.numberOfGroups ?? null,
    isAvailable: row ? toBool(row.isAvailable) : false,
    groupCount: currentGroups.length,
    currentGroups,
  };
}

// Department and groups of an examiner
async function getExaminerDetails(userId) {
  const rows = await query(
    'SELECT ExaminerID, ExaminerDepartment AS department FROM examiner WHERE UserID = ?',
    [userId]
  );
  const row = rows[0];
  const currentGroups = row ? await getGroupsWhere('g.ExaminerID = ?', row.ExaminerID) : [];

  return {
    department: row?.department ?? null,
    groupCount: currentGroups.length,
    currentGroups,
  };
}

// Department of an administrator
async function getAdminDetails(userId) {
  const rows = await query('SELECT AdminDepartment AS department FROM admin WHERE UserID = ?', [userId]);
  return { department: rows[0]?.department ?? null };
}

// Groups (with their project) matching a fixed condition, e.g. 'g.SupervisorID = ?'
function getGroupsWhere(condition, value) {
  return query(
    `SELECT g.GroupID AS id, g.GroupName AS name,
            p.ProjectTitle AS projectTitle, p.Status AS projectStatus,
            (SELECT COUNT(*) FROM student s WHERE s.GroupID = g.GroupID) AS memberCount
       FROM project_group g
       LEFT JOIN graduation_project p ON p.GroupID = g.GroupID
      WHERE ${condition}
      ORDER BY g.GroupName`,
    [value]
  );
}
