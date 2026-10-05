// API functions for the projects showcase and archive (FR-8, FR-18, FR-19). Backend: /api/showcase
import { api, downloadFile } from './client.js';

// params: { year?, search? } -> completed and archived projects
export const getShowcase = (params) => api.get('/showcase', params);

// ['2025-2026', '2024-2025', ...]
export const getShowcaseYears = () => api.get('/showcase/years');

// One project with members, supervisor, examiner, final documents and canEdit
export const getShowcaseProject = (projectId) => api.get(`/showcase/${projectId}`);

// The address of the protected video, for useBlobUrl() (never use it in <video src> directly)
export const showcaseVideoPath = (projectId) => `/showcase/${projectId}/video`;

// Student: saves the description and, optionally, a new video (FormData field "video")
export function updateShowcase(projectId, { showcaseDescription, academicYear, video }) {
  const form = new FormData();
  form.append('showcaseDescription', showcaseDescription);
  if (academicYear) form.append('academicYear', academicYear);
  if (video) form.append('video', video);
  return api.upload(`/showcase/${projectId}`, form, 'PUT');
}

export const removeShowcaseVideo = (projectId) => api.del(`/showcase/${projectId}/video`);

// Saves one of the project's final documents on the user's computer
export const downloadShowcaseDocument = (projectId, document) =>
  downloadFile(`/showcase/${projectId}/documents/${document.id}/download`, document.name);
