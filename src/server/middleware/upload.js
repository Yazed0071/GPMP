// File-upload middlewares (built on multer). They save uploaded files into
// uploads/ with a random unique name and reject wrong types or sizes.
//   uploadFile  -> one document in the form field "file"   (max 20 MB)
//   uploadFiles -> up to 5 documents in the field "files"   (max 20 MB each)
//   uploadVideo -> one video in the field "video"           (max 200 MB, mp4/webm/mov)
// After the middleware, the file details are in req.file (or req.files for uploadFiles).
// Empty (0-byte) files are refused as damaged (UC5 exceptional flow).
// Uploaded files are never public: they are downloaded only through checked endpoints.

import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { HttpError } from '../utils/HttpError.js';
import { UPLOAD_DIR } from '../utils/paths.js';

const MB = 1024 * 1024;
const DOCUMENT_MAX_MB = 20;
const VIDEO_MAX_MB = 200;
const MAX_FILES = 5;

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.csv',
  '.zip', '.rar', '.png', '.jpg', '.jpeg', '.gif',
];
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

// Saves files as "<timestamp>-<random>.<ext>" so names never clash or reveal anything
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  },
});

// Returns a multer file filter that only accepts the given extensions
function onlyExtensions(allowed, message) {
  return (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(extension)) cb(null, true);
    else cb(new HttpError(400, message));
  };
}

function createUploader({ allowed, typeMessage, maxMb }) {
  return multer({
    storage,
    limits: { fileSize: maxMb * MB, files: MAX_FILES },
    fileFilter: onlyExtensions(allowed, typeMessage),
    defParamCharset: 'utf8', // keep Arabic and other non-English file names readable
  });
}

// Turns multer's technical errors into friendly 400 messages
function toFriendlyError(err, { maxMb, fieldName, maxCount }) {
  if (!(err instanceof multer.MulterError)) return err;

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return new HttpError(400, `The file is too large (maximum ${maxMb} MB).`);
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return maxCount > 1
        ? new HttpError(400, `You can upload up to ${maxCount} files at a time (field "${fieldName}").`)
        : new HttpError(400, `Please upload one file using the form field "${fieldName}".`);
    default:
      return new HttpError(400, 'The upload could not be processed. Please try again.');
  }
}

// Runs a multer middleware and passes any error on in our friendly format
function withFriendlyErrors(multerMiddleware, options) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        next(toFriendlyError(err, options));
        return;
      }
      // UC5 exceptional flow: an empty (0-byte) file is damaged or was not read correctly.
      // The error handler deletes the stored files for us.
      const uploaded = req.file ? [req.file] : Array.isArray(req.files) ? req.files : [];
      if (uploaded.some((file) => file.size === 0)) {
        next(new HttpError(400, 'The file is empty or damaged. Please choose it again.'));
        return;
      }
      next();
    });
  };
}

const documentUploader = createUploader({
  allowed: ALLOWED_DOCUMENT_EXTENSIONS,
  typeMessage: 'This file type is not allowed.',
  maxMb: DOCUMENT_MAX_MB,
});

const videoUploader = createUploader({
  allowed: ALLOWED_VIDEO_EXTENSIONS,
  typeMessage: 'This file type is not allowed. Please upload an MP4, WebM or MOV video.',
  maxMb: VIDEO_MAX_MB,
});

export const uploadFile = withFriendlyErrors(documentUploader.single('file'), {
  maxMb: DOCUMENT_MAX_MB,
  fieldName: 'file',
  maxCount: 1,
});

export const uploadFiles = withFriendlyErrors(documentUploader.array('files', MAX_FILES), {
  maxMb: DOCUMENT_MAX_MB,
  fieldName: 'files',
  maxCount: MAX_FILES,
});

export const uploadVideo = withFriendlyErrors(videoUploader.single('video'), {
  maxMb: VIDEO_MAX_MB,
  fieldName: 'video',
  maxCount: 1,
});

/**
 * Picks the values you need to save a row in the `file` table from a multer file.
 * Example:
 *   const info = getFileInfo(req.file);
 *   // -> { fileName: 'Report.pdf', filePath: '1727...-ab12.pdf', fileSize: 52311, mimeType: 'application/pdf' }
 */
export function getFileInfo(file) {
  return {
    fileName: file.originalname.slice(0, 255), // the name shown to users
    filePath: file.filename, // the stored name inside uploads/
    fileSize: file.size,
    mimeType: file.mimetype ? file.mimetype.slice(0, 100) : null,
  };
}
