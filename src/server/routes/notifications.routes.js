// Routes for /api/notifications: the logged-in user's own notifications (FR-20).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notifications.controller.js';

const router = Router();

router.use(requireAuth); // every role has notifications; each user only sees their own

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

export default router;
