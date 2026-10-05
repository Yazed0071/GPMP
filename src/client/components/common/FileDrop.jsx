// FileDrop: a drag-and-drop area (with a "browse" button) for choosing files to upload.
// It checks the file type and size first (same rules as the backend) and shows a clear
// message for files that are not allowed. The page keeps the chosen files in its state.
//
// Props:
//   onFiles   function  called with an array of valid File objects (required)
//   files     File[]    the files the page has chosen so far (shown as a list)
//   onRemove  function  optional; called with the index of a file to remove from the list
//   multiple  boolean   allow several files (up to 5) - default false
//   kind      string    "document" (default) or "video" (MP4/WebM/MOV up to 200 MB)
//   id        string    id of the hidden file input (default "file-input")
//   label     string    label text (default "Attach file")
//   hint      string    help text (a default text lists the allowed types)
//   disabled  boolean
//
// Example:
//   const [files, setFiles] = useState([]);
//   <FileDrop multiple files={files} onFiles={(f) => setFiles([...files, ...f])}
//             onRemove={(i) => setFiles(files.filter((_, n) => n !== i))} />
//   // then: const form = new FormData(); files.forEach((f) => form.append('files', f));
import { useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { formatFileSize } from '../../utils/format.js';
import {
  ACCEPT_DOCUMENTS,
  ACCEPT_VIDEOS,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_MB,
  MAX_VIDEO_MB,
  checkFile,
  fileIconName,
} from '../../utils/files.js';

export default function FileDrop({
  onFiles,
  files = [],
  onRemove,
  multiple = false,
  kind = 'document',
  id = 'file-input',
  label = 'Attach file',
  hint,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const isVideo = kind === 'video';
  const defaultHint = isVideo
    ? `MP4, WebM or MOV — up to ${MAX_VIDEO_MB} MB`
    : `PDF, Word, PowerPoint, Excel, text, images or ZIP — up to ${MAX_FILE_MB} MB each`;

  function handleFiles(fileList) {
    const chosen = Array.from(fileList || []);
    if (chosen.length === 0) return;

    const limit = multiple ? MAX_FILES_PER_UPLOAD : 1;
    const problems = [];
    const valid = [];
    for (const file of chosen.slice(0, limit)) {
      const problem = checkFile(file, kind);
      if (problem) problems.push(`${file.name}: ${problem}`);
      else valid.push(file);
    }
    if (chosen.length > limit) {
      problems.push(multiple ? `You can upload up to ${limit} files at once.` : 'Please choose only one file.');
    }

    setError(problems.join(' '));
    if (valid.length > 0) onFiles(valid);
    // Clear the input so choosing the same file again still triggers onChange
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div
        className={`file-drop${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <span className="file-drop-icon">
          <Icon name={isVideo ? 'video' : 'upload'} size={24} />
        </span>
        <p>
          <strong>Drag {multiple ? 'files' : 'a file'} here</strong> or{' '}
          <span className="link-text">browse</span>
        </p>
        <p className="field-hint">{hint || defaultHint}</p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="sr-only"
          multiple={multiple}
          accept={isVideo ? ACCEPT_VIDEOS : ACCEPT_DOCUMENTS}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {error && <p className="field-error">{error}</p>}

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <Icon name={fileIconName(file.name)} size={18} />
              <span className="file-list-name">{file.name}</span>
              <span className="muted small">{formatFileSize(file.size)}</span>
              {onRemove && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-small"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove ${file.name}`}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
