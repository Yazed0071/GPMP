// Routes for /api/dashboard: the role-specific dashboard summary (UI fig 47).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDashboard } from '../controllers/dashboard.controller.js';

const router = Router();

router.use(requireAuth); // the dashboard needs a logged-in user (every role has one)

router.get('/', getDashboard);

export default router;
