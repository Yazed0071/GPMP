// API functions for task submissions (UC5). Backend: /api/submissions
import { api } from './client.js';

// Sends the work for a task: up to 5 files and/or a link, plus optional notes.
// The field name "files" must match the backend upload middleware.
export function createSubmission({ taskId, files = [], source = '', notes = '' }) {
  const form = new FormData();
  form.append('taskId', String(taskId));
  if (source.trim()) form.append('source', source.trim());
  if (notes.trim()) form.append('notes', notes.trim());
  files.forEach((file) => form.append('files', file));
  return api.upload('/submissions', form);
}
