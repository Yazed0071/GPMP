// Login-token (JWT) helpers and the two access-control middlewares:
//   requireAuth          -> the request must carry a valid token of an active user
//   requireRole(...roles) -> the logged-in user must have one of these roles
//
// The token payload is { id, role, v } where id is the user's UserID and v is the user's
// TokenVersion. requireAuth only trusts the id: the role and everything else are loaded
// fresh from the database on every request, so changes apply immediately.
// Changing or resetting a password raises TokenVersion, so every older token stops working.

import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { loadUserContext } from '../services/access.js';
import { HttpError } from '../utils/HttpError.js';

/**
 * Creates a login token for a user (after logging in, and after a password change).
 * `user` is the object from loadUserContext (it has id, role and tokenVersion).
 * Example: const token = signToken(await loadUserContext(userId));
 */
export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, v: user.tokenVersion ?? 0 }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// Returns the token payload { id, role, v, iat, exp }, or null if the token is invalid or expired
export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

// Reads the token from the "Authorization: Bearer <token>" header
export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Rejects the request with 401 unless it has a valid token of an active user.
 * On success req.user = { id, name, email, role, studentId, supervisorId,
 * examinerId, adminId, groupId }.
 */
export async function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Please sign in to continue.');

  const payload = verifyToken(token);
  if (!payload) throw new HttpError(401, 'Your session has expired. Please sign in again.');

  const user = await loadUserContext(payload.id);
  if (!user) throw new HttpError(401, 'Your account is not active. Please contact the administrator.');

  // A password change raises TokenVersion, so tokens from before the change stop working
  if ((payload.v ?? 0) !== user.tokenVersion) {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }

  req.user = user;
  next();
}

/**
 * Only lets users with one of the given roles continue (otherwise 403).
 * Always use it after requireAuth, e.g.:
 *   router.post('/', requireAuth, requireRole('Supervisor', 'Administrator'), createTask);
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Please sign in to continue.');
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, 'You do not have permission to do this.');
    }
    next();
  };
}
