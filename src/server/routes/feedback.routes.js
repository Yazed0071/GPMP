// Routes for /api/feedback: structured feedback on submissions (FR-11, UC13).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listFeedback, createFeedback, updateFeedback } from '../controllers/feedback.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listFeedback);

// The controller also checks that the supervisor supervises the submission's group
router.post('/', requireRole('Supervisor', 'Administrator'), createFeedback);
router.put('/:id', requireRole('Supervisor', 'Administrator'), updateFeedback);

export default router;
