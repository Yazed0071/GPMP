// SessionList: the meetings and presentations of a group with their attendance counts (FR-15).
// Sessions that have started are listed first; upcoming ones cannot be recorded yet.
//
// Props:
//   sessions  array     from GET /api/attendance/sessions?groupId=
//   groupId   number    the selected group (for the "Open calendar" link)
//   onOpen    function  called with a session when "Take attendance" / "Edit" / "View" is clicked
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge, { statusColor } from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import DateTile from '../calendar/DateTile.jsx';
import AttendanceCounts from './AttendanceCounts.jsx';
import { formatDateTime } from '../../utils/format.js';

// The button text for one session
function actionLabel(session) {
  const recorded = session.studentCount - session.counts.notRecorded;
  if (!session.canRecord) return 'View';
  return recorded > 0 ? 'Edit attendance' : 'Take attendance';
}

function SessionRows({ sessions, onOpen }) {
  return (
    <ul className="att-sessions">
      {sessions.map((session) => (
        <li key={session.id} className="att-session">
          <DateTile date={session.eventDate} color={statusColor(session.type)} />
          <div className="att-session-text">
            <strong>{session.title}</strong>
            <span className="meta">
              <span>{formatDateTime(session.eventDate)}</span>
              {session.location && <span>{session.location}</span>}
            </span>
            {session.hasStarted && <AttendanceCounts counts={session.counts} />}
          </div>
          <StatusBadge status={session.type} className="att-session-type" />
          {session.hasStarted ? (
            <button
              type="button"
              className={session.counts.notRecorded > 0 && session.canRecord ? 'btn btn-primary btn-small' : 'btn btn-secondary btn-small'}
              onClick={() => onOpen(session)}
            >
              {actionLabel(session)}
            </button>
          ) : (
            <span className="badge badge-gray">Not started</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function SessionList({ sessions, groupId, onOpen }) {
  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="attendance"
          title="No meetings yet"
          message="Meetings and presentations on the group calendar appear here, ready for attendance."
          action={
            <Link className="btn btn-primary" to={`/calendar?groupId=${groupId}`}>
              <Icon name="calendar" size={18} /> Open calendar
            </Link>
          }
        />
      </Card>
    );
  }

  const started = sessions.filter((s) => s.hasStarted);
  const upcoming = sessions.filter((s) => !s.hasStarted);

  return (
    <div className="att-column">
      <Card title="Past & current sessions" subtitle="Newest first" icon="attendance" flush>
        {started.length === 0 ? (
          <EmptyState compact icon="clock" title="No session has started yet" />
        ) : (
          <SessionRows sessions={started} onOpen={onOpen} />
        )}
      </Card>
      {upcoming.length > 0 && (
        <Card title="Upcoming sessions" subtitle="Attendance opens when they start" icon="calendar" iconColor="blue" flush>
          <SessionRows sessions={upcoming} onOpen={onOpen} />
        </Card>
      )}
    </div>
  );
}
