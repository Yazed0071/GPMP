// Supervisors list and supervisor selection (FR-5, UC11 Choose Supervisor).
// Students choose an available supervisor with free places; the administrator manages
// each supervisor's availability, maximum number of groups and department.

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, toInt, toBool, trimOrNull, checkMaxLength } from '../utils/validate.js';
import { getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';
import { refreshUserRooms } from '../socket.js';

// "Before final confirmation" (UC11): once the supervisor has approved the proposal,
// the group can no longer change its supervisor.
const LOCKING_PROPOSAL_STATUSES = ['Pending Examiner', 'Approved'];

const SUPERVISOR_SELECT = `
  SELECT sp.SupervisorID AS id, sp.UserID AS userId, u.Name AS name, u.Email AS email,
         sp.SupervisorDepartment AS department, sp.NumberOfGroups AS numberOfGroups,
         sp.IsAvailable AS isAvailable, u.IsActive AS isActive,
         (SELECT COUNT(*) FROM project_group g WHERE g.SupervisorID = sp.SupervisorID) AS currentGroups
    FROM supervisor sp
    JOIN \`user\` u ON u.UserID = sp.UserID`;

// ---------------------------------------------------------------------
// Helpers (countSupervisorGroups is also used by the groups controller)
// ---------------------------------------------------------------------

// Turns a row into the API shape. currentSupervisorId marks the student's current choice.
function toSupervisor(row, currentSupervisorId = null) {
  const isAvailable = Boolean(row.isAvailable);
  const isActive = Boolean(row.isActive);
  const hasCapacity = row.currentGroups < row.numberOfGroups;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    department: row.department,
    numberOfGroups: row.numberOfGroups, // the maximum number of groups
    currentGroups: row.currentGroups,
    isAvailable,
    isActive,
    hasCapacity,
    canBeChosen: isActive && isAvailable && hasCapacity,
    isCurrent: row.id === currentSupervisorId,
  };
}

async function findSupervisor(supervisorId) {
  const rows = await query(`${SUPERVISOR_SELECT} WHERE sp.SupervisorID = ?`, [supervisorId]);
  return rows[0] || null;
}

/**
 * How many groups a supervisor has. excludeGroupId leaves one group out of the count
 * (used when an existing group is edited and keeps its supervisor).
 */
export async function countSupervisorGroups(supervisorId, excludeGroupId = null) {
  const rows = await query(
    'SELECT COUNT(*) AS total FROM project_group WHERE SupervisorID = ? AND GroupID <> ?',
    [supervisorId, excludeGroupId || 0]
  );
  return rows[0].total;
}

/**
 * The student's current situation for UC11:
 * { groupId, groupName, supervisorId, canChange, message }
 * message explains why the student cannot choose (no group, or proposal already approved).
 */
async function getStudentChoice(user) {
  const groupRows = user.groupId
    ? await query('SELECT GroupID, GroupName, SupervisorID FROM project_group WHERE GroupID = ?', [user.groupId])
    : [];
  const group = groupRows[0];

  if (!group) {
    return {
      groupId: null,
      groupName: null,
      supervisorId: null,
      canChange: false,
      message: 'You are not in a group yet. The administrator will add you to a group first.',
    };
  }

  const locked = await query(
    `SELECT pr.ProposalID FROM proposal pr
       JOIN graduation_project p ON p.ProjectID = pr.ProjectID
      WHERE p.GroupID = ? AND pr.Status IN (?) LIMIT 1`,
    [group.GroupID, LOCKING_PROPOSAL_STATUSES]
  );

  return {
    groupId: group.GroupID,
    groupName: group.GroupName,
    supervisorId: group.SupervisorID,
    canChange: locked.length === 0,
    message:
      locked.length > 0
        ? 'Your supervisor has already approved your proposal, so the supervisor can no longer be changed.'
        : null,
  };
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

/**
 * GET /api/supervisors
 * Every supervisor with their capacity (e.g. 2 of 3 groups) and availability.
 * Administrators also see deactivated accounts; students see which one is their current choice.
 */
export async function listSupervisors(req, res) {
  const isAdmin = req.user.role === 'Administrator';
  const where = isAdmin ? '' : 'WHERE u.IsActive = 1';
  const rows = await query(`${SUPERVISOR_SELECT} ${where} ORDER BY u.Name`);

  let currentSupervisorId = null;
  if (req.user.role === 'Student') {
    currentSupervisorId = (await getStudentChoice(req.user)).supervisorId;
  }

  res.json(rows.map((row) => toSupervisor(row, currentSupervisorId)));
}

/**
 * GET /api/supervisors/my-choice   (Student)
 * { groupId, groupName, supervisorId, canChange, message } for the supervisor selection page.
 */
export async function getMyChoice(req, res) {
  res.json(await getStudentChoice(req.user));
}

/**
 * POST /api/supervisors/choose  { supervisorId }   (Student)
 * UC11: the student chooses a supervisor for their group. The supervisor must be available
 * and have a free place, and the choice can change only before the proposal is approved.
 */
export async function chooseSupervisor(req, res) {
  requireFields(req.body, { supervisorId: 'Supervisor' });
  const supervisorId = toInt(req.body.supervisorId, 'Supervisor');

  const choice = await getStudentChoice(req.user);
  if (!choice.groupId) throw new HttpError(400, choice.message);
  if (!choice.canChange) throw new HttpError(409, choice.message);
  if (choice.supervisorId === supervisorId) {
    throw new HttpError(400, 'This supervisor is already your supervisor.');
  }

  const chosen = await withTransaction(async (conn) => {
    // Lock the supervisor row so two groups cannot take the last free place at the same time
    const [rows] = await conn.query(
      `SELECT sp.SupervisorID, sp.UserID, sp.NumberOfGroups, sp.IsAvailable, u.Name, u.IsActive
         FROM supervisor sp JOIN \`user\` u ON u.UserID = sp.UserID
        WHERE sp.SupervisorID = ? FOR UPDATE`,
      [supervisorId]
    );
    const supervisor = rows[0];
    if (!supervisor || !supervisor.IsActive) throw new HttpError(404, 'Supervisor not found');
    if (!supervisor.IsAvailable) {
      throw new HttpError(400, `${supervisor.Name} is not available at the moment. Please choose another supervisor.`);
    }

    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS total FROM project_group WHERE SupervisorID = ?',
      [supervisorId]
    );
    if (countRows[0].total >= supervisor.NumberOfGroups) {
      throw new HttpError(400, `${supervisor.Name} has no free places left. Please choose another supervisor.`);
    }

    await conn.query('UPDATE project_group SET SupervisorID = ? WHERE GroupID = ?', [
      supervisorId,
      choice.groupId,
    ]);
    return supervisor;
  });

  await notifySupervisorChange(req.user, choice, chosen);

  res.json({
    message: `${chosen.Name} is now your supervisor.`,
    groupId: choice.groupId,
    supervisorId,
  });
}

// Notifications and live-chat rooms after a group changed its supervisor
async function notifySupervisorChange(user, choice, chosen) {
  await notify(chosen.UserID, {
    type: 'System',
    title: `${choice.groupName} chose you as their supervisor`,
    message: 'You can see the group, its project and its proposal on the Groups page.',
    link: `/groups/${choice.groupId}`,
    email: true,
  });

  let oldSupervisorUserId = null;
  if (choice.supervisorId) {
    const oldRows = await query('SELECT UserID FROM supervisor WHERE SupervisorID = ?', [choice.supervisorId]);
    oldSupervisorUserId = oldRows[0]?.UserID || null;
    await notify(oldSupervisorUserId, {
      type: 'System',
      title: `${choice.groupName} changed their supervisor`,
      message: `The group is now supervised by ${chosen.Name}.`,
      link: '/groups',
    });
  }

  const studentIds = await getGroupUserIds(choice.groupId, { students: true, supervisor: false });
  await notify(
    studentIds.filter((id) => id !== user.id),
    {
      type: 'System',
      title: `Your group's supervisor is now ${chosen.Name}`,
      message: `${user.name} chose the supervisor for your group.`,
      link: '/project',
    }
  );

  // The new (and old) supervisor join / leave the group chat room right away
  await refreshUserRooms(chosen.UserID);
  if (oldSupervisorUserId) await refreshUserRooms(oldSupervisorUserId);
}

/**
 * PATCH /api/supervisors/:id  { numberOfGroups?, isAvailable?, department? }   (Administrator)
 * FR-5: the administrator manages the list of available supervisors.
 */
export async function updateSupervisor(req, res) {
  const supervisorId = toInt(req.params.id, 'Supervisor id');
  const current = await findSupervisor(supervisorId);
  if (!current) throw new HttpError(404, 'Supervisor not found');

  // Only the fields that were sent are changed
  const changes = [];
  const params = [];

  if (req.body.numberOfGroups !== undefined) {
    const max = toInt(req.body.numberOfGroups, 'Maximum number of groups', { min: 1, max: 20 });
    if (max < current.currentGroups) {
      throw new HttpError(
        400,
        `${current.name} already supervises ${current.currentGroups} groups, so the maximum cannot be lower than ${current.currentGroups}.`
      );
    }
    changes.push('NumberOfGroups = ?');
    params.push(max);
  }

  if (req.body.isAvailable !== undefined) {
    changes.push('IsAvailable = ?');
    params.push(toBool(req.body.isAvailable) ? 1 : 0);
  }

  if (req.body.department !== undefined) {
    const department = trimOrNull(req.body.department);
    checkMaxLength(department, 100, 'Department');
    changes.push('SupervisorDepartment = ?');
    params.push(department);
  }

  if (changes.length === 0) throw new HttpError(400, 'Nothing to update.');

  // The column names come from the fixed list above, never from the user
  await query(`UPDATE supervisor SET ${changes.join(', ')} WHERE SupervisorID = ?`, [...params, supervisorId]);

  res.json(toSupervisor(await findSupervisor(supervisorId)));
}
