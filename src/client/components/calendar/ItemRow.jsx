// ItemRow: one calendar item as a clickable row (time, colored bar, title, details, badges).
// Used by the agenda view and by the "items of this day" dialog.
//
// Props:
//   item     object    a calendar item from GET /api/events
//   day      string    optional day ('YYYY-MM-DD') the row is listed under; on the later days of a
//                      multi-day event the time is replaced by "Ongoing"
//   onClick  function  called with the item when the row is clicked
import StatusBadge, { statusColor } from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import { itemTimeLabel, itemDayKeys, isFinishedTask } from './calendarUtils.js';

export default function ItemRow({ item, day, onClick }) {
  const finished = isFinishedTask(item);
  const continues = Boolean(day) && itemDayKeys(item)[0] !== day;

  return (
    <button
      type="button"
      className={finished ? 'cal-item-row cal-item-row-done' : 'cal-item-row'}
      onClick={() => onClick(item)}
    >
      <span className="cal-item-time">{continues ? 'Ongoing' : itemTimeLabel(item)}</span>
      <span className={`cal-item-bar cal-dot-${statusColor(item.type)}`} aria-hidden="true" />
      <span className="cal-item-text">
        <strong>{item.title}</strong>
        <span className="meta">
          <span>{item.isShared ? 'Academic calendar' : item.groupName}</span>
          {item.location && (
            <span className="cal-item-location">
              <Icon name="mapPin" size={13} /> {item.location}
            </span>
          )}
        </span>
      </span>
      <span className="cal-item-badges">
        {item.priority === 'High' && <StatusBadge status="High">High priority</StatusBadge>}
        {item.source === 'task' ? (
          <StatusBadge status={item.isMilestone ? 'Milestone' : item.status}>
            {item.isMilestone ? 'Milestone' : item.status}
          </StatusBadge>
        ) : (
          <StatusBadge status={item.type} />
        )}
      </span>
    </button>
  );
}
