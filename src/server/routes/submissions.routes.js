// Routes for /api/submissions: students submit work for a task (UC5); staff review the queue.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadFiles } from '../middleware/upload.js';
import { listSubmissions, getSubmission, createSubmission } from '../controllers/submissions.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listSubmissions);
router.get('/:id', getSubmission);

// The role is checked BEFORE the upload, so files from other roles are never saved
router.post('/', requireRole('Student'), uploadFiles, createSubmission);

export default router;
