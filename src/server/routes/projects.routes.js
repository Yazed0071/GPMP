// Routes for /api/projects: create and edit projects, change their status and archive them (FR-3, FR-4, FR-8).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  findSimilarProjects,
  getProject,
  createProject,
  updateProject,
  updateProjectStatus,
  archiveProject,
} from '../controllers/projects.controller.js';

const router = Router();

router.use(requireAuth);

// Must come before '/:id'
router.get('/similar', requireRole('Supervisor', 'Examiner', 'Administrator'), findSimilarProjects);
router.get('/:id', getProject);
router.post('/', requireRole('Student'), createProject);
router.put('/:id', requireRole('Student', 'Supervisor', 'Administrator'), updateProject);
router.patch('/:id/status', requireRole('Supervisor', 'Administrator'), updateProjectStatus);
router.patch('/:id/archive', requireRole('Supervisor', 'Administrator'), archiveProject);

export default router;
