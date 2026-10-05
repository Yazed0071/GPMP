// Announcements (FR-12, UC7) with in-app + email notifications (FR-20, UC8).
//
// Who can post: Administrators (to everyone, to one role, or to one group) and Supervisors
// (only to the groups they supervise). The publisher or an administrator can edit or delete.
//
// Visibility rule (dashboard.controller.js uses the same rule) - an announcement is visible when
//   (TargetRole = 'All' OR TargetRole = the user's role OR the user is an Administrator)
//   AND (GroupID IS NULL OR the user can access that group)
// and the publisher always sees their own announcements.

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, isBlank, oneOf, toInt, toOptionalInt, checkMaxLength } from '../utils/validate.js';
import { getAccessibleGroupIds, getGroupUserIds, isGroupSupervisor } from '../services/access.js';
import { notify } from '../services/notify.js';

const TARGET_ROLES = ['All', 'Student', 'Supervisor', 'Examiner'];
const MAX_CONTENT_LENGTH = 10000;

// Columns + joins that give every announcement its publisher and group name
const ANNOUNCEMENT_SELECT = `
  SELECT a.AnnouncementID AS id, a.AnnouncementTitle AS title, a.AnnouncementContent AS content,
         a.AnnouncementDate AS date, a.AnnouncementEditDate AS editedAt, a.TargetRole AS targetRole,
         a.GroupID AS groupId, g.GroupName AS groupName,
         a.PublishedByUserID AS publisherId, u.Name AS publisherName, u.Role AS publisherRole
    FROM announcement a
    LEFT JOIN project_group g ON g.GroupID = a.GroupID
    LEFT JOIN \`user\` u      ON u.UserID = a.PublishedByUserID`;

// The publisher and administrators may edit or delete an announcement
function canManage(user, publisherId) {
  return user.role === 'Administrator' || (publisherId !== null && publisherId === user.id);
}

// Database row -> API shape
function formatAnnouncement(row, user) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    date: row.date,
    editedAt: row.editedAt,
    targetRole: row.targetRole,
    group: row.groupId ? { id: row.groupId, name: row.groupName } : null,
    publisher: row.publisherId ? { id: row.publisherId, name: row.publisherName, role: row.publisherRole } : null,
    canEdit: canManage(user, row.publisherId),
  };
}

// Loads one announcement in API shape (used after create / update)
async function loadAnnouncement(id, user) {
  const rows = await query(`${ANNOUNCEMENT_SELECT} WHERE a.AnnouncementID = ?`, [id]);
  return rows.length ? formatAnnouncement(rows[0], user) : null;
}

/**
 * Builds the WHERE condition of the visibility rule for one user.
 * Returns { sql, params } to put into a query.
 */
async function visibilityCondition(user) {
  if (user.role === 'Administrator') return { sql: 'TRUE', params: [] }; // admins see everything

  const groupIds = await getAccessibleGroupIds(user);
  const groupSql = groupIds.length > 0 ? '(a.GroupID IS NULL OR a.GroupID IN (?))' : 'a.GroupID IS NULL';
  const groupParams = groupIds.length > 0 ? [groupIds] : [];

  return {
    sql: `(a.PublishedByUserID = ? OR ((a.TargetRole = 'All' OR a.TargetRole = ?) AND ${groupSql}))`,
    params: [user.id, user.role, ...groupParams],
  };
}

/**
 * Checks and cleans the form values of a new or edited announcement.
 * `existing` is the current row when editing (missing fields keep their old value).
 * Returns { title, content, targetRole, groupId }.
 */
async function readAnnouncementInput(user, body, existing = null) {
  requireFields(body, ['title', 'content']); // "Title is required" / "Content is required" (UC7)
  const title = String(body.title).trim();
  const content = String(body.content).trim();
  checkMaxLength(title, 200, 'Title');
  checkMaxLength(content, MAX_CONTENT_LENGTH, 'Content');

  const oldTargetRole = existing ? existing.TargetRole : 'All';
  const targetRole = isBlank(body.targetRole) ? oldTargetRole : oneOf(body.targetRole, TARGET_ROLES, 'Audience');

  const oldGroupId = existing ? existing.GroupID : null;
  const groupId = body.groupId === undefined ? oldGroupId : toOptionalInt(body.groupId, 'Group');

  if (groupId !== null) {
    const groups = await query('SELECT 1 FROM project_group WHERE GroupID = ?', [groupId]);
    if (groups.length === 0) throw new HttpError(404, 'Group not found');
  }

  // Supervisors post to one of THEIR groups only (keeping the same group on edit is allowed)
  if (user.role === 'Supervisor') {
    if (groupId === null) throw new HttpError(400, 'Please choose one of your groups', { field: 'groupId' });
    if (groupId !== oldGroupId && !(await isGroupSupervisor(user, groupId))) {
      throw new HttpError(403, 'You can only post announcements to the groups you supervise.');
    }
  }

  return { title, content, targetRole, groupId };
}

// UserIDs of everyone who should be told about an announcement
async function getRecipientIds({ targetRole, groupId }) {
  const forRole = (role) => targetRole === 'All' || targetRole === role;

  if (groupId) {
    return getGroupUserIds(groupId, {
      students: forRole('Student'),
      supervisor: forRole('Supervisor'),
      examiner: forRole('Examiner'),
    });
  }

  const rows =
    targetRole === 'All'
      ? await query('SELECT UserID FROM `user` WHERE IsActive = 1')
      : await query('SELECT UserID FROM `user` WHERE IsActive = 1 AND Role = ?', [targetRole]);
  return rows.map((row) => row.UserID);
}

// Loads an announcement the user may edit/delete, or throws 404 / 403
async function findManageableAnnouncement(user, id) {
  const rows = await query(
    'SELECT AnnouncementID, PublishedByUserID, TargetRole, GroupID FROM announcement WHERE AnnouncementID = ?',
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'Announcement not found');
  if (!canManage(user, rows[0].PublishedByUserID)) {
    throw new HttpError(403, 'You can only change announcements you published.');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/announcements?limit=
 * The announcements the user may see, newest first.
 */
export async function listAnnouncements(req, res) {
  const limit = req.query.limit ? toInt(req.query.limit, 'Limit', { min: 1, max: 500 }) : 200;
  const visible = await visibilityCondition(req.user);

  const rows = await query(
    `${ANNOUNCEMENT_SELECT}
      WHERE ${visible.sql}
      ORDER BY a.AnnouncementDate DESC, a.AnnouncementID DESC
      LIMIT ?`,
    [...visible.params, limit]
  );
  res.json(rows.map((row) => formatAnnouncement(row, req.user)));
}

/**
 * POST /api/announcements { title, content, targetRole?, groupId? } -> 201 the announcement
 * Publishes it and notifies every target user in the app and by email (UC7, UC8).
 */
export async function createAnnouncement(req, res) {
  const values = await readAnnouncementInput(req.user, req.body);

  const now = new Date();
  now.setMilliseconds(0);
  const result = await query(
    `INSERT INTO announcement
       (PublishedByUserID, AnnouncementDate, AnnouncementTitle, AnnouncementContent, TargetRole, GroupID)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, now, values.title, values.content, values.targetRole, values.groupId]
  );

  // UC8: notification + email. notify() never throws; a failed email is only logged (UC7 exceptional flow)
  const recipients = (await getRecipientIds(values)).filter((id) => id !== req.user.id);
  await notify(recipients, {
    type: 'Announcement',
    title: `New announcement: ${values.title}`,
    message: values.content,
    link: '/announcements',
    email: true,
  });

  res.status(201).json(await loadAnnouncement(result.insertId, req.user));
}

// PUT /api/announcements/:id { title, content, targetRole?, groupId? } -> the updated announcement
export async function updateAnnouncement(req, res) {
  const id = toInt(req.params.id, 'Announcement id');
  const existing = await findManageableAnnouncement(req.user, id);
  const values = await readAnnouncementInput(req.user, req.body, existing);

  const now = new Date();
  now.setMilliseconds(0);
  await query(
    `UPDATE announcement
        SET AnnouncementTitle = ?, AnnouncementContent = ?, TargetRole = ?, GroupID = ?, AnnouncementEditDate = ?
      WHERE AnnouncementID = ?`,
    [values.title, values.content, values.targetRole, values.groupId, now, id]
  );

  res.json(await loadAnnouncement(id, req.user));
}

// DELETE /api/announcements/:id -> { message }
export async function deleteAnnouncement(req, res) {
  const id = toInt(req.params.id, 'Announcement id');
  await findManageableAnnouncement(req.user, id);

  await query('DELETE FROM announcement WHERE AnnouncementID = ?', [id]);
  res.json({ message: 'Announcement deleted' });
}
