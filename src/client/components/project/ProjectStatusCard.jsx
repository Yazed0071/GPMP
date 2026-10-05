// ProjectStatusCard: lets the group's supervisor mark the project Completed or re-open it,
// archive a completed project (FR-4, FR-8), and lets the administrator set any status.
//
// Props:
//   project      object    { id, title, status, completedAt, archivedAt }
//   permissions  object    { canChangeStatus, canArchive } from the group detail
//   isAdmin      boolean
//   onChanged    function  reload after a change
import { useState } from 'react';
import Card from '../common/Card.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { archiveProject, updateProjectStatus } from '../../api/projects.js';
import { formatDate } from '../../utils/format.js';

const ALL_STATUSES = ['Proposed', 'In Progress', 'Completed', 'Archived'];

export default function ProjectStatusCard({ project, permissions, isAdmin, onChanged }) {
  const toast = useToast();
  const [adminStatus, setAdminStatus] = useState(project.status);
  const [saving, setSaving] = useState(false);

  async function changeStatus(status) {
    await updateProjectStatus(project.id, status);
    toast.success(`The project is now ${status}.`);
    onChanged();
  }

  async function handleArchive() {
    await archiveProject(project.id);
    toast.success('The project was archived with its documents and showcase.');
    onChanged();
  }

  // Administrator: save the status chosen in the drop-down
  async function handleAdminSave(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await changeStatus(adminStatus);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Project status" icon="flag" iconColor="green">
      <div className="proj-status-row">
        <span className="muted small">Current status</span>
        <StatusBadge status={project.status} dot />
      </div>
      {(project.completedAt || project.archivedAt) && (
        <div className="proj-status-dates meta">
          {project.completedAt && <span>Completed on {formatDate(project.completedAt)}</span>}
          {project.archivedAt && <span>Archived on {formatDate(project.archivedAt)}</span>}
        </div>
      )}

      {isAdmin ? (
        <form className="form" onSubmit={handleAdminSave}>
          <div className="form-field">
            <label htmlFor="admin-project-status">Change status</label>
            <select id="admin-project-status" value={adminStatus} onChange={(event) => setAdminStatus(event.target.value)}>
              {ALL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving || adminStatus === project.status}>
            {saving ? 'Saving...' : 'Save status'}
          </button>
        </form>
      ) : (
        <div className="stack-sm">
          {project.status === 'Proposed' && (
            <p className="muted small">The project starts when its proposal is approved.</p>
          )}
          {project.status === 'Archived' && (
            <p className="muted small">This project is archived. Only the administrator can change it.</p>
          )}
          {permissions.canChangeStatus && project.status === 'In Progress' && (
            <ConfirmButton
              className="btn btn-primary btn-block"
              danger={false}
              confirmLabel="Mark as completed"
              title="Mark the project as completed?"
              message={`"${project.title}" will be marked as completed. The students can then add their showcase video and description.`}
              onConfirm={() => changeStatus('Completed')}
            >
              <Icon name="check" size={16} /> Mark as completed
            </ConfirmButton>
          )}
          {permissions.canChangeStatus && project.status === 'Completed' && (
            <ConfirmButton
              className="btn btn-secondary btn-block"
              danger={false}
              confirmLabel="Re-open"
              title="Re-open the project?"
              message="The project goes back to In Progress."
              onConfirm={() => changeStatus('In Progress')}
            >
              <Icon name="refresh" size={16} /> Re-open project
            </ConfirmButton>
          )}
        </div>
      )}

      {permissions.canArchive && (
        <div className="mt-2">
          <ConfirmButton
            className="btn btn-dark btn-block"
            danger={false}
            confirmLabel="Archive"
            title="Archive the project?"
            message="The project, its final documents and its showcase are kept in the projects archive (FR-8). Only the administrator can change an archived project."
            onConfirm={handleArchive}
          >
            <Icon name="archive" size={16} /> Archive project
          </ConfirmButton>
        </div>
      )}
    </Card>
  );
}
