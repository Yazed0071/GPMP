// API functions for examiners. Backend: /api/examiners
import { api } from './client.js';

// Administrator, Supervisor: [{ id, userId, name, email, department, groupCount }]
export const getExaminers = () => api.get('/examiners');
