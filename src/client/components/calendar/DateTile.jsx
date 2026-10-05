// DateTile: a small square that shows a date as "OCT / 3" (upcoming lists, attendance sessions).
//
// Props:
//   date   string|Date  an ISO date-time or a 'YYYY-MM-DD' date
//   color  string       teal (default), blue, green, amber, red, purple, gray
//
// The tile is decorative (aria-hidden): always write the date as text next to it too.
import { toDate } from '../../utils/format.js';
import '../../styles/calendar.css';

export default function DateTile({ date, color = 'teal' }) {
  const value = toDate(date);
  if (!value) return null;

  return (
    <span className={`cal-date-tile cal-date-tile-${color}`} aria-hidden="true">
      <span className="cal-date-tile-month">{value.toLocaleDateString('en-US', { month: 'short' })}</span>
      <span className="cal-date-tile-day">{value.getDate()}</span>
    </span>
  );
}
