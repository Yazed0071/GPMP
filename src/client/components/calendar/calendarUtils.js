// Date helpers for the calendar (FR-13). Everything here works in the user's LOCAL time.
// Weeks start on Sunday, like the university week.
//
// A calendar "item" comes from GET /api/events: a real event (source 'event', eventDate is an
// ISO date-time) or a task due date (source 'task', eventDate is a plain 'YYYY-MM-DD').
import { toDate, formatTime, todayISO, daysUntil } from '../../utils/format.js';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The kinds of items shown on the calendar (used for the color legend)
export const CALENDAR_TYPES = ['Deadline', 'Meeting', 'Presentation', 'Academic', 'Task'];

// Adds a leading zero: 5 -> "05"
function pad(number) {
  return String(number).padStart(2, '0');
}

// A Date -> its local day as 'YYYY-MM-DD' (used as the key of a day cell)
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The first day of the month that contains `date`
export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// The first day of the month `count` months later (or earlier when negative)
export function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

// "October 2026"
export function monthTitle(month) {
  return month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Every day shown in the month grid: from the Sunday before the 1st
 * to the Saturday after the last day (5 or 6 full weeks).
 */
export function monthGridDays(month) {
  const first = startOfMonth(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + (6 - last.getDay()));

  const days = [];
  for (let day = start; day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    days.push(day);
  }
  return days;
}

// The date range to load for a month grid, as ISO strings for the API: { from, to }
export function gridRange(month) {
  const days = monthGridDays(month);
  const lastDay = days[days.length - 1];
  const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59, 999);
  return { from: days[0].toISOString(), to: end.toISOString() };
}

// The local days ('YYYY-MM-DD') an item covers. A multi-day event covers every day until its end.
export function itemDayKeys(item) {
  const start = toDate(item.eventDate);
  if (!start) return [];
  const end = toDate(item.endDate) || start;

  const keys = [];
  let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  // The limit only protects against broken data (an event longer than two months)
  while (day <= lastDay && keys.length < 62) {
    keys.push(dayKey(day));
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return keys;
}

// Builds { 'YYYY-MM-DD': [items of that day] } for the grid and the agenda
export function groupItemsByDay(items) {
  const byDay = {};
  for (const item of items) {
    for (const key of itemDayKeys(item)) {
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(item);
    }
  }
  return byDay;
}

// Short time for the small chips of the month grid: "10am", "1:30pm"
export function shortTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12}${suffix}` : `${hour12}:${pad(minutes)}${suffix}`;
}

// "10:00 AM" for events; "Due" for task due dates (they have no time)
export function itemTimeLabel(item) {
  return item.allDay ? 'Due' : formatTime(item.eventDate);
}

// "10:00 AM – 11:00 AM" / "Oct 10, 8:00 AM – Oct 14, 4:00 PM" / "Due date (all day)"
export function itemTimeRange(item) {
  if (item.allDay) return 'Due date (all day)';
  const start = toDate(item.eventDate);
  const end = toDate(item.endDate);
  if (!end) return formatTime(start);
  const sameDay = dayKey(start) === dayKey(end);
  const short = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return sameDay
    ? `${formatTime(start)} – ${formatTime(end)}`
    : `${short(start)}, ${formatTime(start)} – ${short(end)}, ${formatTime(end)}`;
}

// True for tasks that are already done (they are shown faded)
export function isFinishedTask(item) {
  return item.source === 'task' && item.status === 'Completed';
}

// Deadlines still ahead: unfinished tasks and 'Deadline' events (same rule as the dashboard)
export function isOpenDeadline(item) {
  if (item.source === 'task') return item.status === 'To Do' || item.status === 'In Progress';
  return item.type === 'Deadline';
}

// "Today", "Tomorrow", "In 5 days", "Ongoing" (a multi-day event that already started)
export function relativeDayLabel(item) {
  const days = daysUntil(item.eventDate);
  if (days === null) return '';
  if (days < 0) return item.endDate && daysUntil(item.endDate) >= 0 ? 'Ongoing' : `${-days} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

// True when the day ('YYYY-MM-DD') is before today
export function isPastDay(key) {
  return key < todayISO();
}

/**
 * A sensible start time for a new event on a day: 9:00 AM,
 * or the next full hour when that day is today and 9:00 AM has passed.
 */
export function defaultStartFor(key) {
  const [year, month, day] = key.split('-').map(Number);
  const start = new Date(year, month - 1, day, 9, 0);
  const now = new Date();
  if (start < now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
  }
  return start;
}
