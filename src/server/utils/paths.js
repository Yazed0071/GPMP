// Where uploaded files live on disk, plus safe helpers to find and delete them.
// The database only stores the file's stored name (e.g. "1727...-a1b2c3.pdf");
// these helpers turn that name into a full path inside the uploads/ folder.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Absolute path of the project folder. This file is in src/server/utils/ (three levels down)
export const PROJECT_DIR = path.resolve(currentDir, '../../..');

// Absolute path of the uploads/ folder (created automatically if missing)
export const UPLOAD_DIR = path.join(PROJECT_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Returns the absolute path of a stored upload.
 * path.basename() removes any folder parts, so a value like "../../.env"
 * can never point outside the uploads folder.
 */
export function getUploadPath(storedName) {
  return path.join(UPLOAD_DIR, path.basename(String(storedName)));
}

// True when the stored file really exists on disk
export function storedFileExists(storedName) {
  if (!storedName) return false;
  try {
    return fs.statSync(getUploadPath(storedName)).isFile();
  } catch {
    return false;
  }
}

/**
 * Deletes a stored upload. Never throws: returns true if deleted, false otherwise.
 * Use it after deleting a file row, or when replacing a showcase video.
 */
export async function deleteStoredFile(storedName) {
  if (!storedName) return false;
  try {
    await fs.promises.unlink(getUploadPath(storedName));
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[uploads] Could not delete file:', storedName, err.message);
    return false;
  }
}
