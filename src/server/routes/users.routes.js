// Routes for /api/users: account management. Only administrators may use them (FR-2).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  unlockUser,
} from '../controllers/users.controller.js';

const router = Router();

// Every route below needs a logged-in Administrator
router.use(requireAuth, requireRole('Administrator'));

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.patch('/:id/status', updateUserStatus);
router.post('/:id/reset-password', resetUserPassword);
router.post('/:id/unlock', unlockUser);

export default router;
