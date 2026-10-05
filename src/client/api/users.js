// API functions for user management (Administrators only, FR-1, FR-2).
import { api } from './client.js';

// List users. Optional filters: { role, search, active: 'true' | 'false' }
export const getUsers = (params) => api.get('/users', params);

// data = { name, email, password, role, department?, major?, gpa?, numberOfGroups?, isAvailable? }
export const createUser = (data) => api.post('/users', data);

// data = { name, email, department?, major?, gpa?, numberOfGroups?, isAvailable? } (the role cannot change)
export const updateUser = (id, data) => api.put(`/users/${id}`, data);

// Activate (true) or deactivate (false) an account -> the updated user
export const setUserActive = (id, isActive) => api.patch(`/users/${id}/status`, { isActive });

// The administrator sets a new password (this also unlocks the account and ends the user's
// sessions) -> { message, token? } (token only when admins change their own password)
export const setUserPassword = (id, password) =>
  api.post(`/users/${id}/reset-password`, { password });

// Remove a login lock without changing the password -> the updated user
export const unlockUser = (id) => api.post(`/users/${id}/unlock`);
