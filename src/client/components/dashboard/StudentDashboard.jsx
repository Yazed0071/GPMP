// StudentDashboard: the dashboard of a student (UI fig 47).
// Greeting with the next deadline and a big progress tile, four stat cards, the project progress
// with its milestones, upcoming deadlines & meetings, recent activity and the latest announcements.
// A student without a group sees a friendly explanation plus the academic calendar.
//
// Props:
//   data  object  the Student dashboard from GET /api/dashboard
//   user  object  the logged-in user
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import StatCard from '../common/StatCard.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Icon from '../common/Icon.jsx';
import { statusColor } from '../common/StatusBadge.jsx';
import UpcomingList from '../calendar/UpcomingList.jsx';
import DashboardHero from './DashboardHero.jsx';
import ProgressList from './ProgressList.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import AnnouncementList from './AnnouncementList.jsx';
import { formatDate, isOverdue, plural } from '../../utils/format.js';

// 0 -> "today", 1 -> "tomorrow", 5 -> "in 5 days"
function whenPhrase(daysLeft) {
  if (daysLeft <= 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  return `in ${daysLeft} days`;
}

// The line under the greeting
function heroMessage({ group, project, stats, nextDeadline }) {
  if (!group) return 'You are not in a group yet. The administrator will add you to one soon.';
  if (!project) {
    return group.supervisorName
      ? 'Your group has no project yet. Create it on the My Project page to get started.'
      : 'Choose a supervisor and create your project to get started.';
  }
  const deadline = nextDeadline
    ? `${nextDeadline.title} is due ${whenPhrase(nextDeadline.daysLeft)}.`
    : 'No deadlines coming up.';
  const pace =
    stats.overdueTasks > 0
      ? ` You have ${plural(stats.overdueTasks, 'overdue task')} — let's catch up.`
      : ' You are on track — keep going.';
  return deadline + pace;
}

// The project row and one row per milestone for the "Project Progress" card
function progressRows({ group, project, progress, proposalStatus, milestones }) {
  const details = [
    group.supervisorName || 'No supervisor yet',
    plural(group.memberCount, 'student'),
    proposalStatus && `Proposal ${proposalStatus.toLowerCase()}`,
  ].filter(Boolean);

  const projectRow = {
    key: 'project',
    icon: 'project',
    color: 'teal',
    title: project ? project.title : 'No project yet',
    meta: details.join(' · '),
    progress: progress.percent,
    status: project?.status,
    to: '/project',
  };

  const milestoneRows = milestones.map((milestone) => {
    const done = milestone.status === 'Completed';
    const late = !done && isOverdue(milestone.dueDate);
    return {
      key: `milestone-${milestone.id}`,
      icon: done ? 'check' : 'flag',
      color: done ? 'green' : late ? 'red' : 'purple',
      title: milestone.title,
      meta: `Due ${formatDate(milestone.dueDate)} · ${done ? 'Done' : `${milestone.progress}% complete`}`,
      progress: milestone.progress,
      status: late ? 'Overdue' : milestone.status,
      to: milestone.link,
    };
  });

  return [projectRow, ...milestoneRows];
}

export default function StudentDashboard({ data, user }) {
  const { group, project, progress, stats, nextDeadline, upcoming, recentActivity, announcements } = data;

  return (
    <>
      <DashboardHero
        name={user.name}
        message={heroMessage(data)}
        tileValue={group ? `${progress.percent}%` : null}
        tileLabel="Project Complete"
        tileTo="/tasks"
      />

      {!group && (
        <Card>
          <EmptyState
            icon="users"
            title="You are not in a group yet"
            message="Students are placed in groups by the administrator. Meanwhile you can follow the academic calendar, announcements and learning resources."
            action={
              <div className="actions">
                <Link className="btn btn-primary" to="/calendar">
                  <Icon name="calendar" size={18} /> Academic calendar
                </Link>
                <Link className="btn btn-secondary" to="/resources">
                  <Icon name="book" size={18} /> Resources
                </Link>
              </div>
            }
          />
        </Card>
      )}

      <div className="stats-grid">
        <StatCard
          icon="project"
          color="blue"
          value={project ? 1 : 0}
          label="Active Project"
          tag={project?.status}
          tagColor={statusColor(project?.status)}
          to="/project"
        />
        <StatCard
          icon="check"
          color="green"
          value={stats.tasksCompleted}
          label="Tasks Completed"
          tag={stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : group ? 'On track' : undefined}
          tagColor={stats.overdueTasks > 0 ? 'red' : 'green'}
          to="/tasks"
        />
        <StatCard
          icon="clock"
          color="amber"
          value={stats.pendingDeadlines}
          label="Pending Deadlines"
          tag={nextDeadline ? (nextDeadline.daysLeft <= 0 ? 'Today' : plural(nextDeadline.daysLeft, 'day')) : undefined}
          tagColor="amber"
          to="/calendar"
        />
        <StatCard
          icon="chat"
          color="purple"
          value={stats.unreadMessages}
          label="Unread Messages"
          tag={stats.unreadMessages > 0 ? 'New' : undefined}
          tagColor="teal"
          to={group ? '/chat' : '/notifications'}
        />
      </div>

      <div className="split">
        <div className="dash-column">
          {group && (
            <Card
              title="Project Progress"
              icon="trendingUp"
              actions={
                <Link to="/tasks" className="dash-card-link">
                  View Tasks <Icon name="arrowRight" size={14} />
                </Link>
              }
              flush
            >
              <ProgressList items={progressRows(data)} />
            </Card>
          )}

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
            <ActivityFeed items={recentActivity} />
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
