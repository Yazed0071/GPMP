// ShowcaseDetailModal: everything about one showcased project - video, description, team,
// supervisor and the final documents to download (FR-8, FR-18, FR-19).
//
// Props:
//   projectId  number|null  the project to show (null = closed)
//   title      string       the project title, shown as the modal heading
//   onClose    function
import Modal from '../common/Modal.jsx';
import Loading from '../common/Loading.jsx';
import ErrorMessage from '../common/ErrorMessage.jsx';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import ShowcaseVideo from './ShowcaseVideo.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadShowcaseDocument, getShowcaseProject } from '../../api/showcase.js';
import { formatDate, formatFileSize } from '../../utils/format.js';
import { fileIconName } from '../../utils/files.js';

// The content of the modal (only rendered while the modal is open)
function ShowcaseDetail({ projectId }) {
  const toast = useToast();
  const { data: project, loading, error, reload } = useApi(() => getShowcaseProject(projectId), [projectId]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} onRetry={reload} />;

  async function handleDownload(document) {
    try {
      await downloadShowcaseDocument(project.id, document);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="stack-lg">
      <div className="show-detail-meta">
        <StatusBadge status={project.status} dot />
        {project.academicYear && <span className="badge badge-navy">{project.academicYear}</span>}
        <span className="muted small">{project.groupName}</span>
        {project.completedAt && <span className="muted small">· Completed {formatDate(project.completedAt)}</span>}
      </div>

      {project.hasVideo ? (
        // ShowcaseVideo frees the temporary video address when the modal closes
        <ShowcaseVideo projectId={project.id} title={project.title} />
      ) : (
        <div className="show-video-placeholder">
          <span className="muted small">
            <Icon name="video" size={18} /> No demo video was uploaded for this project.
          </span>
        </div>
      )}

      <section>
        <p className="show-label">About the project</p>
        <p className="show-detail-text">{project.showcaseDescription || project.description}</p>
        {project.showcaseDescription && project.description && (
          <details className="mt-1">
            <summary className="link-text small">Original project description</summary>
            <p className="show-detail-text small mt-1">{project.description}</p>
          </details>
        )}
      </section>

      <div className="show-detail-columns">
        <section>
          <p className="show-label">Team</p>
          <ul className="show-people">
            {project.memberDetails.map((member, index) => (
              <li key={`${member.name}-${index}`}>
                <Avatar name={member.name} size="small" />
                <div>
                  {member.name}
                  {member.major && <span>{member.major}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <p className="show-label">Supervision</p>
          <ul className="show-people">
            <li>
              <Avatar name={project.supervisorName || '?'} size="small" />
              <div>
                {project.supervisorName || 'Not recorded'}
                <span>Supervisor</span>
              </div>
            </li>
            {project.examinerName && (
              <li>
                <Avatar name={project.examinerName} size="small" />
                <div>
                  {project.examinerName}
                  <span>Examiner</span>
                </div>
              </li>
            )}
          </ul>
        </section>
      </div>

      <section>
        <p className="show-label">Final documents</p>
        {project.documents.length === 0 ? (
          <EmptyState compact icon="document" title="No documents" message="This project has no final documents yet." />
        ) : (
          <ul className="show-docs">
            {project.documents.map((document) => (
              <li key={document.id}>
                <span className="icon-tile tile-blue show-doc-icon">
                  <Icon name={fileIconName(document.name)} size={18} />
                </span>
                <div className="show-doc-text">
                  <strong title={document.name}>{document.name}</strong>
                  <span className="meta">{formatFileSize(document.size)}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => handleDownload(document)}
                  aria-label={`Download ${document.name}`}
                >
                  <Icon name="download" size={16} /> <span className="hide-mobile">Download</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ShowcaseDetailModal({ projectId, title, onClose }) {
  return (
    <Modal open={projectId !== null} onClose={onClose} title={title || 'Project details'} size="large">
      {projectId !== null && <ShowcaseDetail projectId={projectId} />}
    </Modal>
  );
}
