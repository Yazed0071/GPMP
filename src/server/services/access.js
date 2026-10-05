// Answers "who is this user?" and "which groups may they see?".
// Every group-scoped controller uses these helpers so the access rules are the same everywhere:
//   Administrator -> all groups
//   Student       -> only their own group
//   Supervisor    -> the groups they supervise
//   Examiner      -> the groups they examine

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';

/**
 * Loads a user and their role-specific ids fresh from the database.
 * Returns null when the user does not exist or is deactivated.
 * The returned object is what requireAuth puts in req.user:
 *   { id, name, email, role, studentId, supervisorId, examinerId, adminId, groupId, tokenVersion }
 * (tokenVersion is only used to check login tokens; see middleware/auth.js)
 */
export async function loadUserContext(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const rows = await query(
    `SELECT u.UserID AS id, u.Name AS name, u.Email AS email, u.Role AS role, u.IsActive AS isActive,
            u.TokenVersion AS tokenVersion,
            s.StudentID AS studentId, s.GroupID AS groupId,
            sp.SupervisorID AS supervisorId, e.ExaminerID AS examinerId, a.AdminID AS adminId
       FROM \`user\` u
       LEFT JOIN student s     ON s.UserID = u.UserID
       LEFT JOIN supervisor sp ON sp.UserID = u.UserID
       LEFT JOIN examiner e    ON e.UserID = u.UserID
       LEFT JOIN admin a       ON a.UserID = u.UserID
      WHERE u.UserID = ?`,
    [id]
  );

  const row = rows[0];
  if (!row || !row.isActive) return null;

  // Only keep the id that matches the user's role; the others are null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    studentId: row.role === 'Student' ? row.studentId : null,
    supervisorId: row.role === 'Supervisor' ? row.supervisorId : null,
    examinerId: row.role === 'Examiner' ? row.examinerId : null,
    adminId: row.role === 'Administrator' ? row.adminId : null,
    groupId: row.role === 'Student' ? row.groupId : null,
    tokenVersion: row.tokenVersion,
  };
}

// The user as it is sent to the browser (without tokenVersion, which only the server needs)
export function toPublicUser(user) {
  const { tokenVersion, ...publicUser } = user;
  return publicUser;
}

/**
 * Returns the ids of the groups this user may access.
 * null means "all groups" (Administrator). An empty array means "none".
 */
export async function getAccessibleGroupIds(user) {
  if (!user) return [];

  switch (user.role) {
    case 'Administrator':
      return null;
    case 'Student':
      return user.groupId ? [user.groupId] : [];
    case 'Supervisor': {
      const rows = await query('SELECT GroupID FROM project_group WHERE SupervisorID = ?', [
        user.supervisorId,
      ]);
      return rows.map((row) => row.GroupID);
    }
    case 'Examiner': {
      const rows = await query('SELECT GroupID FROM project_group WHERE ExaminerID = ?', [
        user.examinerId,
      ]);
      return rows.map((row) => row.GroupID);
    }
    default:
      return [];
  }
}

// True when the user may access the given group
export async function canAccessGroup(user, groupId) {
  const ids = await getAccessibleGroupIds(user);
  return ids === null || ids.includes(Number(groupId));
}

/**
 * Checks that a group exists and that the user may access it.
 * Throws 400 if no group was given, 404 if it does not exist, 403 if not allowed.
 * Returns the group id as a number, so it can be used directly:
 *   const groupId = await assertGroupAccess(req.user, req.query.groupId);
 */
export async function assertGroupAccess(user, groupId) {
  if (groupId === undefined || groupId === null || groupId === '') {
    throw new HttpError(400, 'Group is required');
  }

  const id = Number(groupId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Group not found');

  const rows = await query('SELECT GroupID FROM project_group WHERE GroupID = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Group not found');

  if (!(await canAccessGroup(user, id))) {
    throw new HttpError(403, 'You do not have access to this group');
  }
  return id;
}

/**
 * Returns the UserIDs of the people in a group (only active accounts), e.g. to notify them.
 * Options choose who is included: students, the supervisor, the examiner.
 * Example: await getGroupUserIds(groupId, { supervisor: false }) -> only the students
 */
export async function getGroupUserIds(groupId, { students = true, supervisor = true, examiner = false } = {}) {
  const ids = new Set();

  if (students) {
    const rows = await query(
      `SELECT s.UserID FROM student s JOIN \`user\` u ON u.UserID = s.UserID
        WHERE s.GroupID = ? AND u.IsActive = 1`,
      [groupId]
    );
    rows.forEach((row) => ids.add(row.UserID));
  }

  if (supervisor) {
    const rows = await query(
      `SELECT sp.UserID FROM project_group g
         JOIN supervisor sp ON sp.SupervisorID = g.SupervisorID
         JOIN \`user\` u ON u.UserID = sp.UserID
        WHERE g.GroupID = ? AND u.IsActive = 1`,
      [groupId]
    );
    rows.forEach((row) => ids.add(row.UserID));
  }

  if (examiner) {
    const rows = await query(
      `SELECT e.UserID FROM project_group g
         JOIN examiner e ON e.ExaminerID = g.ExaminerID
         JOIN \`user\` u ON u.UserID = e.UserID
        WHERE g.GroupID = ? AND u.IsActive = 1`,
      [groupId]
    );
    rows.forEach((row) => ids.add(row.UserID));
  }

  return [...ids];
}

// True when the user is the supervisor of this group
export async function isGroupSupervisor(user, groupId) {
  if (!user || user.role !== 'Supervisor' || !user.supervisorId) return false;
  const rows = await query('SELECT 1 FROM project_group WHERE GroupID = ? AND SupervisorID = ?', [
    groupId,
    user.supervisorId,
  ]);
  return rows.length > 0;
}

// ---------------------------------------------------------------------
// Archived projects (FR-8)
// ---------------------------------------------------------------------

// FR-8: an archived project is the finished record kept in the projects archive
const ARCHIVED_MESSAGE = 'This project is archived. Only the administrator can change it.';

// True when the group's project is archived
export async function isGroupArchived(groupId) {
  const rows = await query(
    "SELECT 1 FROM graduation_project WHERE GroupID = ? AND Status = 'Archived'",
    [groupId]
  );
  return rows.length > 0;
}

// The ids of the groups (from the given list) whose project is archived, e.g. [4]
export async function getArchivedGroupIds(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return [];
  const rows = await query(
    "SELECT GroupID FROM graduation_project WHERE Status = 'Archived' AND GroupID IN (?)",
    [groupIds]
  );
  return rows.map((row) => row.GroupID);
}

/**
 * FR-8: the documents, tasks, submissions, feedback and calendar of an archived project are
 * kept exactly as they were archived, so only an administrator may still change them.
 * Throws 409 for everyone else. (The showcase text and video stay editable, FR-18.)
 * Example: await assertGroupNotArchived(req.user, groupId);
 */
export async function assertGroupNotArchived(user, groupId) {
  if (user.role === 'Administrator') return;
  if (await isGroupArchived(groupId)) throw new HttpError(409, ARCHIVED_MESSAGE);
}
