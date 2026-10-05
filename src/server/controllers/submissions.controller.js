// Task submissions (UC5 Submit Tasks).
// A student of the task's group submits their work: up to 5 files and/or a link
// (e.g. GitHub or Google Drive) plus optional notes. The task then becomes 'Submitted'
// and the supervisor is notified so they can review it (UC13 feedback).
// The tasks of an archived project (FR-8) cannot receive new submissions.

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import {
  requireFields,
  toInt,
  oneOf,
  isBlank,
  trimOrNull,
  checkMaxLength,
} from '../utils/validate.js';
import { assertGroupAccess, getGroupUserIds, assertGroupNotArchived } from '../services/access.js';
import { notify } from '../services/notify.js';
import { dateInAppZone } from '../services/reminders.js';
import { getFileInfo } from '../middleware/upload.js';
import { groupCondition, getFilesBySubmission, nextFileVersion, lockGroupRow } from './files.controller.js';
import { getFeedbackBySubmission } from './feedback.controller.js';

export const SUBMISSION_STATUSES = ['Submitted', 'Approved', 'Needs Revision'];

const SUBMISSION_SELECT = `
  SELECT s.SubmissionID AS id, s.TaskID AS taskId, t.Title AS taskTitle, t.Status AS taskStatus,
         s.GroupID AS groupId, g.GroupName AS groupName,
         s.SubmittedByStudentID AS studentId, su.UserID AS studentUserId, su.Name AS studentName,
         s.SubmissionDate AS submissionDate, s.SubmissionDeadline AS deadline,
         s.SubmissionSource AS source, s.Status AS status, s.Notes AS notes,
         (SELECT COUNT(*) FROM \`file\` f WHERE f.SubmissionID = s.SubmissionID) AS fileCount,
         (SELECT COUNT(*) FROM feedback fb WHERE fb.SubmissionID = s.SubmissionID) AS feedbackCount
    FROM submission s
    JOIN task t          ON t.TaskID = s.TaskID
    JOIN project_group g ON g.GroupID = s.GroupID
    LEFT JOIN student st ON st.StudentID = s.SubmittedByStudentID
    LEFT JOIN \`user\` su ON su.UserID = st.UserID`;

// ---------------------------------------------------------------------------
// Helpers (getSubmissionsForTask is also used by tasks.controller.js)
// ---------------------------------------------------------------------------

// A submission is late when it was made after the day of its deadline
// (the day in the university's time zone, the same "today" as the calendar and reminders)
function isLateSubmission(row) {
  if (!row.deadline || !(row.submissionDate instanceof Date)) return false;
  return dateInAppZone(row.submissionDate) > row.deadline;
}

function shapeSubmission(row) {
  return {
    id: row.id,
    taskId: row.taskId,
    task: { id: row.taskId, title: row.taskTitle, status: row.taskStatus },
    groupId: row.groupId,
    groupName: row.groupName,
    submittedBy: row.studentId
      ? { studentId: row.studentId, userId: row.studentUserId, name: row.studentName }
      : null,
    submissionDate: row.submissionDate,
    deadline: row.deadline,
    source: row.source,
    status: row.status,
    notes: row.notes,
    fileCount: row.fileCount,
    feedbackCount: row.feedbackCount,
    isLate: isLateSubmission(row),
  };
}

// Adds each submission's files and feedback (2 extra queries for the whole list)
async function addFilesAndFeedback(rows) {
  const ids = rows.map((row) => row.id);
  const filesById = await getFilesBySubmission(ids);
  const feedbackById = await getFeedbackBySubmission(ids);

  return rows.map((row) => ({
    ...shapeSubmission(row),
    files: filesById[row.id] || [],
    feedback: feedbackById[row.id] || [],
  }));
}

// All submissions of a task, newest first, with their files and feedback
export async function getSubmissionsForTask(taskId) {
  const rows = await query(
    `${SUBMISSION_SELECT} WHERE s.TaskID = ? ORDER BY s.SubmissionDate DESC, s.SubmissionID DESC`,
    [taskId]
  );
  return addFilesAndFeedback(rows);
}

// The optional link must be a web address
function readSource(value) {
  const link = trimOrNull(value);
  if (link === null) return null;
  if (!/^https?:\/\/\S+$/i.test(link)) {
    throw new HttpError(400, 'The link must start with http:// or https://', { field: 'source' });
  }
  checkMaxLength(link, 255, 'The link');
  return link;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/submissions?groupId=&status=
 * The review queue for staff (e.g. status=Submitted) and the group's history for students.
 * status=Submitted lists only the work that still waits for review: the newest submission of
 * each task that is 'Submitted' (an older attempt the student replaced is not listed).
 */
export async function listSubmissions(req, res) {
  const scope = await groupCondition(req.user, req.query.groupId, 's.GroupID');
  if (!scope) return res.json([]);

  const conditions = [scope.sql];
  const params = [...scope.params];
  if (!isBlank(req.query.status)) {
    const status = oneOf(req.query.status, SUBMISSION_STATUSES, 'Status');
    conditions.push('s.Status = ?');
    params.push(status);
    if (status === 'Submitted') {
      conditions.push(`t.Status = 'Submitted'
        AND s.SubmissionID = (SELECT s2.SubmissionID FROM submission s2 WHERE s2.TaskID = s.TaskID
                               ORDER BY s2.SubmissionDate DESC, s2.SubmissionID DESC LIMIT 1)`);
    }
  }

  const rows = await query(
    `${SUBMISSION_SELECT} WHERE ${conditions.join(' AND ')}
      ORDER BY s.SubmissionDate DESC, s.SubmissionID DESC`,
    params
  );
  res.json(rows.map(shapeSubmission));
}

/**
 * GET /api/submissions/:id
 * One submission with its files and feedback.
 */
export async function getSubmission(req, res) {
  const submissionId = toInt(req.params.id, 'Submission id');
  const rows = await query(`${SUBMISSION_SELECT} WHERE s.SubmissionID = ?`, [submissionId]);
  if (rows.length === 0) throw new HttpError(404, 'Submission not found');
  await assertGroupAccess(req.user, rows[0].groupId);

  const [submission] = await addFilesAndFeedback(rows);
  res.json(submission);
}

/**
 * POST /api/submissions  (multipart: up to 5 "files" + taskId, notes?, source?)
 * UC5: a student of the task's group submits work. Only students reach this (see the route).
 */
export async function createSubmission(req, res) {
  requireFields(req.body, { taskId: 'Task' });
  const taskId = toInt(req.body.taskId, 'Task id');

  const [task] = await query('SELECT TaskID, GroupID, Title, Status, DueDate FROM task WHERE TaskID = ?', [
    taskId,
  ]);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertGroupAccess(req.user, task.GroupID); // students can only reach their own group
  await assertGroupNotArchived(req.user, task.GroupID); // FR-8

  if (task.Status === 'Completed') {
    throw new HttpError(400, 'This task is already completed, so it cannot receive new submissions.');
  }

  const source = readSource(req.body.source);
  const notes = trimOrNull(req.body.notes);
  const files = req.files || [];
  if (files.length === 0 && !source) {
    throw new HttpError(400, 'Please attach a file or add a link.');
  }

  // UC5 says a late submission "may" be rejected: GPMP accepts it but marks it as late,
  // so the supervisor can decide. SubmissionDeadline keeps the due date at this moment.
  const submissionId = await withTransaction(async (conn) => {
    // Lock the group row, so file versions cannot clash with another upload at the same moment
    await lockGroupRow(conn, task.GroupID);
    const [inserted] = await conn.query(
      `INSERT INTO submission
         (TaskID, GroupID, SubmittedByStudentID, SubmissionDeadline, SubmissionSource, Status, Notes)
       VALUES (?, ?, ?, ?, ?, 'Submitted', ?)`,
      [taskId, task.GroupID, req.user.studentId, task.DueDate, source, notes]
    );

    // Save every attached file as a 'Submission' file of the group
    for (const uploaded of files) {
      const info = getFileInfo(uploaded);
      const version = await nextFileVersion(conn, task.GroupID, info.fileName, 'Submission');
      await conn.query(
        `INSERT INTO \`file\`
           (SubmissionID, GroupID, UploadedByUserID, FileName, FilePath, FileSize, MimeType, Category, Version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Submission', ?)`,
        [inserted.insertId, task.GroupID, req.user.id, info.fileName, info.filePath, info.fileSize, info.mimeType, version]
      );
    }

    await conn.query("UPDATE task SET Status = 'Submitted' WHERE TaskID = ?", [taskId]);
    return inserted.insertId;
  });

  const rows = await query(`${SUBMISSION_SELECT} WHERE s.SubmissionID = ?`, [submissionId]);
  const [submission] = await addFilesAndFeedback(rows);

  // Tell the supervisor there is new work to review
  const supervisorIds = await getGroupUserIds(task.GroupID, { students: false, supervisor: true });
  await notify(supervisorIds, {
    type: 'Task',
    title: `New submission: ${task.Title}`,
    message: `${req.user.name} submitted work for "${task.Title}"${submission.isLate ? ' after the due date' : ''}.`,
    link: `/tasks/${taskId}`,
  });

  res.status(201).json(submission);
}
