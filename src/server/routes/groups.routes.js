// Routes for /api/groups: list and view groups; administrators create, edit and delete them (UC10).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listGroups,
  listAvailableStudents,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
} from '../controllers/groups.controller.js';

const router = Router();

router.use(requireAuth); // every route below needs a logged-in user

router.get('/', listGroups);
// Must come before '/:id', otherwise "available-students" would be read as a group id
router.get('/available-students', requireRole('Administrator'), listAvailableStudents);
router.get('/:id', getGroup);
router.post('/', requireRole('Administrator'), createGroup);
router.put('/:id', requireRole('Administrator'), updateGroup);
router.delete('/:id', requireRole('Administrator'), deleteGroup);

export default router;
