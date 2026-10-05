// Project proposals and their two-step review (FR-6, FR-7, UC16 Evaluate Proposal,
// UC17 Proposal Feedback).
//
// The review flow:
//   student submits          -> 'Pending Supervisor'
//   supervisor approves      -> 'Pending Examiner'
//   examiner approves        -> 'Approved'  (the project becomes 'In Progress')
//   any reviewer rejects     -> 'Rejected'
//   the administrator may approve or reject directly at either pending stage (FR-6).
// Every decision needs feedback for the students (UC16 / UC17 exceptional flow).
// The person who reviewed each stage is saved (SupervisorReviewedByUserID /
// ExaminerReviewedByUserID), so only they may edit that feedback later and the timeline
// shows who really wrote it (the administrator, when the admin decided at that stage).

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import {
  requireFields,
  toInt,
  oneOf,
  isBlank,
  isValidDate,
  trimOrNull,
  checkMaxLength,
} from '../utils/validate.js';
import { getAccessibleGroupIds, assertGroupAccess, getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';
import { FINISHED_STATUSES, OPEN_PROPOSAL_STATUSES, findProjectById } from './projects.controller.js';

// The values allowed by the CHECK constraint on proposal.Status
export const PROPOSAL_STATUSES = ['Pending Supervisor', 'Pending Examiner', 'Approved', 'Rejected'];

const PENDING_STATUSES = ['Pending Supervisor', 'Pending Examiner'];
const MAX_TEXT = 5000;
const FEEDBACK_REQUIRED = 'Please enter your feedback';

// Everything the proposal cards need, with the group's current supervisor and examiner
// and the people who actually reviewed each stage
const PROPOSAL_SELECT = `
  SELECT pr.ProposalID AS id, pr.Status AS status, pr.ProposalComments AS comments,
         pr.ProposalDeadline AS deadline, pr.ProposalTime AS submittedAt,
         pr.SupervisorFeedback AS supervisorFeedback, pr.ExaminerFeedback AS examinerFeedback,
         pr.SupervisorReviewedAt AS supervisorReviewedAt, pr.ExaminerReviewedAt AS examinerReviewedAt,
         pr.SupervisorReviewedByUserID AS supervisorReviewerId, sru.Name AS supervisorReviewerName,
         sru.Role AS supervisorReviewerRole,
         pr.ExaminerReviewedByUserID AS examinerReviewerId, eru.Name AS examinerReviewerName,
         eru.Role AS examinerReviewerRole,
         du.Name AS decidedByName,
         p.ProjectID AS projectId, p.ProjectTitle AS projectTitle,
         p.ProjectDescription AS projectDescription, p.Status AS projectStatus,
         g.GroupID AS groupId, g.GroupName AS groupName,
         g.SupervisorID AS supervisorId, su.Name AS supervisorName,
         g.ExaminerID AS examinerId, eu.Name AS examinerName
    FROM proposal pr
    JOIN graduation_project p ON p.ProjectID = pr.ProjectID
    JOIN project_group g      ON g.GroupID = p.GroupID
    LEFT JOIN supervisor sp   ON sp.SupervisorID = g.SupervisorID
    LEFT JOIN \`user\` su     ON su.UserID = sp.UserID
    LEFT JOIN examiner ex     ON ex.ExaminerID = g.ExaminerID
    LEFT JOIN \`user\` eu     ON eu.UserID = ex.UserID
    LEFT JOIN \`user\` du     ON du.UserID = pr.DecidedByUserID
    LEFT JOIN \`user\` sru    ON sru.UserID = pr.SupervisorReviewedByUserID
    LEFT JOIN \`user\` eru    ON eru.UserID = pr.ExaminerReviewedByUserID`;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Which review step (if any) this user may do on this proposal right now
function getReviewRights(row, user) {
  const isGroupSupervisor = user.role === 'Supervisor' && row.supervisorId === user.supervisorId;
  const isGroupExaminer = user.role === 'Examiner' && row.examinerId === user.examinerId;
  const isAdmin = user.role === 'Administrator';

  const canReview =
    (isAdmin && PENDING_STATUSES.includes(row.status)) ||
    (isGroupSupervisor && row.status === 'Pending Supervisor') ||
    (isGroupExaminer && row.status === 'Pending Examiner');

  // UC16 / UC17 alternative flow: a reviewer may edit the feedback THEY gave. Feedback written
  // by someone else (a former supervisor, or the administrator who decided) stays as it is.
  let feedbackStage = null;
  if (isGroupSupervisor && row.supervisorReviewedAt && row.supervisorReviewerId === user.id) {
    feedbackStage = 'supervisor';
  }
  if (isGroupExaminer && row.examinerReviewedAt && row.examinerReviewerId === user.id) {
    feedbackStage = 'examiner';
  }

  return { canReview, canEditFeedback: feedbackStage !== null, feedbackStage };
}

// Turns a database row into the API shape
function toProposal(row, user) {
  return {
    id: row.id,
    status: row.status,
    comments: row.comments,
    deadline: row.deadline,
    submittedAt: row.submittedAt,
    supervisorFeedback: row.supervisorFeedback,
    examinerFeedback: row.examinerFeedback,
    supervisorReviewedAt: row.supervisorReviewedAt,
    examinerReviewedAt: row.examinerReviewedAt,
    // Who wrote each stage's feedback (role 'Administrator' when the admin decided at that stage)
    supervisorReviewerName: row.supervisorReviewerName,
    supervisorReviewerRole: row.supervisorReviewerRole,
    examinerReviewerName: row.examinerReviewerName,
    examinerReviewerRole: row.examinerReviewerRole,
    decidedByName: row.decidedByName,
    project: {
      id: row.projectId,
      title: row.projectTitle,
      description: row.projectDescription,
      status: row.projectStatus,
    },
    group: { id: row.groupId, name: row.groupName },
    supervisorName: row.supervisorName,
    examinerName: row.examinerName,
    hasExaminer: row.examinerId !== null,
    ...getReviewRights(row, user),
  };
}

/**
 * Loads proposals (newest first) in the API shape for this user.
 * filters: { groupIds (array, or null = all), projectId, proposalId, status }
 * Used by the proposals list and by the group detail page.
 */
export async function findProposals(user, filters = {}) {
  const conditions = [];
  const params = [];

  if (Array.isArray(filters.groupIds)) {
    if (filters.groupIds.length === 0) return [];
    conditions.push('g.GroupID IN (?)');
    params.push(filters.groupIds);
  }
  if (filters.projectId) {
    conditions.push('pr.ProjectID = ?');
    params.push(filters.projectId);
  }
  if (filters.proposalId) {
    conditions.push('pr.ProposalID = ?');
    params.push(filters.proposalId);
  }
  if (filters.status) {
    conditions.push('pr.Status = ?');
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(
    `${PROPOSAL_SELECT} ${where} ORDER BY pr.ProposalTime DESC, pr.ProposalID DESC`,
    params
  );
  return rows.map((row) => toProposal(row, user));
}

// Loads one proposal by the id in the URL; 404 if missing, 403 if the user cannot access its group
async function getProposalForUser(user, idParam) {
  const proposalId = toInt(idParam, 'Proposal id');
  const rows = await query(
    `SELECT p.GroupID AS groupId FROM proposal pr
       JOIN graduation_project p ON p.ProjectID = pr.ProjectID
      WHERE pr.ProposalID = ?`,
    [proposalId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Proposal not found');
  await assertGroupAccess(user, rows[0].groupId);

  const [proposal] = await findProposals(user, { proposalId });
  return proposal;
}

// UserIDs of every active administrator (they assign examiners)
async function getAdminUserIds() {
  const rows = await query(
    'SELECT a.UserID FROM admin a JOIN `user` u ON u.UserID = a.UserID WHERE u.IsActive = 1'
  );
  return rows.map((row) => row.UserID);
}

// The error to show when the user cannot review the proposal at its current stage
function notYourTurnError(proposal, user) {
  if (!PENDING_STATUSES.includes(proposal.status)) {
    return new HttpError(409, 'This proposal has already been decided.');
  }
  if (user.role === 'Supervisor' && proposal.status === 'Pending Examiner') {
    return new HttpError(409, 'You already reviewed this proposal. It is now waiting for the examiner.');
  }
  if (user.role === 'Examiner' && proposal.status === 'Pending Supervisor') {
    return new HttpError(409, 'The supervisor must approve this proposal before the examiner can review it.');
  }
  return new HttpError(403, 'You cannot review this proposal.');
}

// Checks the feedback text of the feedback forms (UC16 / UC17: an empty field asks for valid input)
function readFeedback(value, { required }) {
  const feedback = trimOrNull(value);
  if (required && !feedback) throw new HttpError(400, FEEDBACK_REQUIRED, { field: 'feedback' });
  checkMaxLength(feedback, MAX_TEXT, 'Feedback');
  return feedback;
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

/**
 * GET /api/proposals?status=&groupId=
 * Students see their group's proposals, supervisors and examiners the proposals of their
 * groups, administrators all of them. Each item says whether the user can review it now (canReview).
 */
export async function listProposals(req, res) {
  const filters = {};
  if (!isBlank(req.query.status)) {
    filters.status = oneOf(req.query.status, PROPOSAL_STATUSES, 'Status');
  }

  if (!isBlank(req.query.groupId)) {
    filters.groupIds = [await assertGroupAccess(req.user, req.query.groupId)];
  } else {
    filters.groupIds = await getAccessibleGroupIds(req.user); // null = all groups (admin)
  }

  res.json(await findProposals(req.user, filters));
}

/**
 * GET /api/proposals/:id
 */
export async function getProposal(req, res) {
  res.json(await getProposalForUser(req.user, req.params.id));
}

/**
 * POST /api/proposals  { projectId, comments?, deadline? }   (Student)
 * FR-6: a student submits the proposal of their group's project for review.
 */
export async function submitProposal(req, res) {
  requireFields(req.body, { projectId: 'Project' });
  const projectId = toInt(req.body.projectId, 'Project');

  const project = await findProjectById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (project.groupId !== req.user.groupId) {
    throw new HttpError(403, "You can only submit a proposal for your own group's project.");
  }
  if (FINISHED_STATUSES.includes(project.status)) {
    throw new HttpError(400, 'This project is already completed.');
  }

  const comments = trimOrNull(req.body.comments);
  checkMaxLength(comments, MAX_TEXT, 'Comments');

  const deadline = trimOrNull(req.body.deadline);
  if (deadline && !isValidDate(deadline)) {
    throw new HttpError(400, 'Please choose a valid deadline date', { field: 'deadline' });
  }

  const groupRows = await query('SELECT SupervisorID FROM project_group WHERE GroupID = ?', [project.groupId]);
  if (!groupRows[0].SupervisorID) {
    throw new HttpError(400, 'Please choose a supervisor before submitting a proposal.');
  }

  const proposalId = await withTransaction(async (conn) => {
    // Lock the project row so two teammates cannot submit two proposals at the same moment
    await conn.query('SELECT ProjectID FROM graduation_project WHERE ProjectID = ? FOR UPDATE', [projectId]);

    const [openRows] = await conn.query(
      'SELECT Status FROM proposal WHERE ProjectID = ? AND Status IN (?) LIMIT 1',
      [projectId, OPEN_PROPOSAL_STATUSES]
    );
    if (openRows.length > 0) {
      throw new HttpError(
        409,
        openRows[0].Status === 'Approved'
          ? 'Your proposal has already been approved.'
          : 'Your group already has a proposal under review.'
      );
    }

    const [result] = await conn.query(
      `INSERT INTO proposal (ProjectID, ProposalDeadline, ProposalComments, Status)
       VALUES (?, ?, ?, 'Pending Supervisor')`,
      [projectId, deadline, comments]
    );
    return result.insertId;
  });

  // Tell the supervisor (email too, UC8) and the other students of the group
  const supervisorIds = await getGroupUserIds(project.groupId, { students: false, supervisor: true });
  await notify(supervisorIds, {
    type: 'Proposal',
    title: `New proposal from ${project.groupName}`,
    message: `"${project.title}" is waiting for your review.`,
    link: '/proposals',
    email: true,
  });
  const studentIds = await getGroupUserIds(project.groupId, { students: true, supervisor: false });
  await notify(
    studentIds.filter((id) => id !== req.user.id),
    {
      type: 'Proposal',
      title: 'Your group submitted its proposal',
      message: `${req.user.name} submitted the proposal for "${project.title}". It is waiting for the supervisor.`,
      link: '/project',
    }
  );

  const [proposal] = await findProposals(req.user, { proposalId });
  res.status(201).json(proposal);
}

/**
 * PATCH /api/proposals/:id/review  { decision: 'approve' | 'reject', feedback }
 * (Supervisor, Examiner, Administrator) - FR-6, FR-7, UC16.
 */
export async function reviewProposal(req, res) {
  const decision = oneOf(req.body.decision, ['approve', 'reject'], 'Decision');
  const feedback = readFeedback(req.body.feedback, { required: false });

  const proposal = await getProposalForUser(req.user, req.params.id);
  if (!proposal.canReview) throw notYourTurnError(proposal, req.user);

  // The stage decides which feedback columns are used
  const stage = proposal.status === 'Pending Supervisor' ? 'supervisor' : 'examiner';
  const feedbackColumn = stage === 'supervisor' ? 'SupervisorFeedback' : 'ExaminerFeedback';
  const reviewedColumn = stage === 'supervisor' ? 'SupervisorReviewedAt' : 'ExaminerReviewedAt';
  const reviewerColumn = stage === 'supervisor' ? 'SupervisorReviewedByUserID' : 'ExaminerReviewedByUserID';

  // UC16 / UC17 exceptional flow: every decision needs feedback for the students
  // (feedback the reviewer saved earlier at this stage also counts)
  const savedFeedback = feedback ?? proposal[`${stage}Feedback`];
  if (!savedFeedback) throw new HttpError(400, FEEDBACK_REQUIRED, { field: 'feedback' });

  let newStatus;
  if (decision === 'reject') newStatus = 'Rejected';
  else if (req.user.role === 'Administrator') newStatus = 'Approved'; // FR-6: the admin approves directly
  else if (stage === 'supervisor') newStatus = 'Pending Examiner';
  else newStatus = 'Approved';

  const isFinalDecision = newStatus === 'Approved' || newStatus === 'Rejected';

  await withTransaction(async (conn) => {
    // "AND Status = ?" makes sure nobody else decided in the meantime.
    // The reviewer column remembers who wrote this stage's feedback.
    const [result] = await conn.query(
      `UPDATE proposal
          SET Status = ?, ${feedbackColumn} = ?, ${reviewedColumn} = NOW(), ${reviewerColumn} = ?,
              DecidedByUserID = ?
        WHERE ProposalID = ? AND Status = ?`,
      [newStatus, savedFeedback, req.user.id, isFinalDecision ? req.user.id : null, proposal.id, proposal.status]
    );
    if (result.affectedRows === 0) {
      throw new HttpError(409, 'This proposal was just reviewed by someone else. Please refresh the page.');
    }

    // An approved proposal starts the project
    if (newStatus === 'Approved') {
      await conn.query(
        "UPDATE graduation_project SET Status = 'In Progress' WHERE ProjectID = ? AND Status = 'Proposed'",
        [proposal.project.id]
      );
    }
  });

  await notifyReviewResult(req.user, proposal, newStatus);

  res.json(await getProposalForUser(req.user, proposal.id));
}

// Sends the right notifications after a review decision
async function notifyReviewResult(user, proposal, newStatus) {
  const groupId = proposal.group.id;
  const title = proposal.project.title;
  const studentIds = await getGroupUserIds(groupId, { students: true, supervisor: false });
  const supervisorIds = await getGroupUserIds(groupId, { students: false, supervisor: true });
  const examinerIds = await getGroupUserIds(groupId, { students: false, supervisor: false, examiner: true });
  const reviewer = user.role === 'Administrator' ? 'the administrator' : user.name;

  if (newStatus === 'Pending Examiner') {
    await notify(studentIds, {
      type: 'Proposal',
      title: 'Your supervisor approved your proposal',
      message: `"${title}" is now waiting for the examiner's review.`,
      link: '/project',
    });

    if (examinerIds.length > 0) {
      await notify(examinerIds, {
        type: 'Proposal',
        title: `A proposal from ${proposal.group.name} is waiting for your review`,
        message: `The supervisor approved "${title}".`,
        link: '/proposals',
        email: true,
      });
    } else {
      // No examiner yet: ask the administrators to assign one (FR-7 needs an examiner)
      await notify(await getAdminUserIds(), {
        type: 'Proposal',
        title: `${proposal.group.name} needs an examiner`,
        message: `The supervisor approved the proposal "${title}". Please assign an examiner so it can be reviewed.`,
        link: `/groups/${groupId}`,
      });
    }
    return;
  }

  const approved = newStatus === 'Approved';
  await notify(studentIds, {
    type: 'Proposal',
    title: approved ? 'Your proposal was approved' : 'Your proposal was rejected',
    message: approved
      ? `"${title}" was approved by ${reviewer}. Your project is now in progress.`
      : `"${title}" was rejected by ${reviewer}. Please read the feedback and submit a new proposal.`,
    link: '/project',
    email: true,
  });

  // Keep the other reviewers informed: the supervisor always, the examiner only when
  // the proposal had already reached them
  const reachedExaminer = proposal.status === 'Pending Examiner';
  const others = [...supervisorIds, ...(reachedExaminer ? examinerIds : [])].filter((id) => id !== user.id);
  await notify(others, {
    type: 'Proposal',
    title: `Proposal of ${proposal.group.name} ${approved ? 'approved' : 'rejected'}`,
    message: `"${title}" was ${approved ? 'approved' : 'rejected'} by ${reviewer}.`,
    link: '/proposals',
  });
}

/**
 * Saves edited feedback for one review stage (UC16 / UC17 alternative flow).
 * A reviewer may write feedback while the proposal waits for them, and edit the feedback
 * THEY wrote after reviewing (not a former supervisor's or the administrator's).
 */
async function saveStageFeedback(req, res, stage) {
  const feedback = readFeedback(req.body.feedback, { required: true });
  const proposal = await getProposalForUser(req.user, req.params.id);

  const pendingStatus = stage === 'supervisor' ? 'Pending Supervisor' : 'Pending Examiner';
  const reviewedAt = stage === 'supervisor' ? proposal.supervisorReviewedAt : proposal.examinerReviewedAt;
  const isWaitingForThem = proposal.status === pendingStatus; // writing before deciding
  if (!isWaitingForThem && !reviewedAt) {
    throw new HttpError(
      409,
      stage === 'supervisor'
        ? 'You have not reviewed this proposal yet.'
        : 'This proposal has not reached the examiner yet.'
    );
  }
  if (!isWaitingForThem && proposal.feedbackStage !== stage) {
    throw new HttpError(403, 'You can only edit the feedback you wrote.');
  }

  const column = stage === 'supervisor' ? 'SupervisorFeedback' : 'ExaminerFeedback';
  await query(`UPDATE proposal SET ${column} = ? WHERE ProposalID = ?`, [feedback, proposal.id]);

  const studentIds = await getGroupUserIds(proposal.group.id, { students: true, supervisor: false });
  await notify(studentIds, {
    type: 'Feedback',
    title: `The ${stage} updated the feedback on your proposal`,
    message: `New feedback on "${proposal.project.title}".`,
    link: '/project',
  });

  res.json(await getProposalForUser(req.user, proposal.id));
}

/**
 * PUT /api/proposals/:id/examiner-feedback  { feedback }   (Examiner of the group) - UC17
 */
export async function updateExaminerFeedback(req, res) {
  await saveStageFeedback(req, res, 'examiner');
}

/**
 * PUT /api/proposals/:id/supervisor-feedback  { feedback }   (Supervisor of the group) - UC16
 */
export async function updateSupervisorFeedback(req, res) {
  await saveStageFeedback(req, res, 'supervisor');
}
