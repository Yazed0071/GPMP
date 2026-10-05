// FilesTable: the list of a group's files with name, version, category, uploader, date and size,
// plus download and delete buttons (FR-16). On phones the extra columns are hidden and their
// details are shown under the file name instead.
//
// Props:
//   files      array     files from GET /api/files (each has canDelete from the backend)
//   onDeleted  function  called with the file id after it was deleted
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmButton from '../common/ConfirmButton.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { deleteFile, downloadGroupFile } from '../../api/files.js';
import { fileExtension, fileIconName } from '../../utils/files.js';
import { formatDate, formatFileSize } from '../../utils/format.js';

// Icon tile color per file type
function tileColor(fileName) {
  const ext = fileExtension(fileName);
  if (ext === 'pdf') return 'red';
  if (['doc', 'docx', 'txt'].includes(ext)) return 'blue';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'green';
  if (['ppt', 'pptx'].includes(ext)) return 'orange';
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'purple';
  return 'gray';
}

export default function FilesTable({ files, onDeleted }) {
  const toast = useToast();
  const [downloadingId, setDownloadingId] = useState(null);

  async function handleDownload(file) {
    setDownloadingId(file.id);
    try {
      await downloadGroupFile(file);
    } catch (err) {
      toast.error(err);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(file) {
    await deleteFile(file.id); // ConfirmButton shows the error as a toast if this fails
    toast.success(`${file.fileName} deleted`);
    onDeleted?.(file.id);
  }

  return (
    <div className="table-wrap">
      <table className="table doc-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="hide-mobile">Category</th>
            <th scope="col" className="hide-mobile">Uploaded</th>
            <th scope="col" className="hide-mobile">Size</th>
            <th scope="col" className="actions-cell">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td>
                <div className="doc-name">
                  <span className={`icon-tile tile-${tileColor(file.fileName)} doc-file-icon`}>
                    <Icon name={fileIconName(file.fileName)} size={18} />
                  </span>
                  <div className="doc-name-text">
                    <strong>
                      {file.fileName}
                      <span className="badge badge-navy doc-version" title={`Version ${file.version}`}>
                        v{file.version}
                      </span>
                    </strong>
                    {file.taskId && (
                      <Link to={`/tasks/${file.taskId}`} className="doc-task-link">
                        <Icon name="tasks" size={13} /> {file.taskTitle}
                      </Link>
                    )}
                    {/* Shown only on phones, where the other columns are hidden */}
                    <span className="doc-mobile-meta">
                      {file.category} · {file.uploadedBy?.name || 'Former user'} · {formatDate(file.uploadDate)} ·{' '}
                      {formatFileSize(file.fileSize)}
                    </span>
                  </div>
                </div>
              </td>
              <td className="hide-mobile">
                <StatusBadge status={file.category} />
              </td>
              <td className="hide-mobile">
                <span className="doc-uploader">{file.uploadedBy?.name || 'Former user'}</span>
                <span className="doc-date">{formatDate(file.uploadDate)}</span>
              </td>
              <td className="hide-mobile nowrap">{formatFileSize(file.fileSize)}</td>
              <td className="actions-cell">
                <div className="doc-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-small"
                    onClick={() => handleDownload(file)}
                    disabled={downloadingId === file.id}
                    aria-label={`Download ${file.fileName}`}
                    title="Download"
                  >
                    <Icon name="download" size={16} />
                  </button>
                  {file.canDelete && (
                    <ConfirmButton
                      onConfirm={() => handleDelete(file)}
                      className="btn btn-ghost btn-icon btn-small doc-delete"
                      ariaLabel={`Delete ${file.fileName}`}
                      title="Delete this file?"
                      message={`"${file.fileName}" (v${file.version}) will be deleted for everyone in the group. This cannot be undone.`}
                    >
                      <Icon name="trash" size={16} />
                    </ConfirmButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
