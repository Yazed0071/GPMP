// Routes for /api/meta: shared lookups used across the app.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMyGroups } from '../controllers/meta.controller.js';

const router = Router();

router.get('/my-groups', requireAuth, getMyGroups);

export default router;
