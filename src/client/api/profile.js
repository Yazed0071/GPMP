// API functions for "My profile" (every role).
import { api } from './client.js';

// The logged-in user plus the details of their role (group, department, ...)
export const getProfile = () => api.get('/profile');

// data = { name, major? (students), department? (staff) } -> the updated profile
export const updateProfile = (data) => api.put('/profile', data);
