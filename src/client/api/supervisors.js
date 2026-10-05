// API functions for supervisors and supervisor selection (FR-5, UC11). Backend: /api/supervisors
import { api } from './client.js';

// [{ id, userId, name, email, department, numberOfGroups, currentGroups,
//    isAvailable, hasCapacity, canBeChosen, isActive, isCurrent }]
export const getSupervisors = () => api.get('/supervisors');

// Student: { groupId, groupName, supervisorId, canChange, message }
export const getMySupervisorChoice = () => api.get('/supervisors/my-choice');

// Student: chooses the supervisor of their group -> { message, groupId, supervisorId }
export const chooseSupervisor = (supervisorId) => api.post('/supervisors/choose', { supervisorId });

// Administrator. data: { numberOfGroups?, isAvailable?, department? }
export const updateSupervisor = (id, data) => api.patch(`/supervisors/${id}`, data);
