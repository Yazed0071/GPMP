// API functions for graduation projects (FR-3, FR-4, FR-8). Backend: /api/projects
import { api } from './client.js';

// A finished project is kept for the archive (same list as the backend's FINISHED_STATUSES)
export const FINISHED_STATUSES = ['Completed', 'Archived'];

// Student: creates the project of their group. data: { title, description, academicYear? }
export const createProject = (data) => api.post('/projects', data);

// data: { title, description, academicYear? }
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);

// status: 'Proposed' | 'In Progress' | 'Completed' | 'Archived' (supervisors: In Progress / Completed)
export const updateProjectStatus = (id, status) => api.patch(`/projects/${id}/status`, { status });

// Moves a completed project to the archive (FR-8)
export const archiveProject = (id) => api.patch(`/projects/${id}/archive`);

// UC16: other projects with similar titles. params: { projectId }, { q: 'some words' } or both
// (both = search for the words, leaving the project itself out)
// -> [{ id, title, status, academicYear, groupName, matchedWords }]
export const findSimilarProjects = (params) => api.get('/projects/similar', params);
