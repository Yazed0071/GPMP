// Routes for /api/events: calendar events and deadlines (FR-13, UC9).
// The detailed permission rules (who may add, change or delete which event) are in the controller.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listEvents,
  checkConflicts,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../controllers/events.controller.js';

const router = Router();

router.use(requireAuth); // every calendar route needs a logged-in user

router.get('/', listEvents);
router.get('/conflicts', checkConflicts); // must come before '/:id'
router.get('/:id', getEvent);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

export default router;
