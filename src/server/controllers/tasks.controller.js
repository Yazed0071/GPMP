// Tasks and milestones (FR-14, UC15 Add Tasks) and the progress summary (UI fig 46).
//
// Who may do what (the same rules are used for the "permissions" sent to the page):
//   - The group's supervisor and administrators manage every task of the group.
//   - Students of the group may add tasks for their own team, edit the tasks they created,
//     and delete them while they have no submissions.
//   - Students move tasks between 'To Do' and 'In Progress'. 'Submitted' is set automatically
//     by a submission (UC5); 'Completed' is set by the supervisor or by an Approved feedback.
//   - Examiners can view tasks but not change them.
//   - The tasks of an archived project (FR-8) are kept as they are: only an administrator
//     can still change them.

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import {
  requireFields,
  toInt,
  toOptionalInt,
  oneOf,
  isBlank,
  isValidDate,
  trimOrNull,
  checkMaxLength,
  toBool,
} from '../utils/validate.js';
import {
  assertGroupAccess,
  getGroupUserIds,
  isGroupSupervisor,
  isGroupArchived,
  assertGroupNotArchived,
} from '../services/access.js';
import { notify } from '../services/notify.js';
import { dateInAppZone } from '../services/reminders.js';
import { groupCondition, removeStoredFiles } from './files.controller.js';
import { getSubmissionsForTask } from './submissions.controller.js';

export const TASK_STATUSES = ['To Do', 'In Progress', 'Submitted', 'Completed'];
const STUDENT_STATUSES = ['To Do', 'In Progress']; // the statuses students may set themselves
const MANAGER_STATUSES = ['To Do', 'In Progress', 'Completed']; // supervisor / administrator

const TASK_SELECT = `
  SELECT t.TaskID AS id, t.GroupID AS groupId, g.GroupName AS groupName,
         t.Title AS title, t.Description AS description, t.DueDate AS dueDate,
         t.Status AS status, t.IsMilestone AS isMilestone,
         t.AssignedToStudentID AS assignedStudentId, au.Name AS assignedName,
         t.CreatedByUserID AS createdById, cu.Name AS createdByName,
         t.CreatedAt AS createdAt, t.UpdatedAt AS updatedAt,
         (SELECT COUNT(*) FROM submission s WHERE s.TaskID = t.TaskID) AS submissionCount,
         (SELECT s.Status FROM submission s WHERE s.TaskID = t.TaskID
           ORDER BY s.SubmissionDate DESC, s.SubmissionID DESC LIMIT 1) AS latestSubmissionStatus
    FROM task t
    JOIN project_group g  ON g.GroupID = t.GroupID
    LEFT JOIN student ast ON ast.StudentID = t.AssignedToStudentID
    LEFT JOIN \`user\` au ON au.UserID = ast.UserID
    LEFT JOIN \`user\` cu ON cu.UserID = t.CreatedByUserID`;

// Earliest due date first; tasks without a due date go last
const TASK_ORDER = 'ORDER BY t.DueDate IS NULL, t.DueDate, t.TaskID';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A task is overdue when its due date has passed and nobody has submitted or finished it
function isTaskOverdue(dueDate, status, today) {
  return Boolean(dueDate) && dueDate < today && STUDENT_STATUSES.includes(status);
}

// Turns a database row into the JSON shape the frontend uses
function shapeTask(row, today = dateInAppZone()) {
  return {
    id: row.id,
    groupId: row.groupId,
    groupName: row.groupName,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    status: row.status,
    isMilestone: toBool(row.isMilestone),
    assignedTo: row.assignedStudentId ? { studentId: row.assignedStudentId, name: row.assignedName } : null,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName } : null,
    submissionCount: row.submissionCount,
    latestSubmissionStatus: row.latestSubmissionStatus,
    isOverdue: isTaskOverdue(row.dueDate, row.status, today),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Loads one task (API shape) or throws 404
async function findTask(taskId) {
  const rows = await query(`${TASK_SELECT} WHERE t.TaskID = ?`, [taskId]);
  if (rows.length === 0) throw new HttpError(404, 'Task not found');
  return shapeTask(rows[0]);
}

// Loads a task from the URL (:id) and checks that the user may access its group
async function findAccessibleTask(req) {
  const task = await findTask(toInt(req.params.id, 'Task id'));
  await assertGroupAccess(req.user, task.groupId);
  return task;
}

// isManager = the group's supervisor or an administrator; isMember = a student of the group
async function getGroupRole(user, groupId) {
  const isManager = user.role === 'Administrator' || (await isGroupSupervisor(user, groupId));
  const isMember = user.role === 'Student' && user.groupId === groupId;
  return { isManager, isMember };
}

// What this user may do with this task (sent to the page and used by the endpoints)
async function getTaskPermissions(user, task) {
  // FR-8: an archived project is read-only for everyone except administrators
  if (user.role !== 'Administrator' && (await isGroupArchived(task.groupId))) {
    return {
      canEdit: false,
      canDelete: false,
      canSubmit: false,
      canGiveFeedback: false,
      canChangeStatus: false,
      allowedStatuses: [],
    };
  }

  const { isManager, isMember } = await getGroupRole(user, task.groupId);
  const isCreator = isMember && task.createdBy?.id === user.id;
  const studentCanMove = isMember && STUDENT_STATUSES.includes(task.status);

  let allowedStatuses = [];
  if (isManager) allowedStatuses = MANAGER_STATUSES;
  else if (studentCanMove) allowedStatuses = STUDENT_STATUSES;

  return {
    canEdit: isManager || isCreator,
    canDelete: isManager || (isCreator && task.submissionCount === 0),
    canSubmit: isMember && task.status !== 'Completed',
    canGiveFeedback: isManager,
    canChangeStatus: allowedStatuses.length > 0,
    allowedStatuses,
  };
}

// UC15 exceptional flow: required task details must be present
function readTitle(value) {
  if (isBlank(value)) throw new HttpError(400, 'Task title is required', { field: 'title' });
  const title = String(value).trim();
  checkMaxLength(title, 200, 'Task title');
  return title;
}

// An optional 'YYYY-MM-DD' due date that is today or later
function readDueDate(value) {
  const dueDate = trimOrNull(value);
  if (dueDate === null) return null;
  if (!isValidDate(dueDate)) {
    throw new HttpError(400, 'Please choose a valid due date.', { field: 'dueDate' });
  }
  if (dueDate < dateInAppZone()) {
    throw new HttpError(400, 'The due date cannot be in the past.', { field: 'dueDate' });
  }
  return dueDate;
}

// An optional assignee, who must be a student of the task's group
async function readAssignee(value, groupId) {
  const studentId = toOptionalInt(value, 'Assigned student');
  if (studentId === null) return null;

  const rows = await query('SELECT 1 FROM student WHERE StudentID = ? AND GroupID = ?', [studentId, groupId]);
  if (rows.length === 0) {
    throw new HttpError(400, 'The assigned student must be a member of this group.', {
      field: 'assignedToStudentId',
    });
  }
  return studentId;
}

// Students default to their own group; staff must choose one (?groupId=)
function requestedGroupId(req) {
  if (isBlank(req.query.groupId) && req.user.role === 'Student') {
    if (!req.user.groupId) throw new HttpError(400, 'You are not in a group yet.');
    return req.user.groupId;
  }
  return req.query.groupId;
}

// Notifies the group's students and supervisor, except the person who did the action
async function notifyGroup(groupId, actorId, notification) {
  const userIds = await getGroupUserIds(groupId, { students: true, supervisor: true });
  await notify(
    userIds.filter((id) => id !== actorId),
    { type: 'Task', ...notification }
  );
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks?groupId=&status=&milestone=
 * Tasks of one group, or of every group the user can access (a student sees their group's).
 */
export async function listTasks(req, res) {
  const scope = await groupCondition(req.user, req.query.groupId, 't.GroupID');
  if (!scope) return res.json([]);

  const conditions = [scope.sql];
  const params = [...scope.params];

  if (!isBlank(req.query.status)) {
    conditions.push('t.Status = ?');
    params.push(oneOf(req.query.status, TASK_STATUSES, 'Status'));
  }
  if (!isBlank(req.query.milestone)) {
    conditions.push('t.IsMilestone = ?');
    params.push(toBool(req.query.milestone) ? 1 : 0);
  }

  const rows = await query(`${TASK_SELECT} WHERE ${conditions.join(' AND ')} ${TASK_ORDER}`, params);
  const today = dateInAppZone();
  res.json(rows.map((row) => shapeTask(row, today)));
}

/**
 * GET /api/tasks/progress?groupId=
 * FR-14: how far the group is - counts per status, percent completed and the milestones.
 */
export async function getProgress(req, res) {
  const groupId = await assertGroupAccess(req.user, requestedGroupId(req));
  const today = dateInAppZone();

  const tasks = await query(
    `SELECT TaskID AS id, Title AS title, DueDate AS dueDate, Status AS status, IsMilestone AS isMilestone
       FROM task t WHERE t.GroupID = ? ${TASK_ORDER}`,
    [groupId]
  );

  const countStatus = (status) => tasks.filter((task) => task.status === status).length;
  const completed = countStatus('Completed');
  const total = tasks.length;

  res.json({
    groupId,
    total,
    toDo: countStatus('To Do'),
    inProgress: countStatus('In Progress'),
    submitted: countStatus('Submitted'),
    completed,
    overdue: tasks.filter((task) => isTaskOverdue(task.dueDate, task.status, today)).length,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    milestones: tasks
      .filter((task) => toBool(task.isMilestone))
      .map((task) => ({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        status: task.status,
        isOverdue: isTaskOverdue(task.dueDate, task.status, today),
      })),
  });
}

/**
 * GET /api/tasks/assignees?groupId=
 * The students of a group, for the "Assign to" drop-down of the task form.
 */
export async function listAssignees(req, res) {
  const groupId = await assertGroupAccess(req.user, requestedGroupId(req));
  const rows = await query(
    `SELECT s.StudentID AS studentId, u.UserID AS userId, u.Name AS name
       FROM student s JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID = ? AND u.IsActive = 1
      ORDER BY u.Name`,
    [groupId]
  );
  res.json(rows);
}

/**
 * GET /api/tasks/:id
 * One task with its submissions (newest first, with files and feedback) and what the user may do.
 */
export async function getTask(req, res) {
  const task = await findAccessibleTask(req);
  const submissions = await getSubmissionsForTask(task.id);
  const permissions = await getTaskPermissions(req.user, task);
  res.json({ ...task, submissions, permissions });
}

/**
 * POST /api/tasks { groupId, title, description?, dueDate?, isMilestone?, assignedToStudentId? }
 * UC15: the supervisor (or an admin, or a student for their own team) adds a task.
 */
export async function createTask(req, res) {
  requireFields(req.body, { groupId: 'Group', title: 'Task title' });
  const groupId = await assertGroupAccess(req.user, req.body.groupId);
  await assertGroupNotArchived(req.user, groupId); // FR-8

  const { isManager, isMember } = await getGroupRole(req.user, groupId);
  if (!isManager && !isMember) {
    throw new HttpError(403, "Only the group's supervisor or its students can add tasks.");
  }

  const title = readTitle(req.body.title);
  const description = trimOrNull(req.body.description);
  const dueDate = readDueDate(req.body.dueDate);
  const isMilestone = toBool(req.body.isMilestone);
  const assignedTo = await readAssignee(req.body.assignedToStudentId, groupId);

  // The task keeps a link to the group's current supervisor (task.SupervisorID)
  const [group] = await query('SELECT SupervisorID FROM project_group WHERE GroupID = ?', [groupId]);

  const result = await query(
    `INSERT INTO task
       (GroupID, SupervisorID, Title, Description, DueDate, Status, IsMilestone, AssignedToStudentID, CreatedByUserID)
     VALUES (?, ?, ?, ?, ?, 'To Do', ?, ?, ?)`,
    [groupId, group.SupervisorID, title, description, dueDate, isMilestone ? 1 : 0, assignedTo, req.user.id]
  );
  const task = await findTask(result.insertId);

  // UC15: "the system stores the task and notifies students"
  await notifyGroup(groupId, req.user.id, {
    title: `New ${isMilestone ? 'milestone' : 'task'}: ${title}`,
    message: `${req.user.name} added "${title}"${dueDate ? ` (due ${dueDate})` : ''}.`,
    link: `/tasks/${task.id}`,
  });

  res.status(201).json(task);
}

/**
 * PUT /api/tasks/:id { title?, description?, dueDate?, isMilestone?, assignedToStudentId? }
 * Fields that are not sent keep their current value. The status is changed with PATCH /status.
 */
export async function updateTask(req, res) {
  const current = await findAccessibleTask(req);
  await assertGroupNotArchived(req.user, current.groupId); // FR-8
  const permissions = await getTaskPermissions(req.user, current);
  if (!permissions.canEdit) throw new HttpError(403, 'You can only edit tasks you created.');

  const body = req.body;
  const title = body.title === undefined ? current.title : readTitle(body.title);
  const description = body.description === undefined ? current.description : trimOrNull(body.description);
  // Keeping the old due date is always fine (even if it has passed); a NEW date must not be in the past
  const dueDate =
    body.dueDate === undefined || body.dueDate === current.dueDate ? current.dueDate : readDueDate(body.dueDate);
  const isMilestone = body.isMilestone === undefined ? current.isMilestone : toBool(body.isMilestone);
  const assignedTo =
    body.assignedToStudentId === undefined
      ? current.assignedTo?.studentId ?? null
      : await readAssignee(body.assignedToStudentId, current.groupId);

  await query(
    `UPDATE task SET Title = ?, Description = ?, DueDate = ?, IsMilestone = ?, AssignedToStudentID = ?
      WHERE TaskID = ?`,
    [title, description, dueDate, isMilestone ? 1 : 0, assignedTo, current.id]
  );

  // A changed deadline matters to the whole team
  if (dueDate !== current.dueDate) {
    await notifyGroup(current.groupId, req.user.id, {
      title: `Due date changed: ${title}`,
      message: dueDate ? `"${title}" is now due on ${dueDate}.` : `"${title}" no longer has a due date.`,
      link: `/tasks/${current.id}`,
    });
  }

  res.json(await findTask(current.id));
}

/**
 * PATCH /api/tasks/:id/status { status }
 * Students: 'To Do' <-> 'In Progress'. Supervisor/admin: 'To Do', 'In Progress' or 'Completed'.
 */
export async function updateTaskStatus(req, res) {
  const task = await findAccessibleTask(req);
  await assertGroupNotArchived(req.user, task.groupId); // FR-8
  requireFields(req.body, ['status']);
  const status = oneOf(req.body.status, TASK_STATUSES, 'Status');

  if (status === 'Submitted') {
    throw new HttpError(400, 'A task becomes "Submitted" automatically when work is submitted.');
  }

  const { isManager, isMember } = await getGroupRole(req.user, task.groupId);
  if (!isManager) {
    if (status === 'Completed') {
      throw new HttpError(403, 'Only the supervisor can mark a task as completed.');
    }
    if (!isMember) throw new HttpError(403, 'You do not have permission to change this task.');
    if (task.status === 'Submitted') {
      throw new HttpError(400, "This task is waiting for your supervisor's review.");
    }
    if (task.status === 'Completed') {
      throw new HttpError(400, 'This task is completed. Only the supervisor can reopen it.');
    }
  }

  await query('UPDATE task SET Status = ? WHERE TaskID = ?', [status, task.id]);

  if (status === 'Completed' && task.status !== 'Completed') {
    await notifyGroup(task.groupId, req.user.id, {
      title: `Task completed: ${task.title}`,
      message: `${req.user.name} marked "${task.title}" as completed.`,
      link: `/tasks/${task.id}`,
    });
  }

  res.json(await findTask(task.id));
}

/**
 * DELETE /api/tasks/:id
 * The supervisor or an admin, or the student who created it while it has no submissions.
 * Its submissions, their feedback and files are deleted too (database cascade + disk).
 */
export async function deleteTask(req, res) {
  const task = await findAccessibleTask(req);
  await assertGroupNotArchived(req.user, task.groupId); // FR-8
  const permissions = await getTaskPermissions(req.user, task);
  if (!permissions.canDelete) {
    const isCreator = task.createdBy?.id === req.user.id;
    throw new HttpError(
      403,
      isCreator && task.submissionCount > 0
        ? 'This task already has submissions, so only the supervisor can delete it.'
        : 'You can only delete tasks you created.'
    );
  }

  // Remember the stored files first: the rows disappear together with the task
  const files = await query(
    `SELECT f.FilePath FROM \`file\` f
       JOIN submission s ON s.SubmissionID = f.SubmissionID
      WHERE s.TaskID = ?`,
    [task.id]
  );

  await query('DELETE FROM task WHERE TaskID = ?', [task.id]);
  await removeStoredFiles(files.map((file) => file.FilePath));

  res.json({ message: 'Task deleted' });
}
