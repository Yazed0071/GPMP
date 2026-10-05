// Routes for /api/attendance: meeting and presentation attendance (FR-15, UC14).
// Staff with access to the group can view sessions and summaries; only the group's supervisor
// or an administrator can record attendance (checked in the controller); students see their own.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listSessions,
  getSession,
  saveAttendance,
  getMyAttendance,
  getSummary,
} from '../controllers/attendance.controller.js';

const router = Router();
const staff = requireRole('Supervisor', 'Examiner', 'Administrator');

router.use(requireAuth); // every attendance route needs a logged-in user

router.get('/me', requireRole('Student'), getMyAttendance);
router.get('/summary', staff, getSummary);
router.get('/sessions', staff, listSessions);
router.get('/sessions/:eventId', staff, getSession);
router.put('/sessions/:eventId', requireRole('Supervisor', 'Administrator'), saveAttendance);

export default router;
