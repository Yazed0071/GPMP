// MonthGrid: the month view of the calendar (FR-13). 7 columns (Sunday to Saturday), one cell per
// day with colored chips for the day's items and "+N more" when a day is busy.
// On phones the chips are replaced by small colored dots (see calendar.css).
//
// Props:
//   month         Date      first day of the month to show
//   itemsByDay    object    { 'YYYY-MM-DD': [items] } from groupItemsByDay()
//   onDayClick    function  called with the day ('YYYY-MM-DD') when a day is clicked
//   onItemClick   function  called with an item when its chip is clicked
//   onMoreClick   function  called with the day when "+N more" is clicked
//   highlightDay  string    optional day to highlight (e.g. opened from a notification link)
import EventChip from './EventChip.jsx';
import { statusColor } from '../common/StatusBadge.jsx';
import { formatLongDate, todayISO, plural } from '../../utils/format.js';
import { WEEKDAYS, monthGridDays, dayKey, itemDayKeys } from './calendarUtils.js';

const MAX_CHIPS = 3; // chips shown per day before "+N more"

export default function MonthGrid({ month, itemsByDay, onDayClick, onItemClick, onMoreClick, highlightDay }) {
  const today = todayISO();
  const days = monthGridDays(month);

  return (
    <div className="cal-grid">
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((name) => (
          <div key={name} className="cal-weekday">
            {name}
          </div>
        ))}
      </div>

      <div className="cal-days">
        {days.map((day) => {
          const key = dayKey(day);
          const items = itemsByDay[key] || [];
          const visible = items.slice(0, MAX_CHIPS);
          const hiddenCount = items.length - visible.length;

          const classes = ['cal-day'];
          if (day.getMonth() !== month.getMonth()) classes.push('cal-day-outside');
          if (key === today) classes.push('cal-day-today');
          if (key < today) classes.push('cal-day-past');
          if (key === highlightDay) classes.push('cal-day-highlight');

          return (
            // Mouse users can click anywhere in the cell; keyboard users use the day-number button
            <div key={key} className={classes.join(' ')} onClick={() => onDayClick(key)}>
              <button
                type="button"
                className="cal-day-number"
                onClick={(event) => {
                  event.stopPropagation();
                  onDayClick(key);
                }}
                aria-label={`${formatLongDate(key)}${items.length ? `, ${plural(items.length, 'item')}` : ''}`}
              >
                {day.getDate()}
              </button>

              <div className="cal-day-items">
                {visible.map((item) => (
                  <EventChip
                    key={item.id}
                    item={item}
                    onClick={onItemClick}
                    showTime={itemDayKeys(item)[0] === key}
                  />
                ))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="cal-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoreClick(key);
                    }}
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>

              {/* Phones: colored dots instead of chips */}
              {items.length > 0 && (
                <div className="cal-day-dots" aria-hidden="true">
                  {items.slice(0, 4).map((item) => (
                    <span key={item.id} className={`cal-dot cal-dot-${statusColor(item.type)}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
