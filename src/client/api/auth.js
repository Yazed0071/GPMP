// API functions for passwords (UC2 Reset Password and "change my password").
// Logging in, logging out and "who am I" live in context/AuthContext.jsx.
import { api } from './client.js';

// UC2 step 1: email a reset link -> { message, devResetLink? }
// (devResetLink only in development without an email server, on the same computer)
export const requestPasswordReset = (email) => api.post('/auth/forgot-password', { email });

// UC2 step 2: save a new password with the token from the reset link -> { message }
export const resetPassword = (token, password) =>
  api.post('/auth/reset-password', { token, password });

// A logged-in user changes their own password -> { message, token }
// The change ends the user's other sessions, so this tab gets a new token
export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword });
