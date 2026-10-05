// Routes for /api/examiners: the examiners list used when assigning an examiner to a group.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listExaminers } from '../controllers/examiners.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('Administrator', 'Supervisor'), listExaminers);

export default router;
