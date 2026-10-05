// GroupsPage: the groups a supervisor or examiner works with, or - for the administrator -
// every group with create, edit and delete (UC10 Manage Groups).
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Icon from '../components/common/Icon.jsx';
import GroupCard from '../components/project/GroupCard.jsx';
import GroupFormModal from '../components/project/GroupFormModal.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { deleteGroup, getGroups } from '../api/groups.js';
import '../styles/project.css';

// True when the group, its project or one of its people matches the search text
function matchesSearch(group, text) {
  if (!text) return true;
  const haystack = [
    group.name,
    group.project?.title,
    group.supervisor?.name,
    group.examiner?.name,
    ...group.members.map((member) => member.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(text.toLowerCase());
}

// A few numbers for the top of the page
function countStats(groups) {
  return {
    total: groups.length,
    inProgress: groups.filter((g) => g.project?.status === 'In Progress').length,
    pendingProposals: groups.filter((g) => g.latestProposalStatus?.startsWith('Pending')).length,
    withoutSupervisor: groups.filter((g) => !g.supervisor).length,
  };
}

export default function GroupsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'Administrator';

  const { data: groups, loading, error, reload } = useApi(getGroups, []);
  const [search, setSearch] = useState('');
  // null = form closed, 'new' = create a group, or the group being edited
  const [editing, setEditing] = useState(null);

  async function handleDelete(group) {
    await deleteGroup(group.id);
    toast.success(`Group "${group.name}" deleted.`);
    reload();
  }

  function handleSaved() {
    setEditing(null);
    reload();
  }

  const subtitle = isAdmin
    ? 'Create and manage student groups, their supervisors and examiners.'
    : user.role === 'Supervisor'
      ? 'The groups you supervise.'
      : 'The groups you examine.';

  let content;
  if (loading) content = <Loading text="Loading groups..." />;
  else if (error) content = <ErrorMessage error={error} onRetry={reload} />;
  else if (groups.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon="users"
          title="No groups yet"
          message={isAdmin ? 'Create the first group and add students to it.' : 'You are not assigned to any group yet.'}
          action={
            isAdmin && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                <Icon name="plus" size={16} /> New group
              </button>
            )
          }
        />
      </Card>
    );
  } else {
    const stats = countStats(groups);
    const visible = groups.filter((group) => matchesSearch(group, search.trim()));
    content = (
      <>
        <div className="stats-grid">
          <StatCard icon="users" color="teal" value={stats.total} label="Groups" />
          <StatCard icon="trendingUp" color="amber" value={stats.inProgress} label="Projects in progress" />
          <StatCard icon="proposal" color="purple" value={stats.pendingProposals} label="Proposals under review" />
          <StatCard
            icon="supervisor"
            color={stats.withoutSupervisor > 0 ? 'red' : 'green'}
            value={stats.withoutSupervisor}
            label="Groups without a supervisor"
          />
        </div>

        <div className="proj-toolbar">
          <div className="form-field proj-search">
            <label htmlFor="group-search" className="sr-only">
              Search groups
            </label>
            <div className="input-with-icon">
              <Icon name="search" size={16} />
              <input
                id="group-search"
                type="search"
                placeholder="Search by group, project, student or staff name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <Card>
            <EmptyState icon="search" title="No group matches your search" message="Try another name." compact />
          </Card>
        ) : (
          <div className="grid">
            {visible.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isAdmin={isAdmin}
                onEdit={(g) => setEditing(g)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle={subtitle}
        actions={
          isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> New group
            </button>
          )
        }
      />
      {content}

      {isAdmin && (
        <GroupFormModal
          open={editing !== null}
          group={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
