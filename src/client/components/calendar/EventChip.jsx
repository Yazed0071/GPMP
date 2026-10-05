// EventChip: a small colored label for one calendar item inside a day cell of the month grid.
// The color shows the type (Deadline red, Meeting blue, Presentation purple, Academic green, Task amber).
//
// Props:
//   item      object    a calendar item from GET /api/events
//   onClick   function  called with the item when the chip is clicked
//   showTime  boolean   show the start time before the title (false on the later days of a long event)
import { statusColor } from '../common/StatusBadge.jsx';
import { isFinishedTask, shortTime } from './calendarUtils.js';

export default function EventChip({ item, onClick, showTime = true }) {
  const classes = ['cal-chip', `cal-chip-${statusColor(item.type)}`];
  if (isFinishedTask(item)) classes.push('cal-chip-done');

  function handleClick(event) {
    event.stopPropagation(); // do not also trigger the click on the day cell
    onClick(item);
  }

  return (
    <button type="button" className={classes.join(' ')} onClick={handleClick} title={`${item.title} (${item.type})`}>
      {showTime && !item.allDay && <span className="cal-chip-time">{shortTime(item.eventDate)}</span>}
      <span className="cal-chip-title">{item.title}</span>
    </button>
  );
}
