// API functions for group documents and uploaded files (FR-16, UC4). Backend: /api/files
import { api, downloadFile } from './client.js';

// params: { groupId?, category? ('Document' | 'Submission' | 'Showcase'), search? }
export const getFiles = (params) => api.get('/files', params);

// Uploads one document to a group. The field name "file" must match the backend.
export function uploadDocument(groupId, file) {
  const form = new FormData();
  form.append('groupId', String(groupId));
  form.append('file', file);
  return api.upload('/files', form);
}

// Saves a file on the user's computer with its original name.
// file = any object with { id, fileName } (a document or a submission attachment)
export const downloadGroupFile = (file) => downloadFile(`/files/${file.id}/download`, file.fileName);

export const deleteFile = (id) => api.del(`/files/${id}`);
