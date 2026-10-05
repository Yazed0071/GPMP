// API functions for structured feedback on submissions (FR-11, UC13). Backend: /api/feedback
import { api } from './client.js';

// data: { submissionId, decision: 'Approved' | 'Needs Revision', strengths?, improvements?, comments }
export const createFeedback = (data) => api.post('/feedback', data);

// The author edits their feedback. data: { decision?, strengths?, improvements?, comments? }
export const updateFeedback = (id, data) => api.put(`/feedback/${id}`, data);
