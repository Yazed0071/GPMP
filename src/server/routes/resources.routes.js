// Routes for /api/resources: tutorials, guides and tools (FR-17).
// Everyone reads; supervisors and administrators add, edit and delete.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listResources,
  createResource,
  updateResource,
  deleteResource,
} from '../controllers/resources.controller.js';

const router = Router();

router.use(requireAuth);

const editors = requireRole('Supervisor', 'Administrator');

router.get('/', listResources);
router.post('/', editors, createResource);
router.put('/:id', editors, updateResource);
router.delete('/:id', editors, deleteResource);

export default router;
