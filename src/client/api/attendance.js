// API functions for meeting and presentation attendance (FR-15, UC14).
// Details of every endpoint: docs/api/calendar-attendance-dashboard.md
import { api } from './client.js';

// Allowed values (they match the database CHECK constraint)
export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

// The group's meetings and presentations with attendance counts
export const getSessions = (groupId) => api.get('/attendance/sessions', { groupId });

// One session with every student of the group and their status (null = not recorded)
export const getSession = (eventId) => api.get(`/attendance/sessions/${eventId}`);

// records: [{ studentId, status }] - status null removes a record
export const saveAttendance = (eventId, records) =>
  api.put(`/attendance/sessions/${eventId}`, { records });

// Students: their own records and attendance rate
export const getMyAttendance = () => api.get('/attendance/me');

// One row per student of the group with counts and the attendance rate
export const getAttendanceSummary = (groupId) => api.get('/attendance/summary', { groupId });
