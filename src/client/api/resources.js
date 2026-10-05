// API functions for the learning resources page (FR-17)
import { api } from './client.js';

// params: { category, search } (both optional)
export const getResources = (params) => api.get('/resources', params);

// data = { title, description, url, category }
export const createResource = (data) => api.post('/resources', data);
export const updateResource = (id, data) => api.put(`/resources/${id}`, data);
export const deleteResource = (id) => api.del(`/resources/${id}`);
