// Dashboard (UI fig 47): ONE request returns everything the dashboard page shows,
// shaped for the user's role. The exact response of each role is documented in
// docs/api/calendar-attendance-dashboard.md.
//
// Shared definitions:
//   progress of a group  = completed tasks / all tasks of the group (in %)
//   announcement visible = (TargetRole 'All' OR the user's role OR the user is an Administrator)
//                          AND (no group OR a group the user can access); publishers always see their own

import { query } from '../config/db.js';
import { getAccessibleGroupIds } from '../services/access.js';
import { dateInAppZone } from '../services/reminders.js';
import { fetchCalendarItems, getPermissionContext } from './events.controller.js';
import { countUnreadChatMessages } from './chat.controller.js';
import { countUnread } from './notifications.controller.js';
import { PROJECT_STATUSES } from './projects.controller.js';
import { PROPOSAL_STATUSES } from './proposals.controller.js';

const UPCOMING_LIMIT = 5;
const ACTIVITY_LIMIT = 6;
const ACTIVITY_PER_KIND = 3; // at most 3 items of one kind, so the feed shows a mix
const ANNOUNCEMENT_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

// part / total in percent (0 when there is nothing to count)
function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// Whole days from date text a to date text b ('YYYY-MM-DD')
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

// Cuts long text for previews: "First 160 characters…"
function shorten(text, max = 160) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * A SQL condition that limits rows to some groups.
 * groupIds null = all groups, [] = no group at all. `column` is always written in our code, never user input.
 */
function groupCondition(column, groupIds) {
  if (groupIds === null) return { sql: '1 = 1', params: [] };
  if (groupIds.length === 0) return { sql: '1 = 0', params: [] };
  return { sql: `${column} IN (?)`, params: [groupIds] };
}

// Turns [{ status, total }] rows into { 'In Progress': 2, ... } with 0 for missing statuses
function countByStatus(rows, statuses) {
  const result = Object.fromEntries(statuses.map((status) => [status, 0]));
  rows.forEach((row) => {
    if (row.status in result) result[row.status] = row.total;
  });
  return result;
}

// ---------------------------------------------------------------------
// Building blocks shared by several roles
// ---------------------------------------------------------------------

/**
 * One summary row per group: project, members, task progress, work waiting for review.
 * groupIds null = all groups.
 */
async function getGroupsOverview(groupIds) {
  if (groupIds !== null && groupIds.length === 0) return [];
  const where = groupCondition('g.GroupID', groupIds);

  const rows = await query(
    `SELECT g.GroupID AS id, g.GroupName AS name,
            p.ProjectID AS projectId, p.ProjectTitle AS projectTitle, p.Status AS projectStatus,
            su.Name AS supervisorName, eu.Name AS examinerName,
            (SELECT COUNT(*) FROM student s WHERE s.GroupID = g.GroupID) AS memberCount,
            (SELECT COUNT(*) FROM task t WHERE t.GroupID = g.GroupID) AS totalTasks,
            (SELECT COUNT(*) FROM task t WHERE t.GroupID = g.GroupID AND t.Status = 'Completed') AS completedTasks,
            (SELECT COUNT(*) FROM task t
              WHERE t.GroupID = g.GroupID AND t.Status IN ('To Do', 'In Progress') AND t.DueDate < ?) AS overdueTasks,
            -- One per task that waits for review (older attempts of the same task do not count;
            -- a task is 'Submitted' exactly while its newest submission waits for feedback)
            (SELECT COUNT(*) FROM task t
              WHERE t.GroupID = g.GroupID AND t.Status = 'Submitted') AS pendingSubmissions,
            (SELECT pr.Status FROM proposal pr
              WHERE pr.ProjectID = p.ProjectID
              ORDER BY pr.ProposalTime DESC, pr.ProposalID DESC LIMIT 1) AS proposalStatus
       FROM project_group g
       LEFT JOIN graduation_project p ON p.GroupID = g.GroupID
       LEFT JOIN supervisor sp ON sp.SupervisorID = g.SupervisorID
       LEFT JOIN \`user\` su ON su.UserID = sp.UserID
       LEFT JOIN examiner ex ON ex.ExaminerID = g.ExaminerID
       LEFT JOIN \`user\` eu ON eu.UserID = ex.UserID
      WHERE ${where.sql}
      ORDER BY g.GroupName`,
    [dateInAppZone(), ...where.params]
  );

  return rows.map((row) => ({ ...row, progress: percent(row.completedTasks, row.totalTasks) }));
}

// Unread notifications of the user (FR-20) and unread chat messages.
// Chat notifications are collapsed ("3 new messages in ..."), so the message count comes
// from the chat controller instead of counting notification rows.
async function getUnreadCounts(user) {
  const [unreadNotifications, unreadMessages] = await Promise.all([
    countUnread(user.id),
    countUnreadChatMessages(user),
  ]);
  return { unreadNotifications, unreadMessages };
}

// The newest announcements the user may see (same visibility rule as the Announcements page)
async function getVisibleAnnouncements(user, groupIds) {
  const groups = groupCondition('a.GroupID', groupIds);
  const rows = await query(
    `SELECT a.AnnouncementID AS id, a.AnnouncementTitle AS title, a.AnnouncementContent AS content,
            a.AnnouncementDate AS date, a.AnnouncementEditDate AS editedAt, a.TargetRole AS targetRole,
            a.GroupID AS groupId, g.GroupName AS groupName, u.Name AS publisherName
       FROM announcement a
       LEFT JOIN \`user\` u ON u.UserID = a.PublishedByUserID
       LEFT JOIN project_group g ON g.GroupID = a.GroupID
      WHERE a.PublishedByUserID = ?
         OR ((a.TargetRole = 'All' OR a.TargetRole = ? OR ? = 'Administrator')
             AND (a.GroupID IS NULL OR ${groups.sql}))
      ORDER BY a.AnnouncementDate DESC
      LIMIT ?`,
    [user.id, user.role, user.role, ...groups.params, ANNOUNCEMENT_LIMIT]
  );
  return rows.map(({ content, ...row }) => ({ ...row, excerpt: shorten(content) }));
}

// Words used in the activity feed for a new calendar event
const SCHEDULED_TEXT = {
  Meeting: 'scheduled a meeting:',
  Presentation: 'scheduled a presentation:',
  Deadline: 'set a deadline:',
  Academic: 'added an academic date:',
};

/**
 * The latest things that happened in the groups (feedback, submissions, document uploads,
 * newly scheduled events), newest first, at most ACTIVITY_PER_KIND of each kind. groupIds null = all groups.
 * Each item: { id, kind, actor, text, target, date, eventDate?, link, groupId, groupName }
 * The page shows it as "<actor> <text> <target>", e.g. "Dr. Ahmed approved Chapter 3".
 */
async function getRecentActivity(groupIds) {
  if (groupIds !== null && groupIds.length === 0) return [];
  const submissionGroups = groupCondition('sb.GroupID', groupIds);
  const fileGroups = groupCondition('f.GroupID', groupIds);
  const calendarGroups = groupCondition('c.GroupID', groupIds);

  const [feedback, submissions, uploads, scheduled] = await Promise.all([
    query(
      `SELECT f.FeedbackID AS id, f.CreatedAt AS date, f.Decision AS decision, u.Name AS actor,
              t.TaskID AS taskId, t.Title AS taskTitle, g.GroupID AS groupId, g.GroupName AS groupName
         FROM feedback f
         JOIN submission sb ON sb.SubmissionID = f.SubmissionID
         JOIN task t ON t.TaskID = sb.TaskID
         JOIN project_group g ON g.GroupID = sb.GroupID
         LEFT JOIN \`user\` u ON u.UserID = f.GivenByUserID
        WHERE ${submissionGroups.sql}
        ORDER BY f.CreatedAt DESC LIMIT ?`,
      [...submissionGroups.params, ACTIVITY_PER_KIND]
    ),
    query(
      `SELECT sb.SubmissionID AS id, sb.SubmissionDate AS date, u.Name AS actor,
              t.TaskID AS taskId, t.Title AS taskTitle, g.GroupID AS groupId, g.GroupName AS groupName
         FROM submission sb
         JOIN task t ON t.TaskID = sb.TaskID
         JOIN project_group g ON g.GroupID = sb.GroupID
         LEFT JOIN student st ON st.StudentID = sb.SubmittedByStudentID
         LEFT JOIN \`user\` u ON u.UserID = st.UserID
        WHERE ${submissionGroups.sql}
        ORDER BY sb.SubmissionDate DESC LIMIT ?`,
      [...submissionGroups.params, ACTIVITY_PER_KIND]
    ),
    query(
      `SELECT f.FileID AS id, f.UploadDate AS date, f.FileName AS fileName, f.Version AS version,
              u.Name AS actor, g.GroupID AS groupId, g.GroupName AS groupName
         FROM \`file\` f
         JOIN project_group g ON g.GroupID = f.GroupID
         LEFT JOIN \`user\` u ON u.UserID = f.UploadedByUserID
        WHERE f.Category = 'Document' AND ${fileGroups.sql}
        ORDER BY f.UploadDate DESC LIMIT ?`,
      [...fileGroups.params, ACTIVITY_PER_KIND]
    ),
    query(
      `SELECT d.DeadlineID AS id, d.DeadlineSetDate AS date, d.Title AS title, d.DeadlineType AS type,
              d.EventDate AS eventDate, u.Name AS actor, g.GroupID AS groupId, g.GroupName AS groupName
         FROM important_date d
         JOIN calendar c ON c.CalendarID = d.CalendarID
         JOIN project_group g ON g.GroupID = c.GroupID
         LEFT JOIN \`user\` u ON u.UserID = d.CreatedByUserID
        WHERE d.DeadlineSetDate <= NOW() AND ${calendarGroups.sql}
        ORDER BY d.DeadlineSetDate DESC LIMIT ?`,
      [...calendarGroups.params, ACTIVITY_PER_KIND]
    ),
  ]);

  const items = [
    ...feedback.map((row) => ({
      id: `feedback-${row.id}`,
      kind: 'feedback',
      actor: row.actor || 'A reviewer',
      text: row.decision === 'Approved' ? 'approved' : 'requested changes on',
      target: row.taskTitle,
      date: row.date,
      link: `/tasks/${row.taskId}`,
      groupId: row.groupId,
      groupName: row.groupName,
    })),
    ...submissions.map((row) => ({
      id: `submission-${row.id}`,
      kind: 'submission',
      actor: row.actor || 'A student',
      text: 'submitted',
      target: row.taskTitle,
      date: row.date,
      link: `/tasks/${row.taskId}`,
      groupId: row.groupId,
      groupName: row.groupName,
    })),
    ...uploads.map((row) => ({
      id: `upload-${row.id}`,
      kind: 'upload',
      actor: row.actor || 'Someone',
      text: 'uploaded',
      target: row.version > 1 ? `${row.fileName} (v${row.version})` : row.fileName,
      date: row.date,
      link: `/documents?groupId=${row.groupId}`,
      groupId: row.groupId,
      groupName: row.groupName,
    })),
    ...scheduled.map((row) => ({
      id: `event-${row.id}`,
      kind: 'event',
      actor: row.actor || 'Someone',
      text: SCHEDULED_TEXT[row.type] || 'added',
      target: row.title,
      date: row.date,
      eventDate: row.eventDate,
      link: `/calendar?groupId=${row.groupId}&date=${dateInAppZone(row.eventDate)}`,
      groupId: row.groupId,
      groupName: row.groupName,
    })),
  ];

  return items.sort((a, b) => b.date - a.date).slice(0, ACTIVITY_LIMIT);
}

/**
 * Events and task due dates from now on (unfinished tasks only), soonest first.
 * `accessibleGroupIds` is only used to fill each event's canEdit flag.
 */
async function getUpcomingItems(user, groupIds, accessibleGroupIds) {
  return fetchCalendarItems(
    await getPermissionContext(user, accessibleGroupIds),
    { groupIds, includeShared: true, from: new Date(), fromDay: dateInAppZone(), skipCompleted: true }
  );
}

// ---------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------

// Deadlines still ahead of the students: unfinished tasks and 'Deadline' events
function isPendingDeadline(item) {
  if (item.source === 'task') return item.status === 'To Do' || item.status === 'In Progress';
  return item.type === 'Deadline' && new Date(item.eventDate).getTime() > Date.now();
}

// { title, date, daysLeft, link } for the "next deadline" line of the greeting banner
function toNextDeadline(item) {
  const today = dateInAppZone();
  const day = item.source === 'task' ? item.eventDate : dateInAppZone(item.eventDate);
  return {
    title: item.title,
    date: item.eventDate,
    allDay: item.allDay,
    daysLeft: daysBetween(today, day),
    source: item.source,
    link: item.link,
  };
}

/**
 * Milestones with a progress bar each: the share of the tasks due up to the milestone's date
 * that are completed (a completed milestone is 100%).
 */
async function getMilestones(groupId) {
  const tasks = await query(
    `SELECT TaskID AS id, Title AS title, DueDate AS dueDate, Status AS status, IsMilestone AS isMilestone
       FROM task WHERE GroupID = ?
      ORDER BY DueDate IS NULL, DueDate, TaskID`,
    [groupId]
  );

  return tasks
    .filter((task) => task.isMilestone)
    .map((milestone) => {
      const dueBefore = tasks.filter((t) => t.dueDate && milestone.dueDate && t.dueDate <= milestone.dueDate);
      const done = dueBefore.filter((t) => t.status === 'Completed').length;
      return {
        id: milestone.id,
        title: milestone.title,
        dueDate: milestone.dueDate,
        status: milestone.status,
        progress: milestone.status === 'Completed' ? 100 : percent(done, dueBefore.length),
        link: `/tasks/${milestone.id}`,
      };
    });
}

async function buildStudentDashboard(user) {
  const groupIds = user.groupId ? [user.groupId] : [];

  const [unread, announcements, upcomingAll] = await Promise.all([
    getUnreadCounts(user),
    getVisibleAnnouncements(user, groupIds),
    getUpcomingItems(user, groupIds, groupIds),
  ]);
  const deadlines = upcomingAll.filter(isPendingDeadline);

  // A student without a group still sees the academic calendar and announcements
  const dashboard = {
    role: 'Student',
    group: null,
    project: null,
    proposalStatus: null,
    progress: { percent: 0, total: 0, completed: 0 },
    milestones: [],
    stats: {
      tasksCompleted: 0,
      pendingDeadlines: deadlines.length,
      overdueTasks: 0,
      myOpenTasks: 0,
      unreadMessages: unread.unreadMessages,
      unreadNotifications: unread.unreadNotifications,
    },
    nextDeadline: deadlines.length > 0 ? toNextDeadline(deadlines[0]) : null,
    upcoming: upcomingAll.slice(0, UPCOMING_LIMIT),
    recentActivity: [],
    announcements,
  };
  if (!user.groupId) return dashboard;

  const [[group], milestones, myTasks, recentActivity] = await Promise.all([
    getGroupsOverview([user.groupId]),
    getMilestones(user.groupId),
    query(
      "SELECT COUNT(*) AS total FROM task WHERE AssignedToStudentID = ? AND Status IN ('To Do', 'In Progress')",
      [user.studentId]
    ),
    getRecentActivity([user.groupId]),
  ]);

  return {
    ...dashboard,
    group: {
      id: group.id,
      name: group.name,
      memberCount: group.memberCount,
      supervisorName: group.supervisorName,
      examinerName: group.examinerName,
    },
    project: group.projectId
      ? { id: group.projectId, title: group.projectTitle, status: group.projectStatus }
      : null,
    proposalStatus: group.proposalStatus,
    progress: { percent: group.progress, total: group.totalTasks, completed: group.completedTasks },
    milestones,
    stats: {
      ...dashboard.stats,
      tasksCompleted: group.completedTasks,
      overdueTasks: group.overdueTasks,
      myOpenTasks: myTasks[0].total,
    },
    recentActivity,
  };
}

// ---------------------------------------------------------------------
// Supervisor and Examiner
// ---------------------------------------------------------------------

// Counts proposals with this status for the projects of these groups
async function countProposals(status, groupIds) {
  if (groupIds.length === 0) return 0;
  const rows = await query(
    `SELECT COUNT(*) AS total
       FROM proposal pr
       JOIN graduation_project p ON p.ProjectID = pr.ProjectID
      WHERE pr.Status = ? AND p.GroupID IN (?)`,
    [status, groupIds]
  );
  return rows[0].total;
}

// The group rows shown on staff dashboards
function toStaffGroup(group) {
  return {
    id: group.id,
    name: group.name,
    projectId: group.projectId,
    projectTitle: group.projectTitle,
    projectStatus: group.projectStatus,
    proposalStatus: group.proposalStatus,
    memberCount: group.memberCount,
    progress: group.progress,
    totalTasks: group.totalTasks,
    completedTasks: group.completedTasks,
    overdueTasks: group.overdueTasks,
    pendingSubmissions: group.pendingSubmissions,
    supervisorName: group.supervisorName,
    examinerName: group.examinerName,
  };
}

async function buildSupervisorDashboard(user) {
  const groupIds = await getAccessibleGroupIds(user);

  const [groups, unread, announcements, upcomingAll, recentActivity, pendingProposals] = await Promise.all([
    getGroupsOverview(groupIds),
    getUnreadCounts(user),
    getVisibleAnnouncements(user, groupIds),
    getUpcomingItems(user, groupIds, groupIds),
    getRecentActivity(groupIds),
    countProposals('Pending Supervisor', groupIds),
  ]);

  // Meetings and presentations of the supervised groups in the next 7 days
  const weekFromNow = Date.now() + 7 * DAY_MS;
  const upcomingMeetings = upcomingAll.filter(
    (item) =>
      item.source === 'event' &&
      (item.type === 'Meeting' || item.type === 'Presentation') &&
      new Date(item.eventDate).getTime() <= weekFromNow
  ).length;

  return {
    role: 'Supervisor',
    groups: groups.map(toStaffGroup),
    stats: {
      groups: groups.length,
      pendingProposals,
      submissionsToReview: groups.reduce((sum, g) => sum + g.pendingSubmissions, 0),
      upcomingMeetings,
      unreadMessages: unread.unreadMessages,
      unreadNotifications: unread.unreadNotifications,
    },
    upcoming: upcomingAll.slice(0, UPCOMING_LIMIT),
    recentActivity,
    announcements,
  };
}

async function buildExaminerDashboard(user) {
  const groupIds = await getAccessibleGroupIds(user);

  const [groups, unread, announcements, upcomingAll, recentActivity, pendingProposals] = await Promise.all([
    getGroupsOverview(groupIds),
    getUnreadCounts(user),
    getVisibleAnnouncements(user, groupIds),
    getUpcomingItems(user, groupIds, groupIds),
    getRecentActivity(groupIds),
    countProposals('Pending Examiner', groupIds),
  ]);

  // Presentations of the examined groups that have not happened yet
  const upcomingPresentations = upcomingAll.filter(
    (item) => item.source === 'event' && item.type === 'Presentation' && item.groupId !== null
  ).length;

  return {
    role: 'Examiner',
    groups: groups.map(toStaffGroup),
    stats: {
      groups: groups.length,
      pendingProposals,
      upcomingPresentations,
      unreadMessages: unread.unreadMessages,
      unreadNotifications: unread.unreadNotifications,
    },
    upcoming: upcomingAll.slice(0, UPCOMING_LIMIT),
    recentActivity,
    announcements,
  };
}

// ---------------------------------------------------------------------
// Administrator
// ---------------------------------------------------------------------

const ROLE_NAMES = ['Student', 'Supervisor', 'Examiner', 'Administrator'];

// Groups that still miss a supervisor, an examiner or a project (shown as "needs attention")
async function getGroupsNeedingAttention() {
  const rows = await query(
    `SELECT g.GroupID AS id, g.GroupName AS name,
            (g.SupervisorID IS NULL) AS noSupervisor, (g.ExaminerID IS NULL) AS noExaminer,
            (p.ProjectID IS NULL) AS noProject,
            (SELECT COUNT(*) FROM student s WHERE s.GroupID = g.GroupID) AS memberCount
       FROM project_group g
       LEFT JOIN graduation_project p ON p.GroupID = g.GroupID
      WHERE g.SupervisorID IS NULL OR g.ExaminerID IS NULL OR p.ProjectID IS NULL
      ORDER BY g.GroupName
      LIMIT 6`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    memberCount: row.memberCount,
    issues: [
      row.noSupervisor && 'No supervisor',
      row.noExaminer && 'No examiner',
      row.noProject && 'No project yet',
    ].filter(Boolean),
  }));
}

async function buildAdminDashboard(user) {
  const [
    userRows,
    groupRows,
    loneStudentRows,
    supervisorRows,
    projectRows,
    proposalRows,
    unread,
    announcements,
    upcomingAll,
    recentActivity,
    attention,
  ] = await Promise.all([
    query(
      `SELECT Role AS role, COUNT(*) AS total, SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS active
         FROM \`user\` GROUP BY Role`
    ),
    query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN SupervisorID IS NULL THEN 1 ELSE 0 END), 0) AS withoutSupervisor,
              COALESCE(SUM(CASE WHEN ExaminerID IS NULL THEN 1 ELSE 0 END), 0) AS withoutExaminer
         FROM project_group`
    ),
    query(
      `SELECT COUNT(*) AS total
         FROM student s JOIN \`user\` u ON u.UserID = s.UserID
        WHERE s.GroupID IS NULL AND u.IsActive = 1`
    ),
    // Same rule as the Supervisors page: active, available and with a free place
    query(
      `SELECT COUNT(*) AS total
         FROM supervisor sp JOIN \`user\` u ON u.UserID = sp.UserID
        WHERE sp.IsAvailable = 1 AND u.IsActive = 1
          AND (SELECT COUNT(*) FROM project_group g WHERE g.SupervisorID = sp.SupervisorID) < sp.NumberOfGroups`
    ),
    query('SELECT Status AS status, COUNT(*) AS total FROM graduation_project GROUP BY Status'),
    query('SELECT Status AS status, COUNT(*) AS total FROM proposal GROUP BY Status'),
    getUnreadCounts(user),
    getVisibleAnnouncements(user, null),
    // Administrators see the shared academic calendar on their dashboard
    getUpcomingItems(user, [], null),
    getRecentActivity(null),
    getGroupsNeedingAttention(),
  ]);

  const usersByRole = Object.fromEntries(ROLE_NAMES.map((role) => [role, 0]));
  let totalUsers = 0;
  let activeUsers = 0;
  userRows.forEach((row) => {
    if (row.role in usersByRole) usersByRole[row.role] = row.total;
    totalUsers += row.total;
    activeUsers += Number(row.active);
  });

  const projectsByStatus = countByStatus(projectRows, PROJECT_STATUSES);
  const proposalsByStatus = countByStatus(proposalRows, PROPOSAL_STATUSES);

  return {
    role: 'Administrator',
    stats: {
      usersByRole,
      totalUsers,
      activeUsers,
      groups: groupRows[0].total,
      groupsWithoutSupervisor: Number(groupRows[0].withoutSupervisor),
      groupsWithoutExaminer: Number(groupRows[0].withoutExaminer),
      studentsWithoutGroup: loneStudentRows[0].total,
      availableSupervisors: supervisorRows[0].total,
      projectsByStatus,
      totalProjects: projectRows.reduce((sum, row) => sum + row.total, 0),
      proposalsByStatus,
      pendingProposals: proposalsByStatus['Pending Supervisor'] + proposalsByStatus['Pending Examiner'],
      unreadMessages: unread.unreadMessages,
      unreadNotifications: unread.unreadNotifications,
    },
    attention,
    upcoming: upcomingAll.slice(0, UPCOMING_LIMIT),
    recentActivity,
    announcements,
  };
}

// ---------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------

// GET /api/dashboard -> the dashboard of the logged-in user's role
export async function getDashboard(req, res) {
  const builders = {
    Student: buildStudentDashboard,
    Supervisor: buildSupervisorDashboard,
    Examiner: buildExaminerDashboard,
    Administrator: buildAdminDashboard,
  };
  res.json(await builders[req.user.role](req.user));
}
