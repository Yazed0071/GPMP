// Routes for /api/announcements (FR-12, UC7, UC8).
// Everyone reads the announcements meant for them; supervisors and administrators publish.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../controllers/announcements.controller.js';

const router = Router();

router.use(requireAuth);

const publishers = requireRole('Supervisor', 'Administrator');

router.get('/', listAnnouncements);
router.post('/', publishers, createAnnouncement);
router.put('/:id', publishers, updateAnnouncement);
router.delete('/:id', publishers, deleteAnnouncement);

export default router;
