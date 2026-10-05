// API functions for announcements (FR-12, UC7)
import { api } from './client.js';

export const getAnnouncements = (params) => api.get('/announcements', params);

// data = { title, content, targetRole?, groupId? }
export const createAnnouncement = (data) => api.post('/announcements', data);
export const updateAnnouncement = (id, data) => api.put(`/announcements/${id}`, data);
export const deleteAnnouncement = (id) => api.del(`/announcements/${id}`);
