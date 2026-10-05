// API functions for student groups (UC10 Manage Groups, FR-4). Backend: /api/groups
import { api } from './client.js';

// The groups the user can open, each with members, supervisor, examiner, project and progress
export const getGroups = () => api.get('/groups');

// One group with its full project, proposals, recent documents, upcoming events and the
// user's permissions ({ canEditProject, canSubmitProposal, canChooseSupervisor, ... })
export const getGroup = (id) => api.get(`/groups/${id}`);

// Administrator: students who are not in a group yet [{ studentId, userId, name, email, major }]
export const getAvailableStudents = () => api.get('/groups/available-students');

// Administrator. data: { name, supervisorId?, examinerId?, studentIds: [] }
export const createGroup = (data) => api.post('/groups', data);

// Administrator. Fields that are left out stay the same; studentIds replaces the member list.
export const updateGroup = (id, data) => api.put(`/groups/${id}`, data);

// Administrator. The students become group-less.
export const deleteGroup = (id) => api.del(`/groups/${id}`);
