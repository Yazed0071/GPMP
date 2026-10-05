// Routes for /api/files: list, upload, download and delete group documents (FR-16, UC4).

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadFile } from '../middleware/upload.js';
import { listFiles, uploadDocument, downloadFile, deleteFile } from '../controllers/files.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listFiles);
router.get('/:id/download', downloadFile);

// Everyone with access to the group except examiners may upload.
// The role is checked BEFORE the upload, so an examiner's file is never saved.
router.post('/', requireRole('Student', 'Supervisor', 'Administrator'), uploadFile, uploadDocument);

router.delete('/:id', deleteFile);

export default router;
