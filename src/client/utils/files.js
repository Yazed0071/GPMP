// File rules shared by every upload form. They match the backend upload rules
// (src/server/middleware/upload.js), so users see a clear message BEFORE uploading.

export const MAX_FILE_MB = 20;
export const MAX_VIDEO_MB = 200;
export const MAX_FILES_PER_UPLOAD = 5;

export const DOCUMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv',
  'zip', 'rar', 'png', 'jpg', 'jpeg', 'gif',
];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];

// Values for the `accept` attribute of <input type="file">
export const ACCEPT_DOCUMENTS = DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');
export const ACCEPT_VIDEOS = VIDEO_EXTENSIONS.map((ext) => `.${ext}`).join(',');

// "Report.PDF" -> "pdf"
export function fileExtension(name = '') {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

// Returns an error message for a file that the backend would reject, or null if it is fine.
// kind = 'document' (default) or 'video'
export function checkFile(file, kind = 'document') {
  const isVideo = kind === 'video';
  const allowed = isVideo ? VIDEO_EXTENSIONS : DOCUMENT_EXTENSIONS;
  const maxMb = isVideo ? MAX_VIDEO_MB : MAX_FILE_MB;

  if (!allowed.includes(fileExtension(file.name))) {
    return isVideo
      ? 'This video type is not allowed (use MP4, WebM or MOV).'
      : 'This file type is not allowed.';
  }
  // UC5 exceptional flow: an empty file is damaged (the backend refuses it too)
  if (file.size === 0) return 'The file is empty or damaged. Please choose it again.';
  if (file.size > maxMb * 1024 * 1024) {
    return `The file is too large (maximum ${maxMb} MB).`;
  }
  return null;
}

// An Icon name that fits the file type (used in file lists)
export function fileIconName(name = '') {
  const ext = fileExtension(name);
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (['zip', 'rar'].includes(ext)) return 'archive';
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return 'document';
  return 'file';
}
