// Authentication: log in, "who am I", forgot/reset password and change password
// (FR-1, NFR-8, NFR-10, UC1 Login, UC2 Reset Password).
// Logging out (UC3) happens in the browser: the frontend simply forgets the login token.
// Changing or resetting a password ends the user's other sessions (see savePassword).
//
// The small password/email helpers at the bottom are also used by users.controller.js
// and profile.controller.js, so the rules are the same everywhere.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { config } from '../config/env.js';
import { signToken, getBearerToken } from '../middleware/auth.js';
import { loadUserContext, toPublicUser } from '../services/access.js';
import { disconnectUser } from '../socket.js';
import { sendEmail, isEmailConfigured, escapeHtml } from '../services/email.js';
import { HttpError } from '../utils/HttpError.js';
import {
  requireFields,
  isEmail,
  isStrongPassword,
  PASSWORD_RULE_MESSAGE,
  checkMaxLength,
} from '../utils/validate.js';

// UC1: after this many wrong passwords in a row the account is locked for LOCK_MINUTES
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// UC2: how long a password reset link can be used
const RESET_LINK_MINUTES = 30;
// Cost factor of the bcrypt password hash (NFR-10)
const BCRYPT_ROUNDS = 10;

const WRONG_CREDENTIALS = 'Incorrect email or password.';
const ACCOUNT_DEACTIVATED = 'This account has been deactivated. Please contact the administrator.';
const INVALID_RESET_LINK = 'This reset link is invalid or has expired. Please request a new one.';

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

/**
 * POST /api/auth/login  { email, password } -> { token, user }
 * UC1: checks the email and password and returns a login token (JWT).
 */
export async function login(req, res) {
  requireFields(req.body, { email: 'Email', password: 'Password' });
  const email = assertValidEmail(req.body.email);
  const password = String(req.body.password);

  const rows = await query(
    `SELECT UserID, Password, IsActive, FailedLoginAttempts, LockedUntil
       FROM \`user\` WHERE Email = ?`,
    [email]
  );
  const account = rows[0];

  // Unknown email: the same message as a wrong password. (This does not fully hide which emails
  // have an account: a known email also gets "attemptsLeft" for the UC1 warning, and UC2's
  // forgot-password must say when an email is unknown.)
  if (!account) throw new HttpError(401, WRONG_CREDENTIALS);

  // UC1 exceptional flow: a locked account cannot sign in until the lock ends,
  // not even with the right password
  if (isLocked(account.LockedUntil)) throw lockedError(account.LockedUntil);

  const passwordMatches = await bcrypt.compare(password, account.Password);
  if (!passwordMatches) throw await registerFailedLogin(account.UserID);

  // Only say that the account is deactivated once the right password was given
  if (!account.IsActive) throw new HttpError(403, ACCOUNT_DEACTIVATED);

  // Successful login: forget the earlier failed attempts
  await query('UPDATE `user` SET FailedLoginAttempts = 0, LockedUntil = NULL WHERE UserID = ?', [
    account.UserID,
  ]);

  const user = await loadUserContext(account.UserID);
  res.json({ token: signToken(user), user: toPublicUser(user) });
}

/**
 * GET /api/auth/me -> the logged-in user (the same shape as req.user)
 * The frontend calls it on start to check that a saved token is still valid.
 */
export async function getMe(req, res) {
  res.json(toPublicUser(req.user));
}

/**
 * POST /api/auth/forgot-password  { email } -> { message, devResetLink? }
 * UC2: creates a one-time reset link and emails it to the user.
 */
export async function forgotPassword(req, res) {
  requireFields(req.body, { email: 'Email' });
  const email = assertValidEmail(req.body.email);

  const rows = await query('SELECT UserID, Name, Email, IsActive FROM `user` WHERE Email = ?', [email]);
  const account = rows[0];

  // UC2 exceptional flow: the entered email does not exist
  if (!account) throw new HttpError(404, 'No account was found with this email address.');
  if (!account.IsActive) throw new HttpError(403, ACCOUNT_DEACTIVATED);

  // The link carries a long random token. Only its SHA-256 hash is saved, so someone who
  // reads the database still cannot use the link.
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000);
  await query('UPDATE `user` SET ResetTokenHash = ?, ResetTokenExpires = ? WHERE UserID = ?', [
    hashResetToken(token),
    expiresAt,
    account.UserID,
  ]);

  const resetLink = `${config.clientUrl}/reset-password?token=${token}`;
  await sendResetEmail(account, resetLink);

  const response = { message: 'A password reset link has been sent to your email.' };

  // During development without an email server the email is only printed in the terminal,
  // so the link is also sent back to the page to keep the demo working. Only then, and only
  // for requests from this computer: otherwise anyone who can reach the API could reset
  // anyone's password (never in production, never when real emails are sent).
  if (!config.isProduction && !isEmailConfigured() && isLocalRequest(req)) {
    response.devResetLink = resetLink;
  }

  res.json(response);
}

/**
 * POST /api/auth/reset-password  { token, password } -> { message }
 * UC2: saves the new password if the reset link is valid and not expired.
 */
export async function resetPassword(req, res) {
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';

  // A real token is exactly 64 hexadecimal characters; anything else cannot be valid
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new HttpError(400, INVALID_RESET_LINK);

  const rows = await query(
    'SELECT UserID FROM `user` WHERE ResetTokenHash = ? AND ResetTokenExpires > ?',
    [hashResetToken(token.toLowerCase()), new Date()]
  );
  // UC2 exceptional flow: the reset link expired, so the user must request another one
  if (rows.length === 0) throw new HttpError(400, INVALID_RESET_LINK);

  requireFields(req.body, { password: 'New password' });
  assertValidNewPassword(req.body.password);

  // savePassword also removes the used token and unlocks the account
  await savePassword(rows[0].UserID, req.body.password);

  res.json({ message: 'Your password has been reset. You can now sign in with your new password.' });
}

/**
 * POST /api/auth/change-password  { currentPassword, newPassword } -> { message, token }
 * A logged-in user changes their own password. Their other sessions end (see savePassword),
 * so a new token is returned to keep this tab signed in.
 */
export async function changePassword(req, res) {
  requireFields(req.body, { currentPassword: 'Current password', newPassword: 'New password' });
  const { currentPassword, newPassword } = req.body;

  const rows = await query('SELECT Password FROM `user` WHERE UserID = ?', [req.user.id]);
  const matches = await bcrypt.compare(String(currentPassword), rows[0].Password);

  // 400 and not 401: a 401 would make the frontend sign the user out
  if (!matches) {
    throw new HttpError(400, 'Your current password is incorrect.', { field: 'currentPassword' });
  }

  assertValidNewPassword(newPassword);
  if (newPassword === currentPassword) {
    throw new HttpError(400, 'Your new password must be different from your current password.', {
      field: 'newPassword',
    });
  }

  await savePassword(req.user.id, newPassword, { keepToken: getBearerToken(req) });

  // A new token, so this tab stays signed in while the other sessions end
  const user = await loadUserContext(req.user.id);
  res.json({ message: 'Your password has been changed.', token: signToken(user) });
}

// ---------------------------------------------------------------------
// Login lockout helpers (UC1 exceptional flow)
// ---------------------------------------------------------------------

// True while an account is locked (LockedUntil is a date in the future)
export function isLocked(lockedUntil) {
  return Boolean(lockedUntil) && new Date(lockedUntil) > new Date();
}

// The 423 error shown while an account is locked, e.g. "... try again in 12 minutes."
function lockedError(lockedUntil) {
  const minutesLeft = Math.max(1, Math.ceil((new Date(lockedUntil) - Date.now()) / 60000));
  const unit = minutesLeft === 1 ? 'minute' : 'minutes';
  return new HttpError(
    423,
    `Too many failed login attempts. Please try again in ${minutesLeft} ${unit}.`,
    { lockedUntil }
  );
}

/**
 * Counts one more wrong password for a user and returns the error to throw:
 * 401 with the number of attempts left, or 423 when the account just got locked.
 */
async function registerFailedLogin(userId) {
  // "+ 1" inside SQL, so two requests at the same moment are both counted
  await query('UPDATE `user` SET FailedLoginAttempts = FailedLoginAttempts + 1 WHERE UserID = ?', [
    userId,
  ]);
  const rows = await query('SELECT FailedLoginAttempts FROM `user` WHERE UserID = ?', [userId]);
  const attempts = rows[0].FailedLoginAttempts;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    // Lock the account and start counting from zero again after the lock
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    await query('UPDATE `user` SET FailedLoginAttempts = 0, LockedUntil = ? WHERE UserID = ?', [
      lockedUntil,
      userId,
    ]);
    return lockedError(lockedUntil);
  }

  // attemptsLeft lets the login page warn the user before the account gets locked
  return new HttpError(401, WRONG_CREDENTIALS, { attemptsLeft: MAX_FAILED_ATTEMPTS - attempts });
}

// ---------------------------------------------------------------------
// Password reset helpers (UC2)
// ---------------------------------------------------------------------

// True when the request comes from this computer (the Vite dev server or the smoke test),
// not from another device on the network
function isLocalRequest(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

// SHA-256 hash of a reset token (the only form of the token kept in the database)
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Emails the reset link (sendEmail never throws; without SMTP it prints the email instead)
async function sendResetEmail(account, resetLink) {
  const text =
    `Hello ${account.Name},\n\n` +
    'We received a request to reset your GPMP password. Open this link to choose a new password:\n' +
    `${resetLink}\n\n` +
    `The link can be used once and expires in ${RESET_LINK_MINUTES} minutes.\n` +
    'If you did not ask for this, you can ignore this email; your password stays the same.\n\n' +
    'Graduation Project Management Platform - Al-Yamamah University';

  const html =
    `<p>Hello ${escapeHtml(account.Name)},</p>` +
    '<p>We received a request to reset your GPMP password.</p>' +
    `<p><a href="${escapeHtml(resetLink)}">Choose a new password</a></p>` +
    `<p>The link can be used once and expires in ${RESET_LINK_MINUTES} minutes. ` +
    'If you did not ask for this, you can ignore this email; your password stays the same.</p>' +
    '<p style="color:#6b7280">Graduation Project Management Platform - Al-Yamamah University</p>';

  await sendEmail({ to: account.Email, subject: 'Reset your GPMP password', text, html });
}

// ---------------------------------------------------------------------
// Shared helpers (also used by users.controller.js and profile.controller.js)
// ---------------------------------------------------------------------

// Emails are saved in lower case without spaces, so "Sara@GPMP.edu " and "sara@gpmp.edu" match
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Returns the normalized email, or throws 400 when it is not a valid address
export function assertValidEmail(value) {
  const email = normalizeEmail(value);
  if (!isEmail(email)) {
    throw new HttpError(400, 'Please enter a valid email address.', { field: 'email' });
  }
  checkMaxLength(email, 150, 'Email');
  return email;
}

/**
 * Throws 400 unless the password follows the password rule
 * (at least 8 characters with at least one letter and one number).
 * bcrypt only uses the first 72 bytes, so longer passwords are refused.
 */
export function assertValidNewPassword(password) {
  if (!isStrongPassword(password)) {
    throw new HttpError(400, PASSWORD_RULE_MESSAGE, { field: 'password' });
  }
  checkMaxLength(password, 72, 'Password');
}

// Turns a plain password into a bcrypt hash (NFR-10: passwords are never stored as plain text)
export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Saves a new password for a user. It also removes any unused reset link and
 * unlocks the account, because the user has now proved who they are.
 * TokenVersion + 1 ends every session that was signed in before the change: their login
 * tokens stop working (middleware/auth.js) and their live connections are closed.
 * keepToken = the token of the tab that made the change: its live connection stays open,
 * because that tab receives a new token (change-password).
 * Used by change-password, reset-password (UC2) and the admin's password reset.
 */
export async function savePassword(userId, password, { keepToken = null } = {}) {
  const passwordHash = await hashPassword(password);
  await query(
    `UPDATE \`user\`
        SET Password = ?, ResetTokenHash = NULL, ResetTokenExpires = NULL,
            FailedLoginAttempts = 0, LockedUntil = NULL, TokenVersion = TokenVersion + 1
      WHERE UserID = ?`,
    [passwordHash, userId]
  );
  await disconnectUser(userId, { exceptToken: keepToken });
}
