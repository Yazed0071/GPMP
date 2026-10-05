// Routes for /api/showcase: browse finished projects, upload the showcase video and
// description, play the video and download the final documents (FR-8, FR-18, FR-19).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadVideo } from '../middleware/upload.js';
import {
  listShowcase,
  listShowcaseYears,
  getShowcaseItem,
  updateShowcase,
  removeShowcaseVideo,
  streamShowcaseVideo,
  downloadShowcaseDocument,
} from '../controllers/showcase.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listShowcase);
router.get('/years', listShowcaseYears); // must come before '/:projectId'
router.get('/:projectId', getShowcaseItem);
// requireRole runs before uploadVideo, so a non-student's video is never saved
router.put('/:projectId', requireRole('Student'), uploadVideo, updateShowcase);
router.get('/:projectId/video', streamShowcaseVideo);
router.delete('/:projectId/video', requireRole('Student', 'Administrator'), removeShowcaseVideo);
router.get('/:projectId/documents/:fileId/download', downloadShowcaseDocument);

export default router;
