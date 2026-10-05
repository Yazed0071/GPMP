// Student groups (UC10 Manage Groups, FR-4 view project information).
// Everyone can list and open the groups they have access to; only the administrator
// creates, edits and deletes groups.

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, toInt, toOptionalInt, checkMaxLength } from '../utils/validate.js';
import { getAccessibleGroupIds, assertGroupAccess, getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';
import { refreshUserRooms } from '../socket.js';
import { deleteStoredFile } from '../utils/paths.js';
import {
  FINISHED_STATUSES,
  OPEN_PROPOSAL_STATUSES,
  toProject,
  findProjectByGroupId,
} from './projects.controller.js';
import { findProposals } from './proposals.controller.js';
import { countSupervisorGroups } from './supervisors.controller.js';

// One row per group with its supervisor, examiner and project (if any)
const GROUP_SELECT = `
  SELECT g.GroupID AS id, g.GroupName AS name, g.CreatedAt AS createdAt,
         g.SupervisorID AS supervisorId, sp.UserID AS supervisorUserId, su.Name AS supervisorName,
         su.Email AS supervisorEmail, sp.SupervisorDepartment AS supervisorDepartment,
         g.ExaminerID AS examinerId, ex.UserID AS examinerUserId, eu.Name AS examinerName,
         eu.Email AS examinerEmail, ex.ExaminerDepartment AS examinerDepartment,
         p.ProjectID AS projectId, p.ProjectTitle AS projectTitle, p.Status AS projectStatus
    FROM project_group g
    LEFT JOIN supervisor sp        ON sp.SupervisorID = g.SupervisorID
    LEFT JOIN \`user\` su          ON su.UserID = sp.UserID
    LEFT JOIN examiner ex          ON ex.ExaminerID = g.ExaminerID
    LEFT JOIN \`user\` eu          ON eu.UserID = ex.UserID
    LEFT JOIN graduation_project p ON p.GroupID = g.GroupID`;

// ---------------------------------------------------------------------
// Loading group summaries
// ---------------------------------------------------------------------

// Members of the given groups: Map groupId -> [{ studentId, userId, name, email, major }]
async function getMembersByGroup(groupIds) {
  const rows = await query(
    `SELECT s.GroupID AS groupId, s.StudentID AS studentId, s.UserID AS userId,
            u.Name AS name, u.Email AS email, s.StudentMajor AS major
       FROM student s JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID IN (?)
      ORDER BY u.Name`,
    [groupIds]
  );
  const map = new Map();
  for (const { groupId, ...member } of rows) {
    if (!map.has(groupId)) map.set(groupId, []);
    map.get(groupId).push(member);
  }
  return map;
}

// Task progress of the given groups: Map groupId -> { total, completed, percent }
async function getProgressByGroup(groupIds) {
  const rows = await query(
    `SELECT GroupID AS groupId, COUNT(*) AS total, SUM(Status = 'Completed') AS completed
       FROM task WHERE GroupID IN (?) GROUP BY GroupID`,
    [groupIds]
  );
  const map = new Map();
  for (const row of rows) {
    const completed = Number(row.completed) || 0;
    map.set(row.groupId, {
      total: row.total,
      completed,
      percent: row.total > 0 ? Math.round((completed / row.total) * 100) : 0,
    });
  }
  return map;
}

// Status of the newest proposal of each project: Map projectId -> status
async function getLatestProposalStatus(projectIds) {
  if (projectIds.length === 0) return new Map();
  const rows = await query(
    `SELECT ProjectID AS projectId, Status AS status FROM proposal
      WHERE ProjectID IN (?)
      ORDER BY ProposalTime DESC, ProposalID DESC`,
    [projectIds]
  );
  const map = new Map();
  // Rows are newest first, so the first status seen for a project is its latest one
  for (const row of rows) {
    if (!map.has(row.projectId)) map.set(row.projectId, row.status);
  }
  return map;
}

// Builds the { id, userId, name, email, department } object of a supervisor or examiner
function toPerson(id, userId, name, email, department) {
  return id ? { id, userId, name, email, department } : null;
}

/**
 * Loads the summary of several groups (null = all groups), ordered by name:
 * { id, name, createdAt, supervisor, examiner, members, project, progress, latestProposalStatus }
 */
async function getGroupSummaries(groupIds) {
  if (Array.isArray(groupIds) && groupIds.length === 0) return [];

  const where = groupIds === null ? '' : 'WHERE g.GroupID IN (?)';
  const rows = await query(`${GROUP_SELECT} ${where} ORDER BY g.GroupName`, groupIds === null ? [] : [groupIds]);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const projectIds = rows.filter((row) => row.projectId).map((row) => row.projectId);
  const [members, progress, proposalStatus] = await Promise.all([
    getMembersByGroup(ids),
    getProgressByGroup(ids),
    getLatestProposalStatus(projectIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    supervisor: toPerson(
      row.supervisorId,
      row.supervisorUserId,
      row.supervisorName,
      row.supervisorEmail,
      row.supervisorDepartment
    ),
    examiner: toPerson(row.examinerId, row.examinerUserId, row.examinerName, row.examinerEmail, row.examinerDepartment),
    members: members.get(row.id) || [],
    project: row.projectId ? { id: row.projectId, title: row.projectTitle, status: row.projectStatus } : null,
    progress: progress.get(row.id) || { total: 0, completed: 0, percent: 0 },
    latestProposalStatus: row.projectId ? proposalStatus.get(row.projectId) || null : null,
  }));
}

// The 5 newest files of a group (showcase videos are shown in the showcase section instead)
async function getRecentDocuments(groupId) {
  return query(
    `SELECT f.FileID AS id, f.FileName AS name, f.Category AS category, f.Version AS version,
            f.FileSize AS size, f.UploadDate AS uploadedAt, u.Name AS uploadedBy
       FROM \`file\` f LEFT JOIN \`user\` u ON u.UserID = f.UploadedByUserID
      WHERE f.GroupID = ? AND f.Category <> 'Showcase'
      ORDER BY f.UploadDate DESC, f.FileID DESC
      LIMIT 5`,
    [groupId]
  );
}

// The next 3 events of the group's calendar and the shared academic calendar
async function getUpcomingEvents(groupId) {
  const rows = await query(
    `SELECT d.DeadlineID AS id, d.Title AS title, d.DeadlineType AS type, d.DeadlinePriority AS priority,
            d.EventDate AS eventDate, d.EndDate AS endDate, d.Location AS location,
            (c.GroupID IS NULL) AS isShared
       FROM important_date d
       JOIN calendar c ON c.CalendarID = d.CalendarID
      WHERE (c.GroupID = ? OR c.GroupID IS NULL)
        AND COALESCE(d.EndDate, d.EventDate) >= NOW()
      ORDER BY d.EventDate
      LIMIT 3`,
    [groupId]
  );
  return rows.map((row) => ({ ...row, isShared: Boolean(row.isShared) }));
}

/**
 * What the current user may do on the group page. The frontend uses these flags to show
 * only the buttons that will work; the endpoints still check every rule again.
 */
function getGroupPermissions(user, group, project, proposals) {
  const isAdmin = user.role === 'Administrator';
  const isMember = user.role === 'Student' && user.groupId === group.id;
  const isSupervisor = user.role === 'Supervisor' && group.supervisor?.id === user.supervisorId;

  const hasOpenProposal = proposals.some((p) => OPEN_PROPOSAL_STATUSES.includes(p.status));
  const supervisorLocked = proposals.some((p) => p.status === 'Pending Examiner' || p.status === 'Approved');
  const isFinished = Boolean(project) && FINISHED_STATUSES.includes(project.status);

  return {
    canManageGroup: isAdmin,
    canCreateProject: isMember && !project,
    canEditProject: Boolean(project) && (isAdmin || isSupervisor || (isMember && !hasOpenProposal)),
    canSubmitProposal: isMember && Boolean(project) && Boolean(group.supervisor) && !hasOpenProposal && !isFinished,
    canChooseSupervisor: isMember && !supervisorLocked,
    canChangeStatus:
      Boolean(project) &&
      (isAdmin || (isSupervisor && ['In Progress', 'Completed'].includes(project.status))),
    canArchive: Boolean(project) && project.status === 'Completed' && (isAdmin || isSupervisor),
    canEditShowcase: isMember && isFinished,
  };
}

// ---------------------------------------------------------------------
// Checking the create / edit form (UC10)
// ---------------------------------------------------------------------

// UC10 exceptional flow: two groups cannot have the same name
async function assertUniqueName(name, groupId = null) {
  const rows = await query('SELECT GroupID FROM project_group WHERE GroupName = ? AND GroupID <> ?', [
    name,
    groupId || 0,
  ]);
  if (rows.length > 0) throw new HttpError(409, 'A group with this name already exists');
}

// The chosen supervisor must exist, be active and still have a free place (FR-5 capacity)
async function assertSupervisorHasRoom(supervisorId, groupId = null) {
  const rows = await query(
    `SELECT sp.NumberOfGroups, u.Name, u.IsActive FROM supervisor sp JOIN \`user\` u ON u.UserID = sp.UserID
      WHERE sp.SupervisorID = ?`,
    [supervisorId]
  );
  if (rows.length === 0) throw new HttpError(400, 'The selected supervisor was not found.');
  // A deactivated supervisor would never see the group or its notifications
  if (!rows[0].IsActive) throw new HttpError(400, 'This supervisor account is deactivated.');

  const current = await countSupervisorGroups(supervisorId, groupId);
  if (current >= rows[0].NumberOfGroups) {
    throw new HttpError(
      409,
      `${rows[0].Name} already supervises ${current} groups, which is the maximum (${rows[0].NumberOfGroups}).`
    );
  }
}

async function assertExaminerExists(examinerId) {
  const rows = await query('SELECT ExaminerID FROM examiner WHERE ExaminerID = ?', [examinerId]);
  if (rows.length === 0) throw new HttpError(400, 'The selected examiner was not found.');
}

// Every chosen student must exist and must not already be in ANOTHER group
async function assertStudentsAreFree(studentIds, groupId = null) {
  if (studentIds.length === 0) return;
  const rows = await query(
    `SELECT s.StudentID, s.GroupID, u.Name, g.GroupName
       FROM student s
       JOIN \`user\` u ON u.UserID = s.UserID
       LEFT JOIN project_group g ON g.GroupID = s.GroupID
      WHERE s.StudentID IN (?)`,
    [studentIds]
  );
  if (rows.length !== studentIds.length) {
    throw new HttpError(400, 'One of the selected students was not found.');
  }
  const taken = rows.find((row) => row.GroupID !== null && row.GroupID !== groupId);
  if (taken) {
    throw new HttpError(409, `${taken.Name} is already in the group "${taken.GroupName}".`);
  }
}

/**
 * Reads and checks { name, supervisorId, examinerId, studentIds } from the request body.
 * For an edit (current = the existing group), fields that were not sent keep their value;
 * studentIds is null then, meaning "keep the current members".
 */
async function readGroupForm(body, current = null) {
  const groupId = current ? current.id : null;

  let name = current ? current.name : null;
  if (!current || body.name !== undefined) {
    requireFields(body, { name: 'Group name' });
    name = String(body.name).trim();
    checkMaxLength(name, 100, 'Group name');
    await assertUniqueName(name, groupId);
  }

  let supervisorId = current ? current.supervisorId : null;
  if (body.supervisorId !== undefined) {
    supervisorId = toOptionalInt(body.supervisorId, 'Supervisor');
    // Only check the capacity when the supervisor changes
    if (supervisorId !== null && supervisorId !== current?.supervisorId) {
      await assertSupervisorHasRoom(supervisorId, groupId);
    }
  }

  let examinerId = current ? current.examinerId : null;
  if (body.examinerId !== undefined) {
    examinerId = toOptionalInt(body.examinerId, 'Examiner');
    if (examinerId !== null) await assertExaminerExists(examinerId);
  }

  let studentIds = current ? null : [];
  if (body.studentIds !== undefined) {
    if (!Array.isArray(body.studentIds)) throw new HttpError(400, 'Students must be a list');
    studentIds = [...new Set(body.studentIds.map((id) => toInt(id, 'Student id')))];
    await assertStudentsAreFree(studentIds, groupId);
  }

  return { name, supervisorId, examinerId, studentIds };
}

/**
 * Makes the group's members exactly `studentIds` (inside a transaction).
 * Students removed from the list become group-less.
 */
async function saveMembers(conn, groupId, studentIds) {
  if (studentIds.length === 0) {
    await conn.query('UPDATE student SET GroupID = NULL WHERE GroupID = ?', [groupId]);
    return;
  }
  await conn.query('UPDATE student SET GroupID = NULL WHERE GroupID = ? AND StudentID NOT IN (?)', [
    groupId,
    studentIds,
  ]);
  // "GroupID IS NULL" makes sure we never take a student from another group
  await conn.query(
    'UPDATE student SET GroupID = ? WHERE StudentID IN (?) AND (GroupID IS NULL OR GroupID = ?)',
    [groupId, studentIds, groupId]
  );

  // If someone put one of these students in another group a moment ago, undo everything
  const [countRows] = await conn.query(
    'SELECT COUNT(*) AS total FROM student WHERE GroupID = ? AND StudentID IN (?)',
    [groupId, studentIds]
  );
  if (countRows[0].total !== studentIds.length) {
    throw new HttpError(409, 'One of the students was just added to another group. Please refresh and try again.');
  }
}

// The group row as stored (ids only), or a 404
async function findGroupRow(groupIdParam) {
  const groupId = toInt(groupIdParam, 'Group id');
  const rows = await query(
    'SELECT GroupID AS id, GroupName AS name, SupervisorID AS supervisorId, ExaminerID AS examinerId FROM project_group WHERE GroupID = ?',
    [groupId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Group not found');
  return rows[0];
}

// StudentID -> UserID for the given students
async function getStudentUserIds(studentIds) {
  if (studentIds.length === 0) return [];
  const rows = await query('SELECT UserID FROM student WHERE StudentID IN (?)', [studentIds]);
  return rows.map((row) => row.UserID);
}

async function getSupervisorUserId(supervisorId) {
  if (!supervisorId) return null;
  const rows = await query('SELECT UserID FROM supervisor WHERE SupervisorID = ?', [supervisorId]);
  return rows[0]?.UserID || null;
}

async function getExaminerUserId(examinerId) {
  if (!examinerId) return null;
  const rows = await query('SELECT UserID FROM examiner WHERE ExaminerID = ?', [examinerId]);
  return rows[0]?.UserID || null;
}

// True when the group's proposal waits for an examiner (so a new examiner has work to do)
async function hasProposalWaitingForExaminer(groupId) {
  const rows = await query(
    `SELECT 1 FROM proposal pr JOIN graduation_project p ON p.ProjectID = pr.ProjectID
      WHERE p.GroupID = ? AND pr.Status = 'Pending Examiner' LIMIT 1`,
    [groupId]
  );
  return rows.length > 0;
}

/**
 * Sends the notifications after a group was created or edited, and moves the affected
 * users into the right live-chat rooms. `before` is null for a new group.
 */
async function announceGroupChanges(groupId, name, before, after) {
  const oldStudents = before ? before.studentIds : [];
  const newStudents = after.studentIds ?? oldStudents;
  const addedStudents = newStudents.filter((id) => !oldStudents.includes(id));
  const removedStudents = oldStudents.filter((id) => !newStudents.includes(id));

  const addedUserIds = await getStudentUserIds(addedStudents);
  const removedUserIds = await getStudentUserIds(removedStudents);

  await notify(addedUserIds, {
    type: 'System',
    title: `You were added to the group "${name}"`,
    message: 'You can now see your group, project and team on the My Project page.',
    link: '/project',
  });
  await notify(removedUserIds, {
    type: 'System',
    title: `You were removed from the group "${name}"`,
    message: 'Please contact the administrator if this is not expected.',
    link: '/dashboard',
  });

  const affectedUserIds = [...addedUserIds, ...removedUserIds];

  // A new or changed supervisor
  const oldSupervisorId = before ? before.supervisorId : null;
  if (after.supervisorId !== oldSupervisorId) {
    const newUserId = await getSupervisorUserId(after.supervisorId);
    const oldUserId = await getSupervisorUserId(oldSupervisorId);
    await notify(newUserId, {
      type: 'System',
      title: `You were assigned as the supervisor of "${name}"`,
      link: `/groups/${groupId}`,
    });
    await notify(oldUserId, {
      type: 'System',
      title: `You are no longer the supervisor of "${name}"`,
      link: '/groups',
    });
    affectedUserIds.push(newUserId, oldUserId);
  }

  // A new or changed examiner
  const oldExaminerId = before ? before.examinerId : null;
  if (after.examinerId !== oldExaminerId) {
    const newUserId = await getExaminerUserId(after.examinerId);
    const oldUserId = await getExaminerUserId(oldExaminerId);
    const waiting = await hasProposalWaitingForExaminer(groupId);
    await notify(newUserId, {
      type: waiting ? 'Proposal' : 'System',
      title: `You were assigned as the examiner of "${name}"`,
      message: waiting ? 'A proposal from this group is waiting for your review.' : null,
      link: waiting ? '/proposals' : `/groups/${groupId}`,
    });
    await notify(oldUserId, {
      type: 'System',
      title: `You are no longer the examiner of "${name}"`,
      link: '/groups',
    });
    affectedUserIds.push(newUserId, oldUserId);
  }

  // Live chat follows the new membership without logging out
  for (const userId of new Set(affectedUserIds.filter(Boolean))) {
    await refreshUserRooms(userId);
  }
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

/**
 * GET /api/groups
 * The groups the user can access (all groups for administrators), with members,
 * supervisor, examiner, project and task progress.
 */
export async function listGroups(req, res) {
  const groupIds = await getAccessibleGroupIds(req.user);
  res.json(await getGroupSummaries(groupIds));
}

/**
 * GET /api/groups/available-students   (Administrator)
 * Active students who are not in any group yet (for the create / edit group form).
 */
export async function listAvailableStudents(req, res) {
  const rows = await query(
    `SELECT s.StudentID AS studentId, s.UserID AS userId, u.Name AS name, u.Email AS email,
            s.StudentMajor AS major
       FROM student s JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID IS NULL AND u.IsActive = 1
      ORDER BY u.Name`
  );
  res.json(rows);
}

/**
 * GET /api/groups/:id
 * FR-4: everything about one group - members, supervisor, examiner, the full project,
 * its proposals with feedback, recent documents, upcoming events and the user's permissions.
 */
export async function getGroup(req, res) {
  const groupId = await assertGroupAccess(req.user, req.params.id);
  const [group] = await getGroupSummaries([groupId]);

  const projectRow = await findProjectByGroupId(groupId);
  const project = toProject(projectRow);
  const proposals = project ? await findProposals(req.user, { projectId: project.id }) : [];
  const [recentDocuments, upcomingEvents] = await Promise.all([
    getRecentDocuments(groupId),
    getUpcomingEvents(groupId),
  ]);

  res.json({
    ...group,
    project,
    proposals,
    recentDocuments,
    upcomingEvents,
    permissions: getGroupPermissions(req.user, group, project, proposals),
  });
}

/**
 * POST /api/groups  { name, supervisorId?, examinerId?, studentIds: [] }   (Administrator)
 * UC10: creates a group, puts the chosen students in it and creates its calendar.
 */
export async function createGroup(req, res) {
  const form = await readGroupForm(req.body);

  const groupId = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO project_group (GroupName, SupervisorID, ExaminerID, CreatedByAdminID) VALUES (?, ?, ?, ?)',
      [form.name, form.supervisorId, form.examinerId, req.user.adminId]
    );
    const newGroupId = result.insertId;

    await saveMembers(conn, newGroupId, form.studentIds);
    // Every group has its own calendar for meetings and deadlines (FR-13)
    await conn.query('INSERT INTO calendar (GroupID) VALUES (?)', [newGroupId]);
    return newGroupId;
  });

  await announceGroupChanges(groupId, form.name, null, form);

  const [group] = await getGroupSummaries([groupId]);
  res.status(201).json(group);
}

/**
 * PUT /api/groups/:id  { name?, supervisorId?, examinerId?, studentIds? }   (Administrator)
 * UC10 alternative flow: edits the group. Fields that are not sent stay the same;
 * studentIds replaces the whole member list; supervisorId / examinerId null removes them.
 */
export async function updateGroup(req, res) {
  const current = await findGroupRow(req.params.id);
  const memberRows = await query('SELECT StudentID FROM student WHERE GroupID = ?', [current.id]);
  const before = { ...current, studentIds: memberRows.map((row) => row.StudentID) };

  const form = await readGroupForm(req.body, current);

  await withTransaction(async (conn) => {
    await conn.query(
      'UPDATE project_group SET GroupName = ?, SupervisorID = ?, ExaminerID = ? WHERE GroupID = ?',
      [form.name, form.supervisorId, form.examinerId, current.id]
    );
    if (form.studentIds !== null) await saveMembers(conn, current.id, form.studentIds);
  });

  await announceGroupChanges(current.id, form.name, before, form);

  const [group] = await getGroupSummaries([current.id]);
  res.json(group);
}

/**
 * DELETE /api/groups/:id   (Administrator)
 * UC10: deletes a group. Its students become group-less; its project, tasks, files,
 * calendar and chat are deleted with it. Groups with a completed or archived project are
 * kept, because the archive must be preserved (FR-8, FR-19).
 */
export async function deleteGroup(req, res) {
  const group = await findGroupRow(req.params.id);

  const project = await findProjectByGroupId(group.id);
  if (project && FINISHED_STATUSES.includes(project.status)) {
    throw new HttpError(
      409,
      'This group has a completed or archived project, so it is kept for the projects archive and cannot be deleted.'
    );
  }

  // Remember who to tell and which stored files to remove before the rows disappear
  const userIds = await getGroupUserIds(group.id, { students: true, supervisor: true, examiner: true });
  const storedFiles = await query(
    `SELECT FilePath FROM \`file\`
      WHERE GroupID = ? OR SubmissionID IN (SELECT SubmissionID FROM submission WHERE GroupID = ?)`,
    [group.id, group.id]
  );

  // ON DELETE CASCADE removes the project, proposals, tasks, files, calendar and chat;
  // ON DELETE SET NULL makes the students group-less
  await query('DELETE FROM project_group WHERE GroupID = ?', [group.id]);

  // The database rows are gone, so remove the files from the disk too
  for (const file of storedFiles) await deleteStoredFile(file.FilePath);
  if (project?.showcaseVideoPath) await deleteStoredFile(project.showcaseVideoPath);

  await notify(userIds, {
    type: 'System',
    title: `The group "${group.name}" was deleted`,
    message: 'Please contact the administrator if you have questions.',
    link: '/dashboard',
  });
  for (const userId of userIds) await refreshUserRooms(userId);

  res.json({ message: 'Group deleted' });
}
