// Group chat (FR-9, UC6) and supervisor–examiner chat (FR-10, UC12).
//
// A chat "channel" is one group + one type (chat_message.MsgType):
//   'Group' -> the group's students and its supervisor
//   'Staff' -> the group's supervisor and its examiner
// Administrators have no chat channels.
//
// Messages are saved through this REST API first, then pushed live with Socket.IO:
//   'chat:message' (the message) and 'chat:deleted' ({ id, groupId, channel })
//   to room group:<gid> (Group channel) or staff:<gid> (Staff channel).
// The other members get ONE 'Message' notification per channel: while it is still unread,
// new messages update it ("3 new messages in ...") instead of adding more rows.

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, oneOf, toInt, checkMaxLength } from '../utils/validate.js';
import { getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';
import { emitToRoom, emitToUser } from '../socket.js';
import { emitNotificationSync } from './notifications.controller.js';

const CHANNELS = ['Group', 'Staff'];
const MAX_MESSAGE_LENGTH = 2000;
const PAGE_SIZE = 50;

// SELECT list that turns a chat_message row (joined with its sender) into the API shape
const MESSAGE_COLUMNS = `
  m.ChatID AS id, m.GroupID AS groupId, m.MsgType AS channel, m.MessageText AS text, m.MsgDate AS date,
  m.SenderUserID AS senderId, u.Name AS senderName, u.Role AS senderRole`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Cuts text to a column size (notification Title 200, Message 500)
function cut(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// { ...row } -> { id, groupId, channel, text, date, sender: { id, name, role } }
function formatMessage(row) {
  return {
    id: row.id,
    groupId: row.groupId,
    channel: row.channel,
    text: row.text,
    date: row.date,
    sender: { id: row.senderId, name: row.senderName || 'Former user', role: row.senderRole || null },
  };
}

// Socket.IO room of a channel (the rooms are joined in socket.js)
function roomFor(groupId, channel) {
  return channel === 'Group' ? `group:${groupId}` : `staff:${groupId}`;
}

function channelLabel(groupName, channel) {
  return channel === 'Group' ? `${groupName} — Group chat` : `${groupName} — Supervisor & Examiner`;
}

// The page link of a channel. Message notifications use it, so it also identifies them.
function channelLink(groupId, channel) {
  return `/chat?groupId=${groupId}&channel=${channel}`;
}

// A link without a channel ("/chat?groupId=1") opens the user's default
// channel of that group: the Staff channel for examiners, the Group channel for everyone else.
function linksForChannel(user, groupId, channel) {
  const defaultChannel = user.role === 'Examiner' ? 'Staff' : 'Group';
  const links = [channelLink(groupId, channel)];
  if (channel === defaultChannel) links.push(`/chat?groupId=${groupId}`);
  return links;
}

// Title of a (collapsed) message notification: "New message in ..." or "3 new messages in ..."
function notificationTitle(count, label) {
  return count === 1 ? `New message in ${label}` : `${count} new messages in ${label}`;
}

// Reads the number back from such a title ("3 new messages in ..." -> 3, anything else -> 1)
function countFromTitle(title) {
  const match = /^(\d+) new messages/.exec(title || '');
  return match ? Number(match[1]) : 1;
}

// ---------------------------------------------------------------------------
// Channel membership
// ---------------------------------------------------------------------------

/**
 * The channels the user belongs to: [{ groupId, groupName, channel }], ordered by group name.
 *   Student    -> the Group channel of their own group
 *   Supervisor -> the Group channel of every group they supervise, plus its Staff channel
 *                 when the group has an examiner
 *   Examiner   -> the Staff channel of every group they examine that has a supervisor
 */
async function getUserChannels(user) {
  if (user.role === 'Student') {
    if (!user.groupId) return [];
    const groups = await query('SELECT GroupID AS groupId, GroupName AS groupName FROM project_group WHERE GroupID = ?', [
      user.groupId,
    ]);
    return groups.map((g) => ({ groupId: g.groupId, groupName: g.groupName, channel: 'Group' }));
  }

  if (user.role === 'Supervisor') {
    const groups = await query(
      `SELECT GroupID AS groupId, GroupName AS groupName, ExaminerID AS examinerId
         FROM project_group WHERE SupervisorID = ? ORDER BY GroupName`,
      [user.supervisorId]
    );
    return groups.flatMap((g) => {
      const channels = [{ groupId: g.groupId, groupName: g.groupName, channel: 'Group' }];
      if (g.examinerId) channels.push({ groupId: g.groupId, groupName: g.groupName, channel: 'Staff' });
      return channels;
    });
  }

  if (user.role === 'Examiner') {
    const groups = await query(
      `SELECT GroupID AS groupId, GroupName AS groupName
         FROM project_group WHERE ExaminerID = ? AND SupervisorID IS NOT NULL ORDER BY GroupName`,
      [user.examinerId]
    );
    return groups.map((g) => ({ groupId: g.groupId, groupName: g.groupName, channel: 'Staff' }));
  }

  return []; // Administrators do not take part in chats
}

/**
 * Checks the groupId + channel sent by the client and that the user is a member of that channel.
 * Returns { groupId, groupName, channel }. Throws 400 (bad input), 404 (no such group) or
 * 403 (not a member, e.g. a student removed from the group - UC6 exceptional flow).
 */
async function assertChannelMember(user, groupIdValue, channelValue) {
  requireFields({ groupId: groupIdValue, channel: channelValue }, { groupId: 'Group', channel: 'Channel' });
  const groupId = toInt(groupIdValue, 'Group id', { min: 1 });
  const channel = oneOf(channelValue, CHANNELS, 'Channel');

  const channels = await getUserChannels(user);
  const found = channels.find((c) => c.groupId === groupId && c.channel === channel);
  if (found) return found;

  const groups = await query('SELECT 1 FROM project_group WHERE GroupID = ?', [groupId]);
  if (groups.length === 0) throw new HttpError(404, 'Group not found');
  throw new HttpError(403, 'You do not have access to this chat.');
}

// UserIDs of the (active) members of a channel
function getChannelMemberIds(groupId, channel) {
  return channel === 'Group'
    ? getGroupUserIds(groupId, { students: true, supervisor: true, examiner: false })
    : getGroupUserIds(groupId, { students: false, supervisor: true, examiner: true });
}

// Members of several groups with their names: [{ groupId, id, name, role }]
async function getMembersOfGroups(groupIds) {
  return query(
    `SELECT s.GroupID AS groupId, u.UserID AS id, u.Name AS name, u.Role AS role
       FROM student s JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID IN (?) AND u.IsActive = 1
     UNION ALL
     SELECT g.GroupID, u.UserID, u.Name, u.Role
       FROM project_group g
       JOIN supervisor sp ON sp.SupervisorID = g.SupervisorID
       JOIN \`user\` u ON u.UserID = sp.UserID
      WHERE g.GroupID IN (?) AND u.IsActive = 1
     UNION ALL
     SELECT g.GroupID, u.UserID, u.Name, u.Role
       FROM project_group g
       JOIN examiner ex ON ex.ExaminerID = g.ExaminerID
       JOIN \`user\` u ON u.UserID = ex.UserID
      WHERE g.GroupID IN (?) AND u.IsActive = 1`,
    [groupIds, groupIds, groupIds]
  );
}

// ---------------------------------------------------------------------------
// Message notifications (FR-20)
// ---------------------------------------------------------------------------

/**
 * Unread message counts of the user per channel, as a Map "groupId:channel" -> number.
 * Each unread 'Message' notification stands for the number of messages in its title.
 */
async function getUnreadCounts(user, channels) {
  const counts = new Map();
  if (channels.length === 0) return counts;

  const unread = await query(
    `SELECT Link AS link, Title AS title FROM notification
      WHERE UserID = ? AND Type = 'Message' AND IsRead = 0`,
    [user.id]
  );
  for (const c of channels) {
    const links = linksForChannel(user, c.groupId, c.channel);
    const total = unread
      .filter((n) => links.includes(n.link))
      .reduce((sum, n) => sum + countFromTitle(n.title), 0);
    counts.set(`${c.groupId}:${c.channel}`, total);
  }
  return counts;
}

// Marks the user's message notifications of one channel as read. Returns how many changed.
async function markChannelRead(user, groupId, channel) {
  const result = await query(
    `UPDATE notification SET IsRead = 1
      WHERE UserID = ? AND Type = 'Message' AND IsRead = 0 AND Link IN (?)`,
    [user.id, linksForChannel(user, groupId, channel)]
  );
  if (result.affectedRows > 0) await emitNotificationSync(user.id); // updates the bell in every tab
  return result.affectedRows;
}

/**
 * Tells the other channel members about a new message.
 * If a member still has an UNREAD notification for this channel, that one is updated
 * (new count, latest text, new time) instead of adding another row - so a busy chat does not
 * flood the notification list. The update is sent live as 'notification:updated'.
 */
async function notifyChannelMembers(recipientIds, message, label) {
  const link = channelLink(message.groupId, message.channel);
  const preview = cut(`${message.sender.name}: ${message.text}`, 500);
  const needNewNotification = [];

  for (const userId of recipientIds) {
    const existing = await query(
      `SELECT NotificationID AS id, Title AS title FROM notification
        WHERE UserID = ? AND Type = 'Message' AND IsRead = 0 AND Link = ?
        ORDER BY CreatedAt DESC LIMIT 1`,
      [userId, link]
    );
    if (existing.length === 0) {
      needNewNotification.push(userId);
      continue;
    }

    const title = cut(notificationTitle(countFromTitle(existing[0].title) + 1, label), 200);
    const now = new Date();
    now.setMilliseconds(0); // DATETIME columns do not keep milliseconds
    await query('UPDATE notification SET Title = ?, Message = ?, CreatedAt = ? WHERE NotificationID = ?', [
      title,
      preview,
      now,
      existing[0].id,
    ]);
    emitToUser(userId, 'notification:updated', {
      id: existing[0].id,
      type: 'Message',
      title,
      message: preview,
      link,
      isRead: false,
      createdAt: now.toISOString(),
    });
  }

  // notify() inserts the rows and sends 'notification:new' (it never throws)
  await notify(needNewNotification, { type: 'Message', title: notificationTitle(1, label), message: preview, link });
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/chat/channels
 * [{ groupId, groupName, channel, label, members: [{ id, name, role }],
 *    lastMessage: { text, senderId, senderName, date } | null, unreadCount }]
 */
export async function listChannels(req, res) {
  const channels = await getUserChannels(req.user);
  if (channels.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = [...new Set(channels.map((c) => c.groupId))];

  // The newest message of every channel of these groups
  const lastMessages = await query(
    `SELECT m.GroupID AS groupId, m.MsgType AS channel, m.MessageText AS text, m.MsgDate AS date,
            m.SenderUserID AS senderId, COALESCE(u.Name, 'Former user') AS senderName
       FROM chat_message m
       JOIN (SELECT MAX(ChatID) AS lastId FROM chat_message WHERE GroupID IN (?) GROUP BY GroupID, MsgType) latest
         ON latest.lastId = m.ChatID
       LEFT JOIN \`user\` u ON u.UserID = m.SenderUserID`,
    [groupIds]
  );
  const members = await getMembersOfGroups(groupIds);
  const unreadCounts = await getUnreadCounts(req.user, channels);

  const result = channels.map((c) => {
    const last = lastMessages.find((m) => m.groupId === c.groupId && m.channel === c.channel);
    // Group channel: students + supervisor. Staff channel: supervisor + examiner.
    const allowedRoles = c.channel === 'Group' ? ['Supervisor', 'Student'] : ['Supervisor', 'Examiner'];
    const channelMembers = members
      .filter((m) => m.groupId === c.groupId && allowedRoles.includes(m.role))
      .sort((a, b) => allowedRoles.indexOf(a.role) - allowedRoles.indexOf(b.role) || a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, name: m.name, role: m.role }));

    return {
      groupId: c.groupId,
      groupName: c.groupName,
      channel: c.channel,
      label: channelLabel(c.groupName, c.channel),
      members: channelMembers,
      lastMessage: last
        ? { text: last.text, senderId: last.senderId, senderName: last.senderName, date: last.date }
        : null,
      unreadCount: unreadCounts.get(`${c.groupId}:${c.channel}`) || 0,
    };
  });

  res.json(result);
}

/**
 * Total number of unread chat messages of a user, over all their channels.
 * Also used by the dashboard's "Unread Messages" card, so both always show the same number.
 */
export async function countUnreadChatMessages(user) {
  const channels = await getUserChannels(user);
  const counts = await getUnreadCounts(user, channels);
  let count = 0;
  counts.forEach((value) => {
    count += value;
  });
  return count;
}

// GET /api/chat/unread-count -> { count }  (all unread chat messages of the user, e.g. for a badge)
export async function getChatUnreadCount(req, res) {
  res.json({ count: await countUnreadChatMessages(req.user) });
}

/**
 * GET /api/chat/messages?groupId=&channel=&before=<messageId>&limit=50
 * One page of messages in ascending order (oldest first). Use before=<id of the oldest shown
 * message> to load older ones; fewer than `limit` results means there is nothing older.
 */
export async function listMessages(req, res) {
  const { groupId, channel } = await assertChannelMember(req.user, req.query.groupId, req.query.channel);
  const limit = req.query.limit ? toInt(req.query.limit, 'Limit', { min: 1, max: 100 }) : PAGE_SIZE;
  const before = req.query.before ? toInt(req.query.before, 'Before', { min: 1 }) : null;

  // Take the newest `limit` messages (older than `before`), then flip them to oldest-first
  const rows = await query(
    `SELECT ${MESSAGE_COLUMNS}
       FROM chat_message m
       LEFT JOIN \`user\` u ON u.UserID = m.SenderUserID
      WHERE m.GroupID = ? AND m.MsgType = ? ${before ? 'AND m.ChatID < ?' : ''}
      ORDER BY m.ChatID DESC
      LIMIT ?`,
    before ? [groupId, channel, before, limit] : [groupId, channel, limit]
  );

  res.json(rows.reverse().map(formatMessage));
}

/**
 * POST /api/chat/messages { groupId, channel, text } -> 201 the saved message
 * Saves the message, notifies the other members and delivers it live (UC6, UC12).
 */
export async function sendMessage(req, res) {
  const { groupId, groupName, channel } = await assertChannelMember(req.user, req.body.groupId, req.body.channel);

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) throw new HttpError(400, 'Message cannot be empty.', { field: 'text' });
  checkMaxLength(text, MAX_MESSAGE_LENGTH, 'Message');

  const memberIds = await getChannelMemberIds(groupId, channel);
  const recipientIds = memberIds.filter((id) => id !== req.user.id);
  // A Staff message goes from one person to the other, so the receiver is stored as well
  const receiverId = channel === 'Staff' ? recipientIds[0] || null : null;

  const sentAt = new Date();
  sentAt.setMilliseconds(0);
  const result = await query(
    `INSERT INTO chat_message (GroupID, SenderUserID, ReceiverUserID, MsgType, MsgDate, MessageText)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [groupId, req.user.id, receiverId, channel, sentAt, text]
  );

  const message = {
    id: result.insertId,
    groupId,
    channel,
    text,
    date: sentAt.toISOString(),
    sender: { id: req.user.id, name: req.user.name, role: req.user.role },
  };

  // The sender has obviously seen this channel, so their own message notifications are cleared
  await markChannelRead(req.user, groupId, channel);
  await notifyChannelMembers(recipientIds, message, channelLabel(groupName, channel));

  // Deliver it live to everyone who has the chat open (the sender's other tabs too)
  emitToRoom(roomFor(groupId, channel), 'chat:message', message);

  res.status(201).json(message);
}

// PATCH /api/chat/read { groupId, channel } -> { message, updated }  (user opened the channel)
export async function markRead(req, res) {
  const { groupId, channel } = await assertChannelMember(req.user, req.body.groupId, req.body.channel);
  const updated = await markChannelRead(req.user, groupId, channel);
  res.json({ message: 'Chat marked as read', updated });
}

// DELETE /api/chat/messages/:id -> { message }  (UC6 alternative flow: a sender deletes their own message)
export async function deleteMessage(req, res) {
  const id = toInt(req.params.id, 'Message id');
  const rows = await query('SELECT GroupID, MsgType, SenderUserID FROM chat_message WHERE ChatID = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Message not found');

  const row = rows[0];
  await assertChannelMember(req.user, row.GroupID, row.MsgType);
  if (row.SenderUserID !== req.user.id) throw new HttpError(403, 'You can only delete your own messages.');

  await query('DELETE FROM chat_message WHERE ChatID = ?', [id]);
  emitToRoom(roomFor(row.GroupID, row.MsgType), 'chat:deleted', { id, groupId: row.GroupID, channel: row.MsgType });

  res.json({ message: 'Message deleted' });
}
