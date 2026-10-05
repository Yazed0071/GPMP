// AgendaList: the list view of the calendar - every item of the month, grouped by day.
//
// Props:
//   month        Date      first day of the month to show
//   itemsByDay   object    { 'YYYY-MM-DD': [items] } from groupItemsByDay()
//   onItemClick  function  called with an item when it is clicked
import EmptyState from '../common/EmptyState.jsx';
import ItemRow from './ItemRow.jsx';
import { formatLongDate, todayISO } from '../../utils/format.js';
import { dayKey } from './calendarUtils.js';

export default function AgendaList({ month, itemsByDay, onItemClick }) {
  const monthPrefix = dayKey(month).slice(0, 7); // e.g. "2026-10"
  const today = todayISO();
  const days = Object.keys(itemsByDay)
    .filter((key) => key.startsWith(monthPrefix))
    .sort();

  if (days.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing planned this month"
        message="Meetings, deadlines and academic dates for this month will appear here."
      />
    );
  }

  return (
    <div className="cal-agenda">
      {days.map((key) => (
        <section key={key} className="cal-agenda-day">
          <h3 className={key === today ? 'cal-agenda-date cal-agenda-today' : 'cal-agenda-date'}>
            {formatLongDate(key)}
            {key === today && <span className="badge badge-teal">Today</span>}
          </h3>
          <ul className="cal-agenda-items">
            {itemsByDay[key].map((item) => (
              <li key={item.id}>
                <ItemRow item={item} day={key} onClick={onItemClick} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
