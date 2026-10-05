// CalendarCountdown: "Next deadline in N days" (the CalendarCountdown component of the report).
// Shows the nearest open deadline (an unfinished task or a 'Deadline' event); when there is
// none, the nearest event of any kind.
//
// Props:
//   items   array     upcoming calendar items, sorted by date (from now on)
//   onOpen  function  optional; called with the item when "View details" is clicked
import Icon from '../common/Icon.jsx';
import { daysUntil, formatDate, formatDateTime } from '../../utils/format.js';
import { isOpenDeadline } from './calendarUtils.js';

export default function CalendarCountdown({ items, onOpen }) {
  const deadline = items.find(isOpenDeadline);
  const next = deadline || items[0];

  if (!next) {
    return (
      <div className="cal-countdown cal-countdown-calm">
        <span className="cal-countdown-label">
          <Icon name="clock" size={16} /> Countdown
        </span>
        <p className="cal-countdown-title">No upcoming deadlines.</p>
        <p className="cal-countdown-meta">New deadlines and meetings will be counted down here.</p>
      </div>
    );
  }

  const days = Math.max(0, daysUntil(next.eventDate) ?? 0);
  // Red when it is very close, amber within a week, teal otherwise
  const urgency = days <= 2 ? 'urgent' : days <= 7 ? 'soon' : 'calm';

  return (
    <div className={`cal-countdown cal-countdown-${urgency}`}>
      <span className="cal-countdown-label">
        <Icon name="clock" size={16} /> {deadline ? 'Next deadline' : 'Next event'}
      </span>
      <div className="cal-countdown-number">
        {days === 0 ? 'Today' : days}
        {days > 0 && <span>{days === 1 ? 'day left' : 'days left'}</span>}
      </div>
      <p className="cal-countdown-title">{next.title}</p>
      <p className="cal-countdown-meta">
        {next.allDay ? `Due ${formatDate(next.eventDate)}` : formatDateTime(next.eventDate)}
        {next.groupName ? ` · ${next.groupName}` : ''}
      </p>
      {onOpen && (
        <button type="button" className="btn btn-small cal-countdown-button" onClick={() => onOpen(next)}>
          View details <Icon name="arrowRight" size={14} />
        </button>
      )}
    </div>
  );
}
