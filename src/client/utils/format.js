// Formatting helpers for dates, times, file sizes and names, so every page shows them the same way.
// The backend sends DATETIME values as ISO strings in UTC ("2026-05-10T09:00:00.000Z") and
// DATE values as "YYYY-MM-DD". These helpers show them in the user's local time.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY = '—';

// Turns an ISO string, a "YYYY-MM-DD" string or a Date into a Date object (or null).
// "YYYY-MM-DD" is read as a LOCAL date, so "2026-05-22" never shows as May 21.
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// "May 22, 2026"
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// "Sunday, May 10, 2026" (used in the page header)
export function formatLongDate(value = new Date()) {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// "May 22, 2026, 10:00 AM"
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// "10:00 AM"
export function formatTime(value) {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// "just now", "5 minutes ago", "2 hours ago", "yesterday", "in 3 days", or a date
export function timeAgo(value) {
  const date = toDate(value);
  if (!date) return EMPTY;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);

  if (abs < 45) return 'just now';

  let text;
  if (abs < 3600) {
    text = plural(Math.max(1, Math.floor(abs / 60)), 'minute');
  } else if (abs < 86400) {
    text = plural(Math.floor(abs / 3600), 'hour');
  } else if (abs < 7 * 86400) {
    const days = Math.floor(abs / 86400);
    if (days === 1) return future ? 'tomorrow' : 'yesterday';
    text = plural(days, 'day');
  } else {
    return formatDate(date); // older than a week: show the date instead
  }
  return future ? `in ${text}` : `${text} ago`;
}

// 1536 -> "1.5 KB"
export function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return EMPTY;
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

// Adds a leading zero: 5 -> "05"
function pad(number) {
  return String(number).padStart(2, '0');
}

// Value of an <input type="datetime-local"> ("2026-05-10T14:30", local time) -> ISO string in UTC.
// Returns null when the input is empty.
export function toISO(localInputValue) {
  if (!localInputValue) return null;
  const date = new Date(localInputValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ISO string from the server -> value for <input type="datetime-local"> ("2026-05-10T14:30")
export function toLocalInput(isoString) {
  const date = toDate(isoString);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

// Today's local date as "YYYY-MM-DD" (useful for <input type="date" min={todayISO()}>)
export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Whole days from today until the date (0 = today, negative = in the past)
export function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  const today = toDate(todayISO());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - today) / 86400000);
}

// true when the date has passed. A "YYYY-MM-DD" due date is overdue only after that day ends.
export function isOverdue(value) {
  if (!value) return false;
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value < todayISO();
  const date = toDate(value);
  return date ? date.getTime() < Date.now() : false;
}

// "Mustafa Deeb" -> "MD"
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  // Skip titles such as "Dr." so "Dr. Kamal Ali" -> "KA"
  const words = parts.length > 1 ? parts.filter((p) => !/^(dr|prof|mr|mrs|ms)\.?$/i.test(p)) : parts;
  const first = words[0]?.[0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

// plural(1, 'task') -> "1 task", plural(3, 'task') -> "3 tasks"
export function plural(count, word, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}
