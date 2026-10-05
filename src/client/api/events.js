// API functions for calendar events and deadlines (FR-13, UC9).
// Details of every endpoint: docs/api/calendar-attendance-dashboard.md
import { api } from './client.js';

// Allowed values (they match the database CHECK constraints)
export const EVENT_TYPES = ['Deadline', 'Meeting', 'Presentation', 'Academic'];
export const EVENT_PRIORITIES = ['Low', 'Medium', 'High'];

// params: { from, to, groupId } - from/to are ISO date-times; without groupId all your calendars are used
export const getEvents = (params) => api.get('/events', params);

// UC9: other events on the same calendar at that time -> { conflicts, warning }
// params: { eventDate, endDate, groupId, excludeId }
export const checkEventConflicts = (params) => api.get('/events/conflicts', params);

// data: { title, description, type, priority, eventDate, endDate, location, groupId }
export const createEvent = (data) => api.post('/events', data);

export const updateEvent = (id, data) => api.put(`/events/${id}`, data);

export const deleteEvent = (id) => api.del(`/events/${id}`);
