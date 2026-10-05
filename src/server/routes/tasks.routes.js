// Routes for /api/tasks: tasks, milestones and the progress summary (FR-14, UC15).
// The detailed permission rules (supervisor / creator / group member) are in the controller.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listTasks,
  getProgress,
  listAssignees,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from '../controllers/tasks.controller.js';

const router = Router();

// Examiners can view tasks but never change them
const canChangeTasks = requireRole('Student', 'Supervisor', 'Administrator');

router.use(requireAuth);

// Fixed paths first, so "progress" is not read as a task id
router.get('/', listTasks);
router.get('/progress', getProgress);
router.get('/assignees', listAssignees);
router.get('/:id', getTask);

router.post('/', canChangeTasks, createTask);
router.put('/:id', canChangeTasks, updateTask);
router.patch('/:id/status', canChangeTasks, updateTaskStatus);
router.delete('/:id', canChangeTasks, deleteTask);

export default router;
