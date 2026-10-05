// MyProjectPage: the student's graduation project (FR-3, FR-4, FR-6, FR-18, UC11, UC17).
// Students without a group see a friendly message; a group without a project sees the
// create-project form; otherwise the full project overview (proposal, feedback, team,
// supervisor, documents, events and - once completed - the showcase).
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ProjectOverview from '../components/project/ProjectOverview.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { getGroup, getGroups } from '../api/groups.js';
import '../styles/project.css';
import '../styles/showcase.css';

// Notifications that may change what this page shows (a review, a new supervisor...)
const LIVE_TYPES = ['Proposal', 'Feedback', 'System'];

// A student can access only their own group, so the first (and only) group is theirs
async function loadMyGroup() {
  const groups = await getGroups();
  if (groups.length === 0) return { group: null };
  return { group: await getGroup(groups[0].id) };
}

export default function MyProjectPage() {
  const { user, refreshUser } = useAuth();
  const { data, loading, error, reload } = useApi(loadMyGroup, []);

  // Live updates: reload when a related notification arrives or the connection comes back
  useSocketEvent('notification:new', (notification) => {
    if (LIVE_TYPES.includes(notification.type)) reload();
  });
  useSocketEvent('connect', () => reload());

  // If the administrator changed the student's group, refresh the logged-in user too
  const loadedGroupId = data ? data.group?.id ?? null : undefined;
  useEffect(() => {
    if (loadedGroupId !== undefined && loadedGroupId !== (user.groupId ?? null)) {
      refreshUser().catch(() => {});
    }
  }, [loadedGroupId, user.groupId, refreshUser]);

  const group = data?.group;

  return (
    <>
      <PageHeader
        title="My Project"
        subtitle={group ? `${group.name} · your graduation project, team and proposal` : 'Your graduation project, team and proposal'}
      />

      {loading ? (
        <Loading text="Loading your project..." />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : !group ? (
        <Card>
          <EmptyState
            icon="users"
            title="You are not in a group yet"
            message="The administrator will add you to a group. Meanwhile, you can browse the projects of previous years."
            action={
              <Link to="/showcase" className="btn btn-secondary">
                Browse the showcase
              </Link>
            }
          />
        </Card>
      ) : (
        <ProjectOverview group={group} onChanged={reload} />
      )}
    </>
  );
}
