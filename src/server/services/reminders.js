// Deadline and meeting reminders (FR-20) + small helpers shared by the calendar code.
//
// startReminders() is called once by server.js. Unless DISABLE_REMINDERS=1, it checks for
// reminders shortly after the server starts and then every 10 minutes:
//   (a) calendar events that start within the next 24 hours and have ReminderSent = 0
//       -> notify the people involved (in-app + email) and set ReminderSent = 1
//   (b) tasks due tomorrow that the students still have to finish
//       -> notify the group's students once per due date (task.ReminderSentFor)
//
// The helpers at the top (formatEventTime, getEventAudience, ...) are also used by the
// events controller, so every event notification looks the same, and dateInAppZone gives
// the same "today" to the dashboard, tasks and submissions.

import { query } from '../config/db.js';
import { config } from '../config/env.js';
import { getGroupUserIds } from './access.js';
import { notify } from './notify.js';

// The university's time zone. Used to write times in notification texts ("tomorrow at 10:00 AM")
// and to decide what "today" and "tomorrow" mean. Can be changed with APP_TIME_ZONE in .env
// (config/env.js checks that it is a valid time zone when the server starts).
const APP_TIME_ZONE = config.timeZone;

const FIRST_CHECK_DELAY_MS = 15 * 1000; // first check 15 seconds after the server starts
const CHECK_EVERY_MS = 10 * 60 * 1000; // then every 10 minutes

// ---------------------------------------------------------------------
// Shared helpers (also used by the controllers)
// ---------------------------------------------------------------------

// The calendar date ('YYYY-MM-DD') of a moment, in the university's time zone
export function dateInAppZone(date = new Date()) {
  // The 'en-CA' locale writes dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

// Adds whole days to a 'YYYY-MM-DD' date: addDays('2026-09-30', 1) -> '2026-10-01'
function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "Wed, Sep 30, 10:00 AM" (university time zone)
export function formatEventTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

// "10:00 AM" (university time zone)
function formatClockTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

// Meetings and presentations create 'Meeting' notifications; deadlines and academic dates 'Deadline'
export function notificationTypeFor(eventType) {
  return eventType === 'Meeting' || eventType === 'Presentation' ? 'Meeting' : 'Deadline';
}

// The page a notification opens: the calendar, at the month of the event
export function calendarLinkFor(groupId, eventDate) {
  const date = dateInAppZone(eventDate);
  return groupId ? `/calendar?groupId=${groupId}&date=${date}` : `/calendar?date=${date}`;
}

/**
 * Who should hear about an event (active users only):
 *   group event  -> the group's students and supervisor (+ the examiner for presentations)
 *   shared event -> every active user (the shared academic calendar is for everybody)
 */
export async function getEventAudience(groupId, eventType) {
  if (groupId) {
    return getGroupUserIds(groupId, {
      students: true,
      supervisor: true,
      examiner: eventType === 'Presentation',
    });
  }
  const rows = await query('SELECT UserID FROM `user` WHERE IsActive = 1');
  return rows.map((row) => row.UserID);
}

// ---------------------------------------------------------------------
// (a) Event reminders
// ---------------------------------------------------------------------

async function sendEventReminders() {
  // Events starting in the next 24 hours that nobody was reminded about yet
  const events = await query(
    `SELECT d.DeadlineID AS id, d.Title AS title, d.DeadlineType AS type,
            d.EventDate AS eventDate, d.Location AS location, c.GroupID AS groupId
       FROM important_date d
       JOIN calendar c ON c.CalendarID = d.CalendarID
      WHERE d.ReminderSent = 0
        AND d.EventDate > NOW()
        AND d.EventDate <= NOW() + INTERVAL 24 HOUR
      ORDER BY d.EventDate`
  );

  let sent = 0;
  for (const event of events) {
    // Mark the event first. If two checks ever run at the same time, only the one that
    // actually changed the row sends the reminder, so nobody gets it twice.
    // "DeadlineUpdateDate = DeadlineUpdateDate" keeps the "last changed" date as it was.
    const result = await query(
      `UPDATE important_date SET ReminderSent = 1, DeadlineUpdateDate = DeadlineUpdateDate
        WHERE DeadlineID = ? AND ReminderSent = 0`,
      [event.id]
    );
    if (result.affectedRows === 0) continue;

    const isToday = dateInAppZone(event.eventDate) === dateInAppZone();
    const userIds = await getEventAudience(event.groupId, event.type);
    await notify(userIds, {
      type: notificationTypeFor(event.type),
      title: `Reminder: ${event.title} is ${isToday ? 'today' : 'tomorrow'} at ${formatClockTime(event.eventDate)}`,
      message: event.location ? `Location: ${event.location}` : `${event.type} on ${formatEventTime(event.eventDate)}`,
      link: calendarLinkFor(event.groupId, event.eventDate),
      email: true, // UC8: reminders are also emailed
    });
    sent += 1;
  }
  return sent;
}

// ---------------------------------------------------------------------
// (b) Task due-date reminders
// ---------------------------------------------------------------------

async function sendTaskReminders() {
  const tomorrow = addDays(dateInAppZone(), 1);

  // Tasks due tomorrow that the students still have to finish.
  // ('Submitted' tasks are skipped: the students already handed them in.)
  const tasks = await query(
    `SELECT TaskID AS id, GroupID AS groupId, Title AS title
       FROM task
      WHERE DueDate = ? AND Status IN ('To Do', 'In Progress')`,
    [tomorrow]
  );

  let sent = 0;
  for (const task of tasks) {
    const link = `/tasks/${task.id}`;

    // Send it only once per due date (a changed due date gets a new reminder). The mark is kept
    // on the task itself, so deleting the notification does not make it come back.
    // "UpdatedAt = UpdatedAt" keeps the task's "last changed" time as it was.
    const claimed = await query(
      `UPDATE task SET ReminderSentFor = DueDate, UpdatedAt = UpdatedAt
        WHERE TaskID = ? AND (ReminderSentFor IS NULL OR ReminderSentFor <> DueDate)`,
      [task.id]
    );
    if (claimed.affectedRows === 0) continue;

    const studentIds = await getGroupUserIds(task.groupId, { students: true, supervisor: false });
    await notify(studentIds, {
      type: 'Deadline',
      title: `Reminder: "${task.title}" is due tomorrow`,
      message: 'Make sure your work is finished and submitted on time.',
      link,
    });
    sent += 1;
  }
  return sent;
}

// ---------------------------------------------------------------------
// Running the checks
// ---------------------------------------------------------------------

let isRunning = false;

/**
 * Runs both reminder checks once. Never throws (errors are logged), so a database
 * problem can never crash the server. Exported so it can also be run from a test script.
 */
export async function runReminders() {
  if (isRunning) return; // the previous check is still busy
  isRunning = true;
  try {
    const events = await sendEventReminders();
    const tasks = await sendTaskReminders();
    if (events > 0 || tasks > 0) {
      console.log(`[reminders] Sent ${events} event reminder(s) and ${tasks} task reminder(s).`);
    }
  } catch (err) {
    console.error('[reminders] Reminder check failed:', err.message);
  } finally {
    isRunning = false;
  }
}

// Called once by server.js when the server starts
export function startReminders() {
  if (process.env.DISABLE_REMINDERS === '1') return;

  setTimeout(runReminders, FIRST_CHECK_DELAY_MS);
  setInterval(runReminders, CHECK_EVERY_MS);
  console.log(`[reminders] Reminder check runs every ${CHECK_EVERY_MS / 60000} minutes (time zone ${APP_TIME_ZONE}).`);
}
