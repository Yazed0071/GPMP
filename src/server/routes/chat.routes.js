// Routes for /api/chat: group chat (FR-9, UC6) and supervisor–examiner chat (FR-10, UC12).
// Channel membership is checked inside the controller (administrators have no channels).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listChannels,
  getChatUnreadCount,
  listMessages,
  sendMessage,
  markRead,
  deleteMessage,
} from '../controllers/chat.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/channels', listChannels);
router.get('/unread-count', getChatUnreadCount);
router.get('/messages', listMessages);
router.post('/messages', sendMessage);
router.delete('/messages/:id', deleteMessage);
router.patch('/read', markRead);

export default router;
