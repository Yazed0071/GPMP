// Routes for /api/supervisors: the supervisors list, a student's choice (UC11) and the
// administrator's availability / capacity settings (FR-5).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listSupervisors,
  getMyChoice,
  chooseSupervisor,
  updateSupervisor,
} from '../controllers/supervisors.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listSupervisors);
router.get('/my-choice', requireRole('Student'), getMyChoice);
router.post('/choose', requireRole('Student'), chooseSupervisor);
router.patch('/:id', requireRole('Administrator'), updateSupervisor);

export default router;
