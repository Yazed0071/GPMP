// AdminDashboard: the dashboard of an administrator.
// Platform counts (users, groups, projects, proposals), groups that still need a supervisor,
// examiner or project, quick links to the admin pages, the shared academic calendar,
// recent activity in all groups and the latest announcements.
//
// Props:
//   data  object  the Administrator dashboard from GET /api/dashboard
//   user  object  the logged-in user
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import StatCard from '../common/StatCard.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Icon from '../common/Icon.jsx';
import { statusColor } from '../common/StatusBadge.jsx';
import UpcomingList from '../calendar/UpcomingList.jsx';
import DashboardHero from './DashboardHero.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import AnnouncementList from './AnnouncementList.jsx';
import Breakdown from './Breakdown.jsx';
import { plural } from '../../utils/format.js';

// The shortcuts shown in the "Quick Links" card
const QUICK_LINKS = [
  { to: '/users', label: 'Users', icon: 'shield', color: 'navy' },
  { to: '/groups', label: 'Groups', icon: 'users', color: 'teal' },
  { to: '/announcements', label: 'Announcements', icon: 'megaphone', color: 'blue' },
  { to: '/supervisors', label: 'Supervisors', icon: 'supervisor', color: 'purple' },
  { to: '/proposals', label: 'Proposals', icon: 'proposal', color: 'amber' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', color: 'green' },
];

// { Proposed: 1, ... } -> [{ label: 'Proposed', value: 1, color: 'blue' }, ...]
function toBreakdownItems(counts) {
  return Object.entries(counts).map(([label, value]) => ({ label, value, color: statusColor(label) }));
}

// The line under the greeting
function heroMessage(stats) {
  const parts = [];
  if (stats.groupsWithoutSupervisor > 0) parts.push(`${plural(stats.groupsWithoutSupervisor, 'group')} without a supervisor`);
  if (stats.studentsWithoutGroup > 0) parts.push(`${plural(stats.studentsWithoutGroup, 'student')} without a group`);
  if (stats.pendingProposals > 0) parts.push(`${plural(stats.pendingProposals, 'proposal')} in review`);
  return parts.length > 0
    ? `Here is the platform today: ${parts.join(', ')}.`
    : 'Everything is set up. All groups have a supervisor and every student has a group.';
}

export default function AdminDashboard({ data, user }) {
  const { stats, attention, upcoming, recentActivity, announcements } = data;

  return (
    <>
      <DashboardHero
        name={user.name}
        message={heroMessage(stats)}
        tileValue={stats.activeUsers}
        tileLabel="Active users"
        tileTo="/users"
      />

      <div className="stats-grid">
        <StatCard
          icon="users"
          color="navy"
          value={stats.totalUsers}
          label="Users"
          tag={`${stats.activeUsers} active`}
          tagColor="green"
          to="/users"
        />
        <StatCard
          icon="project"
          color="teal"
          value={stats.groups}
          label="Groups"
          tag={stats.groupsWithoutSupervisor > 0 ? `${stats.groupsWithoutSupervisor} need a supervisor` : 'All assigned'}
          tagColor={stats.groupsWithoutSupervisor > 0 ? 'amber' : 'green'}
          to="/groups"
        />
        <StatCard
          icon="user"
          color="amber"
          value={stats.studentsWithoutGroup}
          label="Students Without a Group"
          tag={stats.studentsWithoutGroup > 0 ? 'Action needed' : undefined}
          tagColor="amber"
          to="/groups"
        />
        <StatCard
          icon="proposal"
          color="purple"
          value={stats.pendingProposals}
          label="Proposals in Review"
          to="/proposals"
        />
      </div>

      <div className="split">
        <div className="dash-column">
          <Card title="Platform Overview" icon="dashboard" iconColor="navy">
            <div className="dash-overview">
              <Breakdown title="Users by role" items={toBreakdownItems(stats.usersByRole)} />
              <Breakdown title="Projects by status" items={toBreakdownItems(stats.projectsByStatus)} />
              <Breakdown title="Proposals by status" items={toBreakdownItems(stats.proposalsByStatus)} />
            </div>
            <p className="field-hint mb-0">
              {plural(stats.availableSupervisors, 'supervisor')} currently accept new groups.
            </p>
          </Card>

          <Card title="Needs Attention" icon="alert" iconColor="red" flush>
            {attention.length === 0 && stats.studentsWithoutGroup === 0 ? (
              <EmptyState compact icon="check" title="Everything is set up" message="Every group has a supervisor, an examiner and a project." />
            ) : (
              <ul className="list dash-attention">
                {attention.map((group) => (
                  <li key={group.id}>
                    <span className="icon-tile tile-amber">
                      <Icon name="users" size={18} />
                    </span>
                    <span className="dash-attention-text">
                      <strong>{group.name}</strong>
                      <span className="dash-attention-issues">
                        {group.issues.map((issue) => (
                          <span key={issue} className="badge badge-amber">
                            {issue}
                          </span>
                        ))}
                      </span>
                    </span>
                    <Link to={`/groups/${group.id}`} className="btn btn-secondary btn-small">
                      Manage
                    </Link>
                  </li>
                ))}
                {stats.studentsWithoutGroup > 0 && (
                  <li>
                    <span className="icon-tile tile-amber">
                      <Icon name="user" size={18} />
                    </span>
                    <span className="dash-attention-text">
                      <strong>{plural(stats.studentsWithoutGroup, 'student')} without a group</strong>
                      <span className="meta">Add them to a group so they can start their project.</span>
                    </span>
                    <Link to="/groups" className="btn btn-secondary btn-small">
                      Groups
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card title="Recent Activity" icon="clock" iconColor="purple">
            <ActivityFeed items={recentActivity} showGroup />
          </Card>
        </div>

        <div className="dash-column">
          <Card title="Quick Links" icon="link" iconColor="teal">
            <div className="dash-quick-links">
              {QUICK_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="dash-quick-link">
                  <span className={`icon-tile tile-${link.color}`}>
                    <Icon name={link.icon} size={18} />
                  </span>
                  {link.label}
                </Link>
              ))}
            </div>
          </Card>

          <Card
            title="Academic Calendar"
            icon="calendar"
            iconColor="green"
            actions={
              <Link to="/calendar" className="dash-card-link">
                Calendar <Icon name="arrowRight" size={14} />
              </Link>
            }
            flush
          >
            <UpcomingList items={upcoming} emptyText="No academic dates coming up" />
          </Card>

          <Card
            title="Announcements"
            icon="megaphone"
            iconColor="blue"
            actions={
              <Link to="/announcements" className="dash-card-link">
                View all
              </Link>
            }
            flush
          >
            <AnnouncementList items={announcements} />
          </Card>
        </div>
      </div>
    </>
  );
}
