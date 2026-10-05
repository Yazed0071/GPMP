// API functions for project proposals and their review (FR-6, FR-7, UC16, UC17). Backend: /api/proposals
import { api } from './client.js';

// params: { status?, groupId? }. Each proposal says if the user can review it now (canReview)
// and edit their earlier feedback (canEditFeedback + feedbackStage 'supervisor' | 'examiner').
export const getProposals = (params) => api.get('/proposals', params);

// Student. data: { projectId, comments?, deadline? ('YYYY-MM-DD') }
export const submitProposal = (data) => api.post('/proposals', data);

// decision: 'approve' | 'reject'. Feedback is required when rejecting.
export const reviewProposal = (id, decision, feedback) =>
  api.patch(`/proposals/${id}/review`, { decision, feedback });

// Edits feedback given earlier (UC16 / UC17 alternative flow)
export const updateExaminerFeedback = (id, feedback) =>
  api.put(`/proposals/${id}/examiner-feedback`, { feedback });

export const updateSupervisorFeedback = (id, feedback) =>
  api.put(`/proposals/${id}/supervisor-feedback`, { feedback });
