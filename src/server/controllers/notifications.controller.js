// In-app notifications (FR-20): every user can list, read and delete ONLY their own notifications.
// Notifications are created by other features through services/notify.js
// (announcements, deadlines, meetings, chat messages, feedback...).
//
// Live updates: after a change here the server sends 'notification:sync' { unreadCount } to all
// open tabs of the user, so the navbar bell and the notifications page stay in step.

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { toInt, toBool } from '../utils/validate.js';
import { emitToUser } from '../socket.js';

// SELECT list that turns a notification row into the API shape (camelCase keys)
const NOTIFICATION_COLUMNS = `
  n.NotificationID AS id, n.Type AS type, n.Title AS title, n.Message AS message,
  n.Link AS link, n.IsRead AS isRead, n.CreatedAt AS createdAt`;

// Converts the TINYINT IsRead flag to true/false
function formatNotification(row) {
  return { ...row, isRead: toBool(row.isRead) };
}

// Number of unread notifications of one user (also used by the dashboard)
export async function countUnread(userId) {
  const rows = await query('SELECT COUNT(*) AS count FROM notification WHERE UserID = ? AND IsRead = 0', [
    userId,
  ]);
  return rows[0].count;
}

// Tells every open tab of the user that their notifications changed (read / deleted).
// Also used by the chat controller when a channel is read.
export async function emitNotificationSync(userId) {
  emitToUser(userId, 'notification:sync', { unreadCount: await countUnread(userId) });
}

// Loads one notification that belongs to the logged-in user, or throws 404
async function findOwnNotification(userId, id) {
  const rows = await query(`SELECT ${NOTIFICATION_COLUMNS} FROM notification n WHERE n.NotificationID = ? AND n.UserID = ?`, [
    id,
    userId,
  ]);
  if (rows.length === 0) throw new HttpError(404, 'Notification not found');
  return rows[0];
}

/**
 * GET /api/notifications?unread=true&limit=50
 * The user's notifications, newest first. unread=true returns only unread ones.
 */
export async function listNotifications(req, res) {
  const limit = req.query.limit ? toInt(req.query.limit, 'Limit', { min: 1, max: 200 }) : 50;
  const onlyUnread = toBool(req.query.unread);

  const rows = await query(
    `SELECT ${NOTIFICATION_COLUMNS}
       FROM notification n
      WHERE n.UserID = ? ${onlyUnread ? 'AND n.IsRead = 0' : ''}
      ORDER BY n.CreatedAt DESC, n.NotificationID DESC
      LIMIT ?`,
    [req.user.id, limit]
  );
  res.json(rows.map(formatNotification));
}

// GET /api/notifications/unread-count -> { count }  (the number on the bell)
export async function getUnreadCount(req, res) {
  res.json({ count: await countUnread(req.user.id) });
}

// PATCH /api/notifications/:id/read -> the updated notification
export async function markAsRead(req, res) {
  const id = toInt(req.params.id, 'Notification id');
  const notification = await findOwnNotification(req.user.id, id);

  if (!toBool(notification.isRead)) {
    await query('UPDATE notification SET IsRead = 1 WHERE NotificationID = ?', [id]);
    await emitNotificationSync(req.user.id);
  }
  res.json(formatNotification({ ...notification, isRead: true }));
}

// PATCH /api/notifications/read-all -> { message, updated }
export async function markAllAsRead(req, res) {
  const result = await query('UPDATE notification SET IsRead = 1 WHERE UserID = ? AND IsRead = 0', [req.user.id]);
  await emitNotificationSync(req.user.id);
  res.json({ message: 'All notifications marked as read', updated: result.affectedRows });
}

// DELETE /api/notifications/:id -> { message }
export async function deleteNotification(req, res) {
  const id = toInt(req.params.id, 'Notification id');
  await findOwnNotification(req.user.id, id);

  await query('DELETE FROM notification WHERE NotificationID = ? AND UserID = ?', [id, req.user.id]);
  await emitNotificationSync(req.user.id);
  res.json({ message: 'Notification deleted' });
}
