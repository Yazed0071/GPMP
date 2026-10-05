// MyAttendance: a student's own attendance (FR-15): the attendance rate, the counts per status,
// the next meeting and every past meeting / presentation of their group with their status.
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import StatCard from '../common/StatCard.jsx';
import ProgressRing from '../common/ProgressRing.jsx';
import Loading from '../common/Loading.jsx';
import ErrorMessage from '../common/ErrorMessage.jsx';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge, { statusColor } from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import DateTile from '../calendar/DateTile.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getMyAttendance } from '../../api/attendance.js';
import { formatDateTime } from '../../utils/format.js';

export default function MyAttendance() {
  const { data, loading, error, reload } = useApi(getMyAttendance, []);

  if (loading) return <Loading text="Loading your attendance..." />;
  if (error) return <ErrorMessage error={error} onRetry={reload} title="Could not load your attendance" />;

  if (!data.group) {
    return (
      <Card>
        <EmptyState
          icon="users"
          title="You are not in a group yet"
          message="Your attendance at group meetings and presentations will appear here once you join a group."
        />
      </Card>
    );
  }

  const { counts, rate, records, nextSession } = data;

  return (
    <>
      <div className="att-me-overview">
        <Card className="att-rate-card">
          {rate === null ? (
            <div className="att-rate-empty">
              <strong>—</strong>
              <span>No attendance recorded yet</span>
            </div>
          ) : (
            <ProgressRing value={rate} label="Attendance rate" />
          )}
          <p className="att-note text-center mb-0">Present and late count as attended; excused sessions are not counted.</p>
        </Card>

        <div className="stats-grid att-me-stats">
          <StatCard icon="check" color="green" value={counts.present} label="Present" />
          <StatCard icon="clock" color="amber" value={counts.late} label="Late" />
          <StatCard icon="x" color="red" value={counts.absent} label="Absent" />
          <StatCard icon="info" color="blue" value={counts.excused} label="Excused" />
        </div>
      </div>

      {nextSession && (
        <div className="alert alert-info mb-2">
          <Icon name="calendar" size={18} />
          <span>
            Next {nextSession.type.toLowerCase()}: <strong>{nextSession.title}</strong> on{' '}
            {formatDateTime(nextSession.eventDate)}
            {nextSession.location ? ` · ${nextSession.location}` : ''}.{' '}
            <Link to={`/calendar?groupId=${data.group.id}`}>Open calendar</Link>
          </span>
        </div>
      )}

      <Card title="My attendance records" subtitle={data.group.name} icon="attendance" flush>
        {records.length === 0 ? (
          <EmptyState compact icon="attendance" title="No meetings have taken place yet" />
        ) : (
          <ul className="att-sessions">
            {records.map((record) => (
              <li key={record.eventId} className="att-session">
                <DateTile date={record.eventDate} color={statusColor(record.type)} />
                <div className="att-session-text">
                  <strong>{record.title}</strong>
                  <span className="meta">
                    <span>{formatDateTime(record.eventDate)}</span>
                    {record.location && <span>{record.location}</span>}
                    <span>{record.type}</span>
                  </span>
                </div>
                {record.status ? (
                  <StatusBadge status={record.status} dot />
                ) : (
                  <span className="badge badge-gray">Not recorded</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
