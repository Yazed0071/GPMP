// Routes for /api/profile: every logged-in user can view and edit their own profile.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getProfile, updateProfile } from '../controllers/profile.controller.js';

const router = Router();

router.use(requireAuth); // every route below needs a logged-in user

router.get('/', getProfile);
router.put('/', updateProfile);

export default router;
