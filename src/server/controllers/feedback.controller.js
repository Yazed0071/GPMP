// Structured feedback on submitted work (FR-11, UC13 Give Feedback).
// The group's supervisor (or an administrator) reviews a submission and gives:
//   decision     'Approved' or 'Needs Revision'
//   strengths    what was done well (optional)
//   improvements what to improve (optional)
//   comments     the main feedback text (required)
// The decision also updates the submission and, for the newest submission, the task:
//   Approved -> task 'Completed'      Needs Revision -> task 'In Progress'
// The feedback of an archived project (FR-8) can only be changed by an administrator.

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, toInt, isBlank, trimOrNull } from '../utils/validate.js';
import {
  assertGroupAccess,
  getGroupUserIds,
  isGroupSupervisor,
  assertGroupNotArchived,
} from '../services/access.js';
import { notify } from '../services/notify.js';
import { groupCondition } from './files.controller.js';

export const FEEDBACK_DECISIONS = ['Approved', 'Needs Revision'];

// The task status that each decision leads to
const TASK_STATUS_FOR_DECISION = {
  Approved: 'Completed',
  'Needs Revision': 'In Progress',
};

const FEEDBACK_SELECT = `
  SELECT fb.FeedbackID AS id, fb.SubmissionID AS submissionId,
         s.TaskID AS taskId, t.Title AS taskTitle, s.GroupID AS groupId, g.GroupName AS groupName,
         fb.Decision AS decision, fb.Strengths AS strengths, fb.Improvements AS improvements,
         fb.Comments AS comments, fb.GivenByUserID AS givenById, u.Name AS givenByName,
         fb.CreatedAt AS createdAt, fb.UpdatedAt AS updatedAt
    FROM feedback fb
    JOIN submission s     ON s.SubmissionID = fb.SubmissionID
    JOIN task t           ON t.TaskID = s.TaskID
    JOIN project_group g  ON g.GroupID = s.GroupID
    LEFT JOIN \`user\` u  ON u.UserID = fb.GivenByUserID`;

// ---------------------------------------------------------------------------
// Helpers (getFeedbackBySubmission is also used by the submissions controller)
// ---------------------------------------------------------------------------

function shapeFeedback(row) {
  // UpdatedAt changes automatically on every edit, so a later time means "edited"
  const isEdited =
    row.updatedAt instanceof Date &&
    row.createdAt instanceof Date &&
    row.updatedAt.getTime() - row.createdAt.getTime() > 1000;

  return {
    id: row.id,
    submissionId: row.submissionId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    groupId: row.groupId,
    groupName: row.groupName,
    decision: row.decision,
    strengths: row.strengths,
    improvements: row.improvements,
    comments: row.comments,
    givenBy: row.givenById ? { id: row.givenById, name: row.givenByName } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isEdited,
  };
}

/**
 * The feedback of several submissions, grouped by submission id (oldest first):
 *   { 7: [{ id, decision, strengths, improvements, comments, givenBy, createdAt, ... }] }
 */
export async function getFeedbackBySubmission(submissionIds) {
  const result = {};
  if (submissionIds.length === 0) return result;

  const rows = await query(
    `${FEEDBACK_SELECT} WHERE fb.SubmissionID IN (?) ORDER BY fb.CreatedAt, fb.FeedbackID`,
    [submissionIds]
  );
  for (const row of rows) {
    if (!result[row.submissionId]) result[row.submissionId] = [];
    result[row.submissionId].push(shapeFeedback(row));
  }
  return result;
}

async function findFeedback(feedbackId) {
  const rows = await query(`${FEEDBACK_SELECT} WHERE fb.FeedbackID = ?`, [feedbackId]);
  if (rows.length === 0) throw new HttpError(404, 'Feedback not found');
  return rows[0];
}

// The submission being reviewed, with its task (404 if it does not exist)
async function findSubmission(submissionId) {
  const rows = await query(
    `SELECT s.SubmissionID AS id, s.TaskID AS taskId, s.GroupID AS groupId, t.Title AS taskTitle
       FROM submission s JOIN task t ON t.TaskID = s.TaskID
      WHERE s.SubmissionID = ?`,
    [submissionId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Submission not found');
  return rows[0];
}

// FR-11: only the group's supervisor (or an administrator) reviews submissions
async function assertCanReview(user, groupId) {
  await assertGroupAccess(user, groupId);
  if (user.role === 'Administrator') return;
  if (await isGroupSupervisor(user, groupId)) return;
  throw new HttpError(403, "Only the group's supervisor can give feedback on this submission.");
}

function readDecision(value) {
  if (!FEEDBACK_DECISIONS.includes(value)) {
    throw new HttpError(400, 'Please choose a decision: Approved or Needs Revision.', {
      field: 'decision',
    });
  }
  return value;
}

// UC13 exceptional flow: an empty feedback field is not accepted
function readComments(value) {
  if (isBlank(value)) {
    throw new HttpError(400, 'Please enter your feedback comments.', { field: 'comments' });
  }
  return String(value).trim();
}

/**
 * Saves the decision on the submission and, if it is the task's newest submission,
 * moves the task to the matching status. (Feedback on an older submission must not
 * change a task that already has a newer attempt.)
 */
async function applyDecision(conn, submission, decision) {
  await conn.query('UPDATE submission SET Status = ? WHERE SubmissionID = ?', [decision, submission.id]);

  const [latest] = await conn.query(
    `SELECT SubmissionID FROM submission WHERE TaskID = ?
      ORDER BY SubmissionDate DESC, SubmissionID DESC LIMIT 1`,
    [submission.taskId]
  );
  if (latest[0]?.SubmissionID === submission.id) {
    await conn.query('UPDATE task SET Status = ? WHERE TaskID = ?', [
      TASK_STATUS_FOR_DECISION[decision],
      submission.taskId,
    ]);
  }
}

// Tells the group's students about new or changed feedback
async function notifyStudents(submission, { decision, comments, reviewerName, isUpdate }) {
  const studentIds = await getGroupUserIds(submission.groupId, { supervisor: false });
  const summary =
    decision === 'Approved'
      ? `${reviewerName} approved your submission for "${submission.taskTitle}".`
      : `${reviewerName} asked for changes to your submission for "${submission.taskTitle}".`;

  await notify(studentIds, {
    type: 'Feedback',
    title: isUpdate ? `Feedback updated: ${submission.taskTitle}` : `New feedback: ${submission.taskTitle}`,
    message: `${summary} Comments: ${comments}`,
    link: `/tasks/${submission.taskId}`,
    email: !isUpdate, // UC8: new feedback is also sent by email
  });
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/feedback?groupId=&limit=
 * Recent feedback (newest first) for one group, or for all the user's groups.
 */
export async function listFeedback(req, res) {
  const limit = isBlank(req.query.limit) ? 10 : toInt(req.query.limit, 'Limit', { min: 1, max: 100 });
  const scope = await groupCondition(req.user, req.query.groupId, 's.GroupID');
  if (!scope) return res.json([]);

  const rows = await query(
    `${FEEDBACK_SELECT} WHERE ${scope.sql} ORDER BY fb.CreatedAt DESC, fb.FeedbackID DESC LIMIT ?`,
    [...scope.params, limit]
  );
  res.json(rows.map(shapeFeedback));
}

/**
 * POST /api/feedback { submissionId, decision, strengths?, improvements?, comments }
 * UC13: the supervisor reviews a submission.
 */
export async function createFeedback(req, res) {
  requireFields(req.body, { submissionId: 'Submission' });
  const submission = await findSubmission(toInt(req.body.submissionId, 'Submission id'));
  await assertCanReview(req.user, submission.groupId);
  await assertGroupNotArchived(req.user, submission.groupId); // FR-8

  const decision = readDecision(req.body.decision);
  const comments = readComments(req.body.comments);
  const strengths = trimOrNull(req.body.strengths);
  const improvements = trimOrNull(req.body.improvements);

  const feedbackId = await withTransaction(async (conn) => {
    // Lock the submission so a double click cannot save two feedbacks at the same moment
    await conn.query('SELECT SubmissionID FROM submission WHERE SubmissionID = ? FOR UPDATE', [submission.id]);

    // One feedback per reviewer per submission; UC13 lets them edit it instead
    const [existing] = await conn.query(
      'SELECT 1 FROM feedback WHERE SubmissionID = ? AND GivenByUserID = ?',
      [submission.id, req.user.id]
    );
    if (existing.length > 0) {
      throw new HttpError(409, 'You have already given feedback on this submission. Please edit it instead.');
    }

    const [inserted] = await conn.query(
      `INSERT INTO feedback (SubmissionID, GivenByUserID, Decision, Strengths, Improvements, Comments)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [submission.id, req.user.id, decision, strengths, improvements, comments]
    );
    await applyDecision(conn, submission, decision);
    return inserted.insertId;
  });

  await notifyStudents(submission, { decision, comments, reviewerName: req.user.name, isUpdate: false });

  res.status(201).json(shapeFeedback(await findFeedback(feedbackId)));
}

/**
 * PUT /api/feedback/:id { decision?, strengths?, improvements?, comments? }
 * UC13 alternative flow: the reviewer edits their earlier feedback.
 */
export async function updateFeedback(req, res) {
  const feedbackId = toInt(req.params.id, 'Feedback id');
  const current = await findFeedback(feedbackId);
  await assertGroupAccess(req.user, current.groupId);
  if (current.givenById !== req.user.id) {
    throw new HttpError(403, 'You can only edit your own feedback.');
  }
  await assertGroupNotArchived(req.user, current.groupId); // FR-8

  // Fields that were not sent keep their current value
  const body = req.body;
  const decision = body.decision === undefined ? current.decision : readDecision(body.decision);
  const comments = body.comments === undefined ? current.comments : readComments(body.comments);
  const strengths = body.strengths === undefined ? current.strengths : trimOrNull(body.strengths);
  const improvements = body.improvements === undefined ? current.improvements : trimOrNull(body.improvements);

  const submission = {
    id: current.submissionId,
    taskId: current.taskId,
    groupId: current.groupId,
    taskTitle: current.taskTitle,
  };

  await withTransaction(async (conn) => {
    await conn.query(
      `UPDATE feedback SET Decision = ?, Strengths = ?, Improvements = ?, Comments = ?
        WHERE FeedbackID = ?`,
      [decision, strengths, improvements, comments, feedbackId]
    );
    if (decision !== current.decision) {
      await applyDecision(conn, submission, decision);
    }
  });

  await notifyStudents(submission, { decision, comments, reviewerName: req.user.name, isUpdate: true });

  res.json(shapeFeedback(await findFeedback(feedbackId)));
}
