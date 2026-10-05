// Calendar events (FR-13, UC9 Manage Deadlines).
//
// Every group has its own calendar; the calendar with GroupID = NULL is the shared academic
// calendar that everybody sees. Events (deadlines, meetings, presentations, academic dates)
// are rows of the important_date table. Task due dates (FR-14) are shown on the calendar too,
// as read-only items with ids like 'task-5'.
//
// Who may ADD an event:
//   shared academic calendar -> administrators only
//   a group calendar         -> the group's supervisor or an administrator;
//                               students of the group may add meetings only
// Who may CHANGE or DELETE an event: the group's supervisor or an administrator, and the
// student who created a meeting, but only until it starts (after that its attendance belongs
// to the supervisor, FR-15). Once attendance was recorded, the event's date and type stay fixed.
// The calendar of an archived project (FR-8) can only be changed by an administrator.

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import {
  isBlank,
  isValidDate,
  isValidDateTime,
  oneOf,
  toInt,
  toOptionalInt,
  trimOrNull,
  checkMaxLength,
} from '../utils/validate.js';
import {
  getAccessibleGroupIds,
  assertGroupAccess,
  canAccessGroup,
  getArchivedGroupIds,
  assertGroupNotArchived,
} from '../services/access.js';
import { notify } from '../services/notify.js';
import {
  formatEventTime,
  notificationTypeFor,
  calendarLinkFor,
  getEventAudience,
} from '../services/reminders.js';

// Allowed values (must match the CHECK constraints of important_date in schema.sql)
export const EVENT_TYPES = ['Deadline', 'Meeting', 'Presentation', 'Academic'];
export const EVENT_PRIORITIES = ['Low', 'Medium', 'High'];

const HOUR_MS = 60 * 60 * 1000;

// Every event query selects these columns, already renamed to the API names
const EVENT_SELECT = `
  SELECT d.DeadlineID AS id, d.Title AS title, d.Description AS description,
         d.DeadlineType AS type, d.DeadlinePriority AS priority,
         d.EventDate AS eventDate, d.EndDate AS endDate, d.Location AS location,
         d.ReminderSent AS reminderSent,
         d.DeadlineSetDate AS createdAt, d.DeadlineUpdateDate AS updatedAt,
         c.GroupID AS groupId, g.GroupName AS groupName,
         d.CreatedByUserID AS createdById, u.Name AS createdByName
    FROM important_date d
    JOIN calendar c ON c.CalendarID = d.CalendarID
    LEFT JOIN project_group g ON g.GroupID = c.GroupID
    LEFT JOIN \`user\` u ON u.UserID = d.CreatedByUserID`;

// ---------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------

/**
 * Loads what we need to decide permissions for many events at once: the user, the groups
 * they can access (null = all groups, for administrators) and which of them are archived.
 * `groupIds` can be passed when the caller already knows them (the dashboard does).
 */
export async function getPermissionContext(user, groupIds) {
  const accessible = groupIds === undefined ? await getAccessibleGroupIds(user) : groupIds;
  return { user, groupIds: accessible, archivedGroupIds: await getArchivedGroupIds(accessible) };
}

// True when the user may change or delete this event (see the rules at the top of the file)
function canEditEvent(context, event) {
  const { user, groupIds, archivedGroupIds = [] } = context;
  if (user.role === 'Administrator') return true;
  if (event.groupId === null) return false; // the shared academic calendar belongs to the admins
  if (!groupIds.includes(event.groupId)) return false; // not one of the user's groups
  if (archivedGroupIds.includes(event.groupId)) return false; // FR-8: archived projects stay as they are
  if (user.role === 'Supervisor') return true; // supervisors manage their groups' calendars

  // Everyone else (students): only the events they created, and only until they start.
  // Once a meeting has started, its attendance belongs to the supervisor (FR-15, UC14),
  // so a student can no longer move or delete it.
  if (event.createdById !== user.id) return false;
  return new Date(event.eventDate).getTime() > Date.now();
}

/**
 * Checks that the user may ADD an event of this type to the calendar of groupIdValue.
 * Returns the group id (a number), or null for the shared academic calendar.
 */
async function checkCanAddEvent(user, groupIdValue, type) {
  if (isBlank(groupIdValue)) {
    if (user.role !== 'Administrator') {
      throw new HttpError(403, 'Only administrators can add events to the shared academic calendar.');
    }
    return null;
  }

  const groupId = await assertGroupAccess(user, groupIdValue);
  if (user.role === 'Examiner') {
    throw new HttpError(403, 'Examiners cannot add events to a group calendar.');
  }
  await assertGroupNotArchived(user, groupId); // FR-8
  if (user.role === 'Student' && type !== 'Meeting') {
    throw new HttpError(403, 'Students can only schedule meetings.');
  }
  return groupId;
}

// ---------------------------------------------------------------------
// Converting database rows into API objects
// ---------------------------------------------------------------------

function toEvent(row, context) {
  return {
    id: row.id,
    source: 'event',
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    eventDate: row.eventDate,
    endDate: row.endDate,
    allDay: false,
    location: row.location,
    groupId: row.groupId,
    groupName: row.groupName,
    isShared: row.groupId === null,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName } : null,
    link: calendarLinkFor(row.groupId, row.eventDate),
    canEdit: canEditEvent(context, row),
    reminderSent: Boolean(row.reminderSent),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// A task due date shown on the calendar. eventDate is the plain 'YYYY-MM-DD' due date.
function toTaskItem(row) {
  return {
    id: `task-${row.taskId}`,
    source: 'task',
    taskId: row.taskId,
    title: row.title,
    description: row.description,
    type: 'Task',
    priority: null,
    eventDate: row.dueDate,
    endDate: null,
    allDay: true,
    location: null,
    groupId: row.groupId,
    groupName: row.groupName,
    isShared: false,
    createdBy: null,
    link: `/tasks/${row.taskId}`,
    canEdit: false, // tasks are edited on the Tasks page, not on the calendar
    status: row.status,
    isMilestone: Boolean(row.isMilestone),
  };
}

// The moment used to sort calendar items. A task counts as due at the end of its day.
function sortTime(item) {
  if (item.source === 'task') return Date.parse(`${item.eventDate}T23:59:59Z`);
  return new Date(item.eventDate).getTime();
}

// ---------------------------------------------------------------------
// Reading calendar items (also used by dashboard.controller.js)
// ---------------------------------------------------------------------

/**
 * Returns the events and task due dates of some calendars, sorted by date.
 *   groupIds       array of group ids to include, or null for ALL groups (already access-checked!)
 *   includeShared  true = also include the shared academic calendar
 *   from, to       optional Date range; an event is included when it overlaps the range
 *   fromDay        optional 'YYYY-MM-DD'; tasks due before this day are left out
 *                  (default: the UTC day of `from`)
 *   includeTasks   false = only events
 *   skipCompleted  true = leave out tasks that are already Completed
 */
export async function fetchCalendarItems(
  context,
  { groupIds, includeShared = true, from = null, to = null, fromDay = null, includeTasks = true, skipCompleted = false }
) {
  const items = [];
  const hasGroups = groupIds === null || groupIds.length > 0;

  // 1) Events of the chosen calendars
  const calendarParts = [];
  const params = [];
  if (includeShared) calendarParts.push('c.GroupID IS NULL');
  if (groupIds === null) {
    calendarParts.push('c.GroupID IS NOT NULL');
  } else if (groupIds.length > 0) {
    calendarParts.push('c.GroupID IN (?)');
    params.push(groupIds);
  }

  if (calendarParts.length > 0) {
    let sql = `${EVENT_SELECT} WHERE (${calendarParts.join(' OR ')})`;
    // An event overlaps the range when it starts before the range ends
    // and ends (or starts, when it has no end) after the range starts
    if (to) {
      sql += ' AND d.EventDate <= ?';
      params.push(to);
    }
    if (from) {
      sql += ' AND COALESCE(d.EndDate, d.EventDate) >= ?';
      params.push(from);
    }
    const rows = await query(sql, params);
    items.push(...rows.map((row) => toEvent(row, context)));
  }

  // 2) Task due dates of the groups (read-only items)
  if (includeTasks && hasGroups) {
    const taskParams = [];
    let sql = `
      SELECT t.TaskID AS taskId, t.Title AS title, t.Description AS description,
             t.DueDate AS dueDate, t.Status AS status, t.IsMilestone AS isMilestone,
             t.GroupID AS groupId, g.GroupName AS groupName
        FROM task t
        JOIN project_group g ON g.GroupID = t.GroupID
       WHERE t.DueDate IS NOT NULL`;
    if (groupIds !== null) {
      sql += ' AND t.GroupID IN (?)';
      taskParams.push(groupIds);
    }
    const firstDay = fromDay || (from ? from.toISOString().slice(0, 10) : null);
    if (firstDay) {
      sql += ' AND t.DueDate >= ?';
      taskParams.push(firstDay);
    }
    if (to) {
      sql += ' AND t.DueDate <= ?';
      taskParams.push(to.toISOString().slice(0, 10));
    }
    if (skipCompleted) sql += " AND t.Status <> 'Completed'";

    const rows = await query(sql, taskParams);
    items.push(...rows.map(toTaskItem));
  }

  return items.sort((a, b) => sortTime(a) - sortTime(b));
}

// ---------------------------------------------------------------------
// Small helpers for the handlers
// ---------------------------------------------------------------------

// Loads one event (raw row) or throws 404
async function findEvent(idValue) {
  const id = toInt(idValue, 'Event id', { min: 1 });
  const rows = await query(`${EVENT_SELECT} WHERE d.DeadlineID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Event not found');
  return rows[0];
}

// Everyone can see the shared calendar; group events only people with access to the group
async function assertCanViewEvent(user, event) {
  if (event.groupId !== null && !(await canAccessGroup(user, event.groupId))) {
    throw new HttpError(403, 'You do not have access to this group');
  }
}

// Returns the CalendarID of a group (null = the shared calendar), creating the calendar if it is missing
async function getCalendarId(groupId) {
  const rows =
    groupId === null
      ? await query('SELECT CalendarID FROM calendar WHERE GroupID IS NULL ORDER BY CalendarID LIMIT 1')
      : await query('SELECT CalendarID FROM calendar WHERE GroupID = ?', [groupId]);
  if (rows.length > 0) return rows[0].CalendarID;

  const result = await query('INSERT INTO calendar (GroupID) VALUES (?)', [groupId]);
  return result.insertId;
}

// Reads a date-time sent by the client (ISO text) or keeps a Date from the database
function parseDateTime(value, message, field) {
  if (value instanceof Date) return value;
  if (!isValidDateTime(value)) throw new HttpError(400, message, { field });
  return new Date(value);
}

// A small grace period so an event set for "right now" is not rejected because a few seconds passed
function isInPast(date) {
  return date.getTime() < Date.now() - 60 * 1000;
}

/**
 * Reads and checks the event fields from the request body.
 * For an update, `existing` is the current event: fields that are not sent keep their value.
 */
function readEventInput(body, existing = null) {
  const pick = (name, current) => (body[name] === undefined ? current : body[name]);

  const title = trimOrNull(pick('title', existing?.title));
  if (!title) throw new HttpError(400, 'Title is required', { field: 'title' });
  checkMaxLength(title, 200, 'Title');

  const type = oneOf(pick('type', existing?.type) || 'Deadline', EVENT_TYPES, 'Event type');
  const priority = oneOf(pick('priority', existing?.priority) || 'Medium', EVENT_PRIORITIES, 'Priority');

  const description = trimOrNull(pick('description', existing?.description));
  checkMaxLength(description, 5000, 'Description');
  const location = trimOrNull(pick('location', existing?.location));
  checkMaxLength(location, 200, 'Location');

  const eventDateValue = pick('eventDate', existing?.eventDate);
  if (isBlank(eventDateValue)) throw new HttpError(400, 'Event date is required', { field: 'eventDate' });
  const eventDate = parseDateTime(eventDateValue, 'Please choose a valid date and time for the event.', 'eventDate');

  const endDateValue = pick('endDate', existing?.endDate);
  const endDate = isBlank(endDateValue)
    ? null
    : parseDateTime(endDateValue, 'Please choose a valid end date and time.', 'endDate');
  if (endDate && endDate <= eventDate) {
    throw new HttpError(400, 'The end time must be after the start time.', { field: 'endDate' });
  }

  return { title, type, priority, description, location, eventDate, endDate };
}

// Reads the optional ?from= / ?to= of a list request. A plain date means the start / end of that (UTC) day.
function parseRangeValue(value, edge) {
  if (isBlank(value)) return null;
  if (isValidDate(value)) {
    return new Date(edge === 'start' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`);
  }
  if (isValidDateTime(value)) return new Date(value);
  throw new HttpError(400, 'Please choose a valid date range.');
}

/**
 * UC9 exceptional flow: "If the selected date conflicts with another event, the system displays
 * a warning message." Two events conflict when their times overlap on the same calendar, or,
 * for a supervisor, on the calendar of another group they supervise (so they are warned about
 * double-booking themselves). Only calendars the user can already see are checked, so no other
 * group's events are revealed. An event without an end time counts as one hour long.
 */
async function findConflicts(user, groupId, start, end, excludeId = null) {
  const newEnd = end || new Date(start.getTime() + HOUR_MS);
  const params = [];
  let sql = `
    SELECT d.DeadlineID AS id, d.Title AS title, d.DeadlineType AS type,
           d.EventDate AS eventDate, d.EndDate AS endDate,
           c.GroupID AS groupId, g.GroupName AS groupName
      FROM important_date d
      JOIN calendar c ON c.CalendarID = d.CalendarID
      LEFT JOIN project_group g ON g.GroupID = c.GroupID
     WHERE `;
  if (groupId === null) {
    sql += 'c.GroupID IS NULL';
  } else {
    // The group's own calendar, plus the other groups of a supervisor
    const groupIds = [groupId];
    if (user.role === 'Supervisor') groupIds.push(...(await getAccessibleGroupIds(user)));
    sql += 'c.GroupID IN (?)';
    params.push([...new Set(groupIds)]);
  }
  sql += ` AND d.DeadlineID <> ?
           AND d.EventDate < ?
           AND COALESCE(d.EndDate, d.EventDate + INTERVAL 1 HOUR) > ?
         ORDER BY d.EventDate`;
  params.push(excludeId || 0, newEnd, start);
  return query(sql, params);
}

// The warning text shown to the user, or null when there is no conflict, e.g.
// 'This time conflicts with "Weekly Meeting" (Wed, Sep 30, 10:00 AM) on the Team Alpha calendar.'
function conflictWarning(conflicts) {
  if (conflicts.length === 0) return null;
  const first = conflicts[0];
  const others = conflicts.length > 1 ? ` and ${conflicts.length - 1} other event(s)` : '';
  const calendar = first.groupName ? `the ${first.groupName} calendar` : 'the academic calendar';
  return `This time conflicts with "${first.title}" (${formatEventTime(first.eventDate)}) on ${calendar}${others}.`;
}

/**
 * Tells the people involved about a new, moved or cancelled event (FR-20).
 * The person who made the change is not notified. Deadlines and presentations are also emailed (UC8).
 */
async function notifyAboutEvent(event, action, actorUserId) {
  const audience = await getEventAudience(event.groupId, event.type);
  const userIds = audience.filter((id) => id !== actorUserId);

  const label = event.type === 'Academic' ? 'Academic date' : event.type; // e.g. "Meeting"
  const titles = {
    created: `New ${label.toLowerCase()}: ${event.title}`,
    rescheduled: `${label} rescheduled: ${event.title}`,
    cancelled: `${label} cancelled: ${event.title}`,
  };
  const calendarName = event.groupName || 'Academic calendar';
  const when = formatEventTime(event.eventDate);
  const messages = {
    created: `${calendarName} · ${when}${event.location ? ` · ${event.location}` : ''}`,
    rescheduled: `${calendarName} · now on ${when}${event.location ? ` · ${event.location}` : ''}`,
    cancelled: `${calendarName} · it was planned for ${when}`,
  };

  await notify(userIds, {
    type: notificationTypeFor(event.type),
    title: titles[action],
    message: messages[action],
    link: calendarLinkFor(event.groupId, event.eventDate),
    email: event.type === 'Deadline' || event.type === 'Presentation',
  });
}

// ---------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------

/**
 * GET /api/events?from=&to=&groupId=
 * Events of the shared academic calendar + the calendars of the user's groups
 * (or only the ?groupId group), plus task due dates, overlapping the date range.
 */
export async function listEvents(req, res) {
  const from = parseRangeValue(req.query.from, 'start');
  const to = parseRangeValue(req.query.to, 'end');
  if (from && to && from > to) {
    throw new HttpError(400, 'The start of the date range must be before its end.');
  }

  const groupIds = isBlank(req.query.groupId)
    ? await getAccessibleGroupIds(req.user) // null = all groups (administrators)
    : [await assertGroupAccess(req.user, req.query.groupId)];

  const context = await getPermissionContext(req.user);
  const items = await fetchCalendarItems(context, { groupIds, from, to });
  res.json(items);
}

/**
 * GET /api/events/conflicts?eventDate=&endDate=&groupId=&excludeId=
 * UC9: lets the form warn about overlapping events BEFORE the user saves.
 */
export async function checkConflicts(req, res) {
  if (isBlank(req.query.eventDate)) throw new HttpError(400, 'Event date is required', { field: 'eventDate' });
  const start = parseDateTime(req.query.eventDate, 'Please choose a valid date and time for the event.', 'eventDate');
  const end = isBlank(req.query.endDate)
    ? null
    : parseDateTime(req.query.endDate, 'Please choose a valid end date and time.', 'endDate');
  const groupId = isBlank(req.query.groupId) ? null : await assertGroupAccess(req.user, req.query.groupId);
  const excludeId = toOptionalInt(req.query.excludeId, 'Event id');

  const conflicts = await findConflicts(req.user, groupId, start, end, excludeId);
  res.json({ conflicts, warning: conflictWarning(conflicts) });
}

// GET /api/events/:id -> one event
export async function getEvent(req, res) {
  const event = await findEvent(req.params.id);
  await assertCanViewEvent(req.user, event);
  res.json(toEvent(event, await getPermissionContext(req.user)));
}

/**
 * POST /api/events { title, description?, type, priority?, eventDate, endDate?, location?, groupId? }
 * UC9: validates and stores the event, then notifies the related users.
 * The answer is the new event plus `conflicts` and a `warning` text when it overlaps other events.
 */
export async function createEvent(req, res) {
  const input = readEventInput(req.body);
  if (isInPast(input.eventDate)) {
    throw new HttpError(400, 'The event date cannot be in the past.', { field: 'eventDate' });
  }
  const groupId = await checkCanAddEvent(req.user, req.body.groupId, input.type);
  const calendarId = await getCalendarId(groupId);

  const result = await query(
    `INSERT INTO important_date
       (CalendarID, DeadlineType, DeadlinePriority, Title, Description, EventDate, EndDate, Location, CreatedByUserID)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      calendarId,
      input.type,
      input.priority,
      input.title,
      input.description,
      input.eventDate,
      input.endDate,
      input.location,
      req.user.id,
    ]
  );

  const event = await findEvent(result.insertId);
  const conflicts = await findConflicts(req.user, groupId, input.eventDate, input.endDate, event.id);
  await notifyAboutEvent(event, 'created', req.user.id);

  const context = await getPermissionContext(req.user);
  res.status(201).json({ ...toEvent(event, context), conflicts, warning: conflictWarning(conflicts) });
}

/**
 * PUT /api/events/:id  (the group's supervisor, an administrator, or the student who created
 * the meeting before it starts - see canEditEvent)
 * Fields that are not sent keep their value. The calendar (group) of an event cannot be changed.
 * When the date changes, a new reminder will be sent and the related users are notified.
 * Once attendance was recorded, the date and type cannot be changed any more (409).
 */
export async function updateEvent(req, res) {
  const existing = await findEvent(req.params.id);
  const context = await getPermissionContext(req.user);
  if (!canEditEvent(context, existing)) {
    throw new HttpError(403, 'You do not have permission to change this event.');
  }

  const input = readEventInput(req.body, existing);
  if (req.user.role === 'Student' && input.type !== 'Meeting') {
    throw new HttpError(403, 'Students can only schedule meetings.');
  }

  const startChanged = input.eventDate.getTime() !== existing.eventDate.getTime();
  const endChanged = (input.endDate?.getTime() ?? null) !== (existing.endDate?.getTime() ?? null);
  // A past event may still be corrected (e.g. its description), but it cannot be MOVED into the past
  if (startChanged && isInPast(input.eventDate)) {
    throw new HttpError(400, 'The event date cannot be in the past.', { field: 'eventDate' });
  }

  // Recorded attendance must stay with the session it was taken for (FR-15)
  if (startChanged || input.type !== existing.type) {
    const recorded = await query('SELECT 1 FROM attendance WHERE DeadlineID = ? LIMIT 1', [existing.id]);
    if (recorded.length > 0) {
      throw new HttpError(
        409,
        'Attendance has already been recorded for this meeting, so its date and type cannot be changed.'
      );
    }
  }

  await query(
    `UPDATE important_date
        SET DeadlineType = ?, DeadlinePriority = ?, Title = ?, Description = ?,
            EventDate = ?, EndDate = ?, Location = ?, ReminderSent = ?
      WHERE DeadlineID = ?`,
    [
      input.type,
      input.priority,
      input.title,
      input.description,
      input.eventDate,
      input.endDate,
      input.location,
      startChanged ? 0 : existing.reminderSent, // a moved event gets a new reminder (FR-20)
      existing.id,
    ]
  );

  const event = await findEvent(existing.id);
  if (startChanged || endChanged) {
    await notifyAboutEvent(event, 'rescheduled', req.user.id);
  }
  const conflicts = await findConflicts(req.user, event.groupId, input.eventDate, input.endDate, event.id);
  res.json({ ...toEvent(event, context), conflicts, warning: conflictWarning(conflicts) });
}

/**
 * DELETE /api/events/:id  (the group's supervisor, an administrator, or the student who created
 * the meeting before it starts - see canEditEvent)
 * Attendance recorded for the event is deleted with it (ON DELETE CASCADE). Students can never
 * delete a started meeting, so only the supervisor or an administrator can remove attendance.
 */
export async function deleteEvent(req, res) {
  const event = await findEvent(req.params.id);
  const context = await getPermissionContext(req.user);
  if (!canEditEvent(context, event)) {
    throw new HttpError(403, 'You do not have permission to delete this event.');
  }

  await query('DELETE FROM important_date WHERE DeadlineID = ?', [event.id]);

  // Only tell people about events that have not finished yet
  const endsAt = event.endDate || event.eventDate;
  if (endsAt.getTime() > Date.now()) {
    await notifyAboutEvent(event, 'cancelled', req.user.id);
  }
  res.json({ message: 'Event deleted' });
}
