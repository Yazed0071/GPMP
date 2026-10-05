// UpcomingEventsCard: the next events of the group's calendar and the academic calendar (FR-13).
//
// Props:
//   events   array   [{ id, title, type, eventDate, location, isShared }]
//   groupId  number  used for the link to the Calendar page
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { formatDateTime, toDate } from '../../utils/format.js';

// "OCT" and "14" for the small date tile
function dateParts(value) {
  const date = toDate(value);
  if (!date) return { month: '', day: '' };
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate(),
  };
}

export default function UpcomingEventsCard({ events = [], groupId }) {
  return (
    <Card
      title="Upcoming events"
      icon="calendar"
      iconColor="purple"
      flush
      actions={<Link to={`/calendar?groupId=${groupId}`}>Calendar</Link>}
    >
      {events.length === 0 ? (
        <EmptyState compact icon="calendar" title="Nothing scheduled" message="Meetings and deadlines will appear here." />
      ) : (
        <ul className="list">
          {events.map((event) => {
            const { month, day } = dateParts(event.eventDate);
            return (
              <li key={event.id}>
                <div className="proj-date-tile" aria-hidden="true">
                  <span>{month}</span>
                  <strong>{day}</strong>
                </div>
                <div className="proj-list-text">
                  <strong title={event.title}>{event.title}</strong>
                  <div className="meta">
                    <StatusBadge status={event.type} />
                    <span>{formatDateTime(event.eventDate)}</span>
                    {event.location && <span>{event.location}</span>}
                    {event.isShared && <span>Academic calendar</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
