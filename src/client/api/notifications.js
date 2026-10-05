// API functions for the user's own notifications (FR-20)
import { api } from './client.js';

// params: { unread: true, limit: 50 }
export const getNotifications = (params) => api.get('/notifications', params);

// { count } - the number shown on the bell
export const getUnreadCount = () => api.get('/notifications/unread-count');

export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');
export const deleteNotification = (id) => api.del(`/notifications/${id}`);
