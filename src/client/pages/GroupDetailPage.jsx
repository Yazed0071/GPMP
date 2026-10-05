// GroupDetailPage: one group for supervisors, examiners and administrators (FR-4, UC10).
// Shows the same project overview as My Project, quick links to the group's other pages,
// the status / archive actions (supervisor, admin) and the admin's Edit / Delete buttons.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import ConfirmButton from '../components/common/ConfirmButton.jsx';
import Icon from '../components/common/Icon.jsx';
import ProjectOverview from '../components/project/ProjectOverview.jsx';
import GroupFormModal from '../components/project/GroupFormModal.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { deleteGroup, getGroup } from '../api/groups.js';
import { FINISHED_STATUSES } from '../api/projects.js';
import { rolesFor } from '../config/roles.js';
import '../styles/project.css';
import '../styles/showcase.css';

// Links to the group's pages. Each link is shown only to the roles that may open that page
// (ROUTE_ROLES in config/roles.js, the same rules as the sidebar).
const QUICK_LINKS = [
  { to: '/tasks', label: 'Tasks', icon: 'tasks', color: 'green' },
  { to: '/documents', label: 'Documents', icon: 'document', color: 'amber' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', color: 'purple' },
  { to: '/chat', label: 'Chat', icon: 'chat', color: 'teal' },
  { to: '/attendance', label: 'Attendance', icon: 'attendance', color: 'blue' },
  { to: '/proposals', label: 'Proposals', icon: 'proposal', color: 'navy' },
];

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user.role === 'Administrator';
  const [editing, setEditing] = useState(false);

  const { data: group, loading, error, reload } = useApi(() => getGroup(id), [id]);

  // Live updates when a proposal or group notification arrives
  useSocketEvent('notification:new', (notification) => {
    if (['Proposal', 'Feedback', 'System'].includes(notification.type)) reload();
  });

  async function handleDelete() {
    await deleteGroup(group.id);
    toast.success(`Group "${group.name}" deleted.`);
    navigate('/groups', { replace: true });
  }

  if (loading || error) {
    return (
      <>
        <PageHeader title="Group" backTo="/groups" backLabel="All groups" />
        {loading ? <Loading /> : <ErrorMessage error={error} onRetry={error.status === 403 || error.status === 404 ? undefined : reload} />}
      </>
    );
  }

  const canDelete = isAdmin && !(group.project && FINISHED_STATUSES.includes(group.project.status));
  const links = QUICK_LINKS.filter((link) => rolesFor(link.to).includes(user.role));

  return (
    <>
      <PageHeader
        title={group.name}
        subtitle={group.project ? group.project.title : 'This group has no project yet'}
        backTo="/groups"
        backLabel="All groups"
        actions={
          isAdmin && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Icon name="edit" size={16} /> Edit group
              </button>
              {canDelete && (
                <ConfirmButton
                  title="Delete this group?"
                  message={`"${group.name}" will be deleted with its project, tasks, files, calendar and chat. Its students will have no group. This cannot be undone.`}
                  onConfirm={handleDelete}
                >
                  <Icon name="trash" size={16} /> Delete
                </ConfirmButton>
              )}
            </>
          )
        }
      />

      <nav className="proj-quick-links" aria-label={`${group.name} pages`}>
        {links.map((link) => (
          <Link key={link.to} to={`${link.to}?groupId=${group.id}`} className="proj-quick-link">
            <span className={`icon-tile tile-${link.color}`}>
              <Icon name={link.icon} size={18} />
            </span>
            {link.label}
          </Link>
        ))}
      </nav>

      <ProjectOverview group={group} onChanged={reload} />

      {isAdmin && (
        <GroupFormModal
          open={editing}
          group={group}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </>
  );
}
