// SubmitWorkForm: lets a student submit their work for a task (UC5 Submit Tasks).
// The student attaches up to 5 files (drag and drop or browse) and/or a link, plus optional notes.
// After submitting, the task becomes "Submitted" and the supervisor is notified.
//
// Props:
//   task         object    the task being submitted (uses id and dueDate)
//   onSubmitted  function  called after a successful submission (e.g. to reload the page)
import { useState } from 'react';
import FileDrop from '../common/FileDrop.jsx';
import FormField from '../common/FormField.jsx';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createSubmission } from '../../api/submissions.js';
import { MAX_FILES_PER_UPLOAD, MAX_FILE_MB } from '../../utils/files.js';
import { isOverdue } from '../../utils/format.js';
import { isWebLink } from '../../utils/validation.js';

export default function SubmitWorkForm({ task, onSubmitted }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [saving, setSaving] = useState(false);

  function addFiles(newFiles) {
    // Skip files that are already in the list (same name and size)
    const fresh = newFiles.filter((file) => !files.some((old) => old.name === file.name && old.size === file.size));
    const all = [...files, ...fresh];
    // Keep at most 5 files in total, and say so when some were left out
    setFiles(all.slice(0, MAX_FILES_PER_UPLOAD));
    setError(
      all.length > MAX_FILES_PER_UPLOAD
        ? `You can attach up to ${MAX_FILES_PER_UPLOAD} files. The extra files were not added.`
        : ''
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSourceError('');

    // Same checks as the backend (UC5)
    if (files.length === 0 && !source.trim()) {
      setError('Please attach a file or add a link.');
      return;
    }
    if (source.trim() && !isWebLink(source)) {
      setSourceError('The link must start with http:// or https://');
      return;
    }

    setSaving(true);
    try {
      await createSubmission({ taskId: task.id, files, source, notes });
      toast.success('Your work was submitted. Your supervisor has been notified.');
      setFiles([]);
      setSource('');
      setNotes('');
      onSubmitted?.();
    } catch (err) {
      // A connection problem gives "Cannot reach the server... try again" (UC4 exceptional flow).
      // The chosen files stay in the form, so the student can simply press Submit again.
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {isOverdue(task.dueDate) && (
        <div className="alert alert-warning">
          The due date has passed. You can still submit, but your submission will be marked as late.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <FileDrop
        id="submission-files"
        label="Files"
        multiple
        files={files}
        onFiles={addFiles}
        onRemove={(index) => setFiles((old) => old.filter((_, n) => n !== index))}
        disabled={saving}
        hint={`Up to ${MAX_FILES_PER_UPLOAD} files - PDF, Word, PowerPoint, Excel, text, images or ZIP, ${MAX_FILE_MB} MB each`}
      />

      <FormField
        id="submission-source"
        label="Link (optional)"
        type="url"
        placeholder="https://github.com/your-team/project"
        hint="For example a GitHub repository, Figma file or Google Drive folder."
        value={source}
        onChange={(e) => {
          setSource(e.target.value);
          setSourceError('');
        }}
        error={sourceError}
        disabled={saving}
      />

      <FormField
        id="submission-notes"
        label="Notes for your supervisor (optional)"
        as="textarea"
        rows={3}
        placeholder="What did you change? Anything the supervisor should know?"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={saving}
      />

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Icon name="send" size={16} />
          {saving ? 'Submitting...' : 'Submit work'}
        </button>
      </div>
    </form>
  );
}
