// Routes for /api/proposals: submit, list and review proposals, and edit review feedback
// (FR-6, FR-7, UC16, UC17).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listProposals,
  getProposal,
  submitProposal,
  reviewProposal,
  updateExaminerFeedback,
  updateSupervisorFeedback,
} from '../controllers/proposals.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listProposals);
router.get('/:id', getProposal);
router.post('/', requireRole('Student'), submitProposal);
router.patch('/:id/review', requireRole('Supervisor', 'Examiner', 'Administrator'), reviewProposal);
router.put('/:id/examiner-feedback', requireRole('Examiner'), updateExaminerFeedback);
router.put('/:id/supervisor-feedback', requireRole('Supervisor'), updateSupervisorFeedback);

export default router;
