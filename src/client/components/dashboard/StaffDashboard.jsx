// StaffDashboard: the dashboard of a supervisor or an examiner.
// Greeting with what needs attention, four stat cards, the progress of every assigned group,
// upcoming deadlines & meetings, recent activity in the groups and the latest announcements.
//
// Props:
//   data  object  the Supervisor or Examiner dashboard from GET /api/dashboard
//   user  object  the logged-in user
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import StatCard from '../common/StatCard.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Icon from '../common/Icon.jsx';
import UpcomingList from '../calendar/UpcomingList.jsx';
import DashboardHero from './DashboardHero.jsx';
import ProgressList from './ProgressList.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import AnnouncementList from './AnnouncementList.jsx';
import { plural } from '../../utils/format.js';

// ["2 submissions", "1 proposal"] -> "2 submissions and 1 proposal"
function joinWithAnd(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// The line under the greeting: what is waiting for this person
function heroMessage(isSupervisor, stats) {
  const parts = [];
  if (isSupervisor) {
    if (stats.submissionsToReview > 0) parts.push(`${plural(stats.submissionsToReview, 'submission')} to review`);
    if (stats.pendingProposals > 0) parts.push(`${plural(stats.pendingProposals, 'proposal')} waiting for your decision`);
    if (stats.upcomingMeetings > 0) parts.push(`${plural(stats.upcomingMeetings, 'meeting')} this week`);
  } else {
    if (stats.pendingProposals > 0) parts.push(`${plural(stats.pendingProposals, 'proposal')} waiting for your review`);
    if (stats.upcomingPresentations > 0) parts.push(plural(stats.upcomingPresentations, 'upcoming presentation'));
  }
  return parts.length > 0 ? `You have ${joinWithAnd(parts)}.` : 'Everything is up to date. Have a great day!';
}

// One progress row per group
function groupRows(groups) {
  return groups.map((group) => {
    const details = [group.projectTitle || 'No project yet', plural(group.memberCount, 'student')];
    if (group.pendingSubmissions > 0) details.push(`${group.pendingSubmissions} to review`);
    if (group.overdueTasks > 0) details.push(`${group.overdueTasks} overdue`);
    return {
      key: group.id,
      icon: 'users',
      color: group.overdueTasks > 0 ? 'amber' : 'teal',
      title: group.name,
      meta: details.join(' · '),
      progress: group.progress,
      status: group.projectStatus,
      to: `/groups/${group.id}`,
    };
  });
}

export default function StaffDashboard({ data, user }) {
  const isSupervisor = data.role === 'Supervisor';
  const { groups, stats, upcoming, recentActivity, announcements } = data;

  return (
    <>
      <DashboardHero
        name={user.name}
        message={heroMessage(isSupervisor, stats)}
        tileValue={stats.groups}
        tileLabel={isSupervisor ? 'Groups supervised' : 'Groups examined'}
        tileTo="/groups"
      />

      <div className="stats-grid">
        <StatCard icon="users" color="teal" value={stats.groups} label="My Groups" to="/groups" />
        <StatCard
          icon="proposal"
          color="purple"
          value={stats.pendingProposals}
          label="Proposals to Review"
          tag={stats.pendingProposals > 0 ? 'Action needed' : undefined}
          tagColor="purple"
          to="/proposals"
        />
        {isSupervisor ? (
          <>
            <StatCard
              icon="upload"
              color="amber"
              value={stats.submissionsToReview}
              label="Submissions to Review"
              tag={stats.submissionsToReview > 0 ? 'Waiting' : undefined}
              tagColor="amber"
              to="/tasks"
            />
            <StatCard
              icon="calendar"
              color="blue"
              value={stats.upcomingMeetings}
              label="Meetings This Week"
              to="/calendar"
            />
          </>
        ) : (
          <>
            <StatCard
              icon="flag"
              color="blue"
              value={stats.upcomingPresentations}
              label="Upcoming Presentations"
              to="/calendar"
            />
            <StatCard
              icon="bell"
              color="amber"
              value={stats.unreadNotifications}
              label="Unread Notifications"
              tag={stats.unreadNotifications > 0 ? 'New' : undefined}
              tagColor="teal"
              to="/notifications"
            />
          </>
        )}
      </div>

      <div className="split">
        <div className="dash-column">
          <Card
            title="Group Progress"
            icon="trendingUp"
            actions={
              <Link to="/groups" className="dash-card-link">
                All groups <Icon name="arrowRight" size={14} />
              </Link>
            }
            flush
          >
            {groups.length === 0 ? (
              <EmptyState
                compact
                icon="users"
                title="No groups assigned yet"
                message={
                  isSupervisor
                    ? 'Groups appear here when students choose you as their supervisor.'
                    : 'Groups appear here when the administrator assigns you as their examiner.'
                }
              />
            ) : (
              <ProgressList items={groupRows(groups)} />
            )}
          </Card>

          <Card
            title="Upcoming Deadlines & Meetings"
            icon="calendar"
            iconColor="amber"
            actions={
              <Link to="/calendar" className="dash-card-link">
                Calendar <Icon name="arrowRight" size={14} />
              </Link>
            }
            flush
          >
            <UpcomingList items={upcoming} emptyText="Nothing coming up" />
          </Card>
        </div>

        <div className="dash-column">
          <Card title="Recent Activity" icon="clock" iconColor="purple">
            <ActivityFeed items={recentActivity} showGroup />
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
