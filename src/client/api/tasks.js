// API functions for tasks, milestones and progress (FR-14, UC15). Backend: /api/tasks
import { api } from './client.js';

// params: { groupId?, status?, milestone? }
export const getTasks = (params) => api.get('/tasks', params);

// { total, toDo, inProgress, submitted, completed, overdue, percent, milestones: [...] }
export const getTaskProgress = (groupId) => api.get('/tasks/progress', { groupId });

// The students of a group, for the "Assign to" drop-down: [{ studentId, userId, name }]
export const getAssignees = (groupId) => api.get('/tasks/assignees', { groupId });

// One task with its submissions (files + feedback) and the user's permissions
export const getTask = (id) => api.get(`/tasks/${id}`);

// data: { groupId, title, description?, dueDate?, isMilestone?, assignedToStudentId? }
export const createTask = (data) => api.post('/tasks', data);

export const updateTask = (id, data) => api.put(`/tasks/${id}`, data);

// status: 'To Do' | 'In Progress' | 'Completed' ('Submitted' is set by a submission)
export const updateTaskStatus = (id, status) => api.patch(`/tasks/${id}/status`, { status });

export const deleteTask = (id) => api.del(`/tasks/${id}`);
