// UploadDocumentCard: upload one project document to a group (FR-16, UC4 Upload Files).
// The file type and size are checked before uploading (same rules as the backend).
// Uploading a file with the same name again creates a new version (v2, v3, ...).
//
// Props:
//   groupId     number    the group to upload to
//   onUploaded  function  called with the uploaded file (to refresh the list)
import { useState } from 'react';
import Card from '../common/Card.jsx';
import FileDrop from '../common/FileDrop.jsx';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { uploadDocument } from '../../api/files.js';

export default function UploadDocumentCard({ groupId, onUploaded }) {
  const toast = useToast();
  const [files, setFiles] = useState([]); // FileDrop works with a list; here it holds 0 or 1 file
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload(event) {
    event.preventDefault();
    if (files.length === 0) {
      setError('Please choose a file to upload.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadDocument(groupId, files[0]);
      toast.success(
        uploaded.version > 1
          ? `${uploaded.fileName} uploaded as version ${uploaded.version}`
          : `${uploaded.fileName} uploaded`
      );
      setFiles([]);
      onUploaded?.(uploaded);
    } catch (err) {
      // UC4 exceptional flows: unsupported type or a failed upload -> show the message, keep the
      // chosen file so the user can simply press Upload again
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card title="Upload a document" icon="upload" subtitle="Share project files with your group.">
      <form className="form" onSubmit={handleUpload} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <FileDrop
          id="doc-file-input"
          label="File"
          files={files}
          onFiles={(chosen) => {
            setFiles(chosen.slice(0, 1));
            setError('');
          }}
          onRemove={() => setFiles([])}
          disabled={uploading}
        />

        <p className="field-hint doc-version-hint">
          <Icon name="info" size={14} /> Uploading a file with the same name again saves it as a new version.
        </p>

        <button type="submit" className="btn btn-primary btn-block" disabled={uploading || files.length === 0}>
          {uploading ? (
            <>
              <span className="spinner spinner-small doc-button-spinner" aria-hidden="true" /> Uploading...
            </>
          ) : (
            <>
              <Icon name="upload" size={16} /> Upload
            </>
          )}
        </button>
      </form>
    </Card>
  );
}
