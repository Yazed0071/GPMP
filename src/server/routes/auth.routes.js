// Routes for /api/auth: log in, current user, forgot/reset password, change password (UC1, UC2).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, resetRequestLimiter } from '../middleware/rateLimit.js';
import {
  login,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} from '../controllers/auth.controller.js';

const router = Router();

// Public routes. loginLimiter slows down password guessing from one computer (NFR-8);
// resetRequestLimiter also counts successful reset requests (no flood of reset emails).
router.post('/login', loginLimiter, login);
router.post('/forgot-password', loginLimiter, resetRequestLimiter, forgotPassword);
router.post('/reset-password', loginLimiter, resetPassword);

// Routes for a logged-in user
router.get('/me', requireAuth, getMe);
router.post('/change-password', requireAuth, changePassword);

export default router;
