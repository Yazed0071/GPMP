// Creates in-app notifications (FR-20) and, when asked, also emails them (UC8).
// One call = one notification row per user + a live 'notification:new' socket event,
// so the bell in the navbar updates without refreshing the page.

import { query } from '../config/db.js';
import { config } from '../config/env.js';
import { emitToUser } from '../socket.js';
import { sendEmail, escapeHtml } from './email.js';

// Must match the CHECK constraint on notification.Type in schema.sql
export const NOTIFICATION_TYPES = [
  'Announcement',
  'Deadline',
  'Meeting',
  'Message',
  'Feedback',
  'Task',
  'Proposal',
  'System',
];

// Cuts text to the column size so a long title never makes the INSERT fail
function limit(text, max) {
  if (text === undefined || text === null) return null;
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Sends the email version of a notification to each user (runs in the background)
async function emailUsers(userIds, { title, message, link }) {
  const users = await query(
    'SELECT UserID, Name, Email FROM `user` WHERE UserID IN (?) AND IsActive = 1',
    [userIds]
  );
  const url = link ? `${config.clientUrl}${link}` : config.clientUrl;

  for (const user of users) {
    await sendEmail({
      to: user.Email,
      subject: `GPMP: ${title}`,
      text: `Hello ${user.Name},\n\n${message || title}\n\nOpen GPMP: ${url}\n\nGraduation Project Management Platform`,
      html:
        `<p>Hello ${escapeHtml(user.Name)},</p>` +
        `<p>${escapeHtml(message || title)}</p>` +
        `<p><a href="${escapeHtml(url)}">Open GPMP</a></p>` +
        '<p style="color:#6b7280">Graduation Project Management Platform</p>',
    });
  }
}

/**
 * Notifies one or more users.
 *   userIds: a UserID or an array of UserIDs (duplicates and empty values are ignored)
 *   type:    one of NOTIFICATION_TYPES
 *   title:   short text shown in bold (max 200 characters)
 *   message: optional longer text (max 500 characters)
 *   link:    optional page to open when clicked, e.g. '/tasks/4'
 *   email:   true to also send an email to each user
 * It NEVER throws: errors are logged, so the main action still succeeds.
 * Returns the created notifications (API shape).
 */
export async function notify(userIds, { type, title, message = null, link = null, email = false } = {}) {
  try {
    const list = Array.isArray(userIds) ? userIds : [userIds];
    const ids = [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length === 0 || !title) return [];

    let safeType = type;
    if (!NOTIFICATION_TYPES.includes(safeType)) {
      console.error(`[notify] Unknown notification type "${type}", using "System" instead.`);
      safeType = 'System';
    }

    const safeTitle = limit(title, 200);
    const safeMessage = limit(message, 500);
    const safeLink = limit(link, 255);

    // Whole seconds, because DATETIME columns do not keep milliseconds
    const createdAt = new Date();
    createdAt.setMilliseconds(0);

    const created = [];
    for (const userId of ids) {
      try {
        const result = await query(
          `INSERT INTO notification (UserID, Type, Title, Message, Link, IsRead, CreatedAt)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [userId, safeType, safeTitle, safeMessage, safeLink, createdAt]
        );
        const notification = {
          id: result.insertId,
          type: safeType,
          title: safeTitle,
          message: safeMessage,
          link: safeLink,
          isRead: false,
          createdAt: createdAt.toISOString(),
        };
        emitToUser(userId, 'notification:new', notification);
        created.push(notification);
      } catch (err) {
        console.error(`[notify] Could not notify user ${userId}:`, err.message);
      }
    }

    if (email) {
      // Not awaited: sending emails can be slow and must not delay the response
      emailUsers(ids, { title: safeTitle, message: safeMessage, link: safeLink }).catch((err) =>
        console.error('[notify] Email notification failed:', err.message)
      );
    }

    return created;
  } catch (err) {
    console.error('[notify] Failed:', err.message);
    return [];
  }
}
