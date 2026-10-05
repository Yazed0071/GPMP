// GroupCard: one group on the Groups page - project, task progress, supervisor, examiner,
// latest proposal status and members. Administrators also get Edit and Delete (UC10).
//
// Props:
//   group     object    a group summary from GET /api/groups
//   isAdmin   boolean   show the Edit and Delete buttons
//   onEdit    function  (group) => opens the edit form
//   onDelete  function  async (group) => deletes the group (called after confirming)
import { Link } from 'react-router-dom';
import Avatar from '../common/Avatar.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import Icon from '../common/Icon.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { plural } from '../../utils/format.js';
import { FINISHED_STATUSES } from '../../api/projects.js';

export default function GroupCard({ group, isAdmin = false, onEdit, onDelete }) {
  const { project, members } = group;
  // Groups with a finished project are kept for the archive (the backend refuses to delete them)
  const canDelete = isAdmin && !(project && FINISHED_STATUSES.includes(project.status));

  return (
    <article className="proj-group-card">
      <div className="proj-group-card-head">
        <span className="icon-tile tile-teal">
          <Icon name="users" size={20} />
        </span>
        <div className="proj-list-text">
          <h3>
            <Link to={`/groups/${group.id}`}>{group.name}</Link>
          </h3>
          <span className="meta">{plural(members.length, 'member')}</span>
        </div>
        {project ? <StatusBadge status={project.status} /> : <StatusBadge status="To Do">No project</StatusBadge>}
      </div>

      <p className="proj-group-title">{project ? project.title : 'No project created yet'}</p>
      <ProgressBar value={group.progress.percent} label="Task progress" showValue size="small" />

      <div className="proj-group-staff">
        <span>
          <Icon name="supervisor" size={15} /> {group.supervisor?.name || 'No supervisor yet'}
        </span>
        <span>
          <Icon name="eye" size={15} /> {group.examiner?.name || 'No examiner yet'}
        </span>
        {group.latestProposalStatus && (
          <span>
            <Icon name="proposal" size={15} /> Proposal <StatusBadge status={group.latestProposalStatus} />
          </span>
        )}
      </div>

      <div className="proj-group-card-foot">
        <div className="avatar-stack">
          {members.slice(0, 4).map((member) => (
            <Avatar key={member.studentId} name={member.name} size="small" />
          ))}
        </div>
        <div className="actions">
          {isAdmin && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-small"
              onClick={() => onEdit(group)}
              aria-label={`Edit ${group.name}`}
            >
              <Icon name="edit" size={16} />
            </button>
          )}
          {canDelete && (
            <ConfirmButton
              className="btn btn-ghost btn-icon btn-small"
              ariaLabel={`Delete ${group.name}`}
              title="Delete this group?"
              message={`"${group.name}" will be deleted with its project, tasks, files, calendar and chat. Its students will have no group. This cannot be undone.`}
              onConfirm={() => onDelete(group)}
            >
              <Icon name="trash" size={16} />
            </ConfirmButton>
          )}
          <Link to={`/groups/${group.id}`} className="btn btn-secondary btn-small">
            Open
          </Link>
        </div>
      </div>
    </article>
  );
}
