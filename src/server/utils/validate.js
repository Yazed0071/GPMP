// Small input-checking helpers used by the controllers.
// Helpers named "is..." return true/false. The others throw an HttpError(400)
// with a friendly message, so a controller can simply call them and move on.

import { HttpError } from './HttpError.js';

// The password rule used everywhere (reset password, change password, create user)
export const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and contain at least one letter and one number.';

// Turns a field name like "dueDate" into a readable label like "Due date"
function toLabel(fieldName) {
  const words = fieldName.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// True when a value is missing: undefined, null, or text that is empty after trimming
export function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Throws 400 "<Label> is required" for the first missing field.
 * fields can be a list of names:          requireFields(req.body, ['title', 'dueDate'])
 * or an object of name -> custom label:   requireFields(req.body, { title: 'Task title' })
 */
export function requireFields(obj, fields) {
  const source = obj || {};
  const entries = Array.isArray(fields)
    ? fields.map((name) => [name, toLabel(name)])
    : Object.entries(fields);

  for (const [name, label] of entries) {
    if (isBlank(source[name])) {
      throw new HttpError(400, `${label} is required`, { field: name });
    }
  }
}

export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// True for a real calendar date written as 'YYYY-MM-DD' (e.g. '2026-02-30' is false)
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// True for a date-time the backend can understand, e.g. '2026-10-05T07:00:00.000Z'
export function isValidDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Makes sure value is one of the allowed options and returns it.
 * Example: const status = oneOf(req.body.status, TASK_STATUSES, 'Status');
 */
export function oneOf(value, allowed, label = 'Value') {
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${label} must be one of: ${allowed.join(', ')}`, { allowed });
  }
  return value;
}

/**
 * Converts a value (e.g. '12' from a URL) into a whole number, or throws 400.
 * Optional limits: toInt(req.query.limit, 'Limit', { min: 1, max: 100 })
 */
export function toInt(value, label = 'Value', { min, max } = {}) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number)) {
    throw new HttpError(400, `${label} must be a whole number`);
  }
  if (min !== undefined && number < min) throw new HttpError(400, `${label} must be at least ${min}`);
  if (max !== undefined && number > max) throw new HttpError(400, `${label} must be at most ${max}`);
  return number;
}

// Like toInt, but returns null when the value is empty (for optional fields)
export function toOptionalInt(value, label = 'Value', limits = {}) {
  return isBlank(value) ? null : toInt(value, label, limits);
}

// At least 8 characters with at least one letter and one number
export function isStrongPassword(value) {
  return (
    typeof value === 'string' && value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)
  );
}

// Trims text; returns null for empty text (handy for optional columns)
export function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

// Throws 400 when a text is longer than the database column allows
export function checkMaxLength(value, max, label = 'Value') {
  if (typeof value === 'string' && value.length > max) {
    throw new HttpError(400, `${label} must be at most ${max} characters`);
  }
  return value;
}

// Converts TINYINT(1) values from the database (0/1) or form values ('true'/'1') into true/false
export function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}
