// UpcomingList: the next events and due dates as a compact list.
// Used in the calendar sidebar and on the dashboard ("Upcoming deadlines & meetings").
//
// Props:
//   items      array     calendar items from GET /api/events (already sorted by date)
//   onSelect   function  optional; when given, clicking a row calls it with the item.
//                        Without it every row is a link to item.link (e.g. /tasks/5).
//   emptyText  string    title shown when there is nothing to list
import { Link } from 'react-router-dom';
import DateTile from './DateTile.jsx';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge, { statusColor } from '../common/StatusBadge.jsx';
import { itemTimeLabel, relativeDayLabel } from './calendarUtils.js';
import '../../styles/calendar.css';

// "Tomorrow · 10:00 AM" or "In 5 days · Due"
function whenText(item) {
  return `${relativeDayLabel(item)} · ${itemTimeLabel(item)}`;
}

export default function UpcomingList({ items, onSelect, emptyText = 'Nothing coming up' }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        compact
        icon="calendar"
        title={emptyText}
        message="New meetings and deadlines will show up here."
      />
    );
  }

  return (
    <ul className="cal-upcoming">
      {items.map((item) => {
        const content = (
          <>
            <DateTile date={item.eventDate} color={statusColor(item.type)} />
            <span className="cal-upcoming-text">
              <strong>{item.title}</strong>
              <span className="meta">
                <span>{whenText(item)}</span>
                <span>{item.isShared ? 'Academic calendar' : item.groupName}</span>
              </span>
            </span>
            <StatusBadge status={item.type} className="cal-upcoming-badge" />
          </>
        );

        return (
          <li key={item.id}>
            {onSelect ? (
              <button type="button" className="cal-upcoming-row" onClick={() => onSelect(item)}>
                {content}
              </button>
            ) : (
              <Link className="cal-upcoming-row" to={item.link}>
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
