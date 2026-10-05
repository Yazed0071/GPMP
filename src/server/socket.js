// Real-time updates with Socket.IO (live chat messages and notifications).
// Clients connect with io({ path: '/socket.io', auth: { token } }).
// After the token is checked, each connection joins these "rooms":
//   user:<userId>  -> events for this one user (e.g. 'notification:new')
//   group:<gid>    -> group chat of every group where the user is a student member or the supervisor
//   staff:<gid>    -> supervisor-examiner channel of every group where the user is the supervisor or examiner
// Controllers send events with emitToUser / emitToRoom; they never talk to sockets directly.

import { Server } from 'socket.io';
import { config } from './config/env.js';
import { query } from './config/db.js';
import { verifyToken } from './middleware/auth.js';
import { loadUserContext } from './services/access.js';

let io = null;

// Works out the chat rooms a user belongs to, e.g. ['group:1', 'staff:1']
async function getChatRooms(user) {
  const groupRooms = new Set();
  const staffRooms = new Set();

  if (user.role === 'Student' && user.groupId) {
    groupRooms.add(`group:${user.groupId}`);
  }

  if (user.role === 'Supervisor' && user.supervisorId) {
    const rows = await query('SELECT GroupID FROM project_group WHERE SupervisorID = ?', [user.supervisorId]);
    rows.forEach((row) => {
      groupRooms.add(`group:${row.GroupID}`);
      staffRooms.add(`staff:${row.GroupID}`);
    });
  }

  if (user.role === 'Examiner' && user.examinerId) {
    const rows = await query('SELECT GroupID FROM project_group WHERE ExaminerID = ?', [user.examinerId]);
    rows.forEach((row) => staffRooms.add(`staff:${row.GroupID}`));
  }

  return [...groupRooms, ...staffRooms];
}

/**
 * Starts Socket.IO on the same HTTP server as Express (called once in server.js).
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.clientUrl, credentials: true },
  });

  // Runs before every connection: check the token and join the user's rooms
  io.use(async (socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token);
      if (!payload) return next(new Error('Please sign in to continue.'));

      const user = await loadUserContext(payload.id);
      if (!user) return next(new Error('Your account is not active.'));
      // A password change raises TokenVersion, so tokens from before the change are refused
      if ((payload.v ?? 0) !== user.tokenVersion) return next(new Error('Please sign in again.'));

      socket.data.user = user;
      socket.join(`user:${user.id}`);
      socket.join(await getChatRooms(user));
      next();
    } catch (err) {
      console.error('[socket] Connection check failed:', err.message);
      next(new Error('Could not connect. Please try again.'));
    }
  });

  io.on('connection', (socket) => {
    if (!config.isProduction) {
      console.log(`[socket] ${socket.data.user.email} connected (rooms: ${[...socket.rooms].slice(1).join(', ')})`);
    }
  });

  return io;
}

// Sends an event to every open tab of one user. Never throws.
export function emitToUser(userId, event, data) {
  try {
    if (io) io.to(`user:${userId}`).emit(event, data);
  } catch (err) {
    console.error('[socket] emitToUser failed:', err.message);
  }
}

// Sends an event to everyone in a room, e.g. emitToRoom(`group:${groupId}`, 'chat:message', message). Never throws.
export function emitToRoom(room, event, data) {
  try {
    if (io) io.to(room).emit(event, data);
  } catch (err) {
    console.error('[socket] emitToRoom failed:', err.message);
  }
}

/**
 * Closes the open connections of a user, e.g. after their password was changed or reset,
 * so a stolen login token cannot keep receiving live messages. Never throws.
 * exceptToken: connections made with this token stay open (the tab that changed the password).
 */
export async function disconnectUser(userId, { exceptToken = null } = {}) {
  try {
    if (!io) return;
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      if (exceptToken && socket.handshake.auth?.token === exceptToken) continue;
      socket.disconnect(true);
    }
  } catch (err) {
    console.error('[socket] disconnectUser failed:', err.message);
  }
}

/**
 * Re-computes the chat rooms of a user's open connections.
 * Call it after group membership changes (student moved, supervisor/examiner assigned or removed)
 * so live chat follows the new membership without logging out. Never throws.
 */
export async function refreshUserRooms(userId) {
  try {
    if (!io) return;
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (sockets.length === 0) return;

    const user = await loadUserContext(userId);
    const newRooms = user ? await getChatRooms(user) : [];

    for (const socket of sockets) {
      // Leave the old chat rooms, then join the current ones
      for (const room of socket.rooms) {
        if (room.startsWith('group:') || room.startsWith('staff:')) socket.leave(room);
      }
      if (user) {
        socket.join(newRooms);
        socket.data.user = user;
      } else {
        socket.disconnect(true); // the account was deactivated or deleted
      }
    }
  } catch (err) {
    console.error('[socket] refreshUserRooms failed:', err.message);
  }
}
