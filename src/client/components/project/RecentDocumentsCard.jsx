// RecentDocumentsCard: the 5 newest files of a group with a download button (FR-4, FR-16).
//
// Props:
//   documents  array   [{ id, name, category, version, size, uploadedAt, uploadedBy }]
//   groupId    number  used for the "View all" link to the Documents page
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Icon from '../common/Icon.jsx';
import { downloadGroupFile } from '../../api/files.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fileIconName } from '../../utils/files.js';
import { formatFileSize, timeAgo } from '../../utils/format.js';

export default function RecentDocumentsCard({ documents = [], groupId }) {
  const toast = useToast();

  async function handleDownload(document) {
    try {
      await downloadGroupFile({ id: document.id, fileName: document.name });
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Card
      title="Recent documents"
      icon="document"
      iconColor="amber"
      flush
      actions={<Link to={`/documents?groupId=${groupId}`}>View all</Link>}
    >
      {documents.length === 0 ? (
        <EmptyState compact icon="document" title="No documents yet" message="Files uploaded by the team will appear here." />
      ) : (
        <ul className="list">
          {documents.map((document) => (
            <li key={document.id}>
              <span className="icon-tile tile-amber proj-doc-icon">
                <Icon name={fileIconName(document.name)} size={18} />
              </span>
              <div className="proj-list-text">
                <strong title={document.name}>{document.name}</strong>
                <div className="meta">
                  <span>{document.category}</span>
                  {document.version > 1 && <span>v{document.version}</span>}
                  <span>{formatFileSize(document.size)}</span>
                  <span>{timeAgo(document.uploadedAt)}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-small"
                onClick={() => handleDownload(document)}
                aria-label={`Download ${document.name}`}
              >
                <Icon name="download" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
