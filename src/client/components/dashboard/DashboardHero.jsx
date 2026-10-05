// DashboardHero: the navy greeting banner at the top of the dashboard (UI fig 47):
// "Good morning, Sara 👋", one line about what comes next, and an optional big number tile
// on the right (e.g. "54% Project Complete").
//
// Props:
//   name       string  the user's full name (only the first name is shown)
//   message    node    the line under the greeting
//   tileValue  node    optional big value in the right tile, e.g. "54%"
//   tileLabel  string  small text under the value, e.g. "Project Complete"
//   tileTo     string  optional page the tile links to
import { Link } from 'react-router-dom';

// "Good morning" / "Good afternoon" / "Good evening", by the user's local time
function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// "Sara Alqahtani" -> "Sara", "Dr. Ahmed Alotaibi" -> "Dr. Ahmed"
function shortName(name = '') {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length > 1 && /^(dr|prof)\.?$/i.test(parts[0])) return `${parts[0]} ${parts[1]}`;
  return parts[0] || '';
}

export default function DashboardHero({ name, message, tileValue, tileLabel, tileTo }) {
  const hasTile = tileValue !== undefined && tileValue !== null;
  const tile = (
    <>
      <strong>{tileValue}</strong>
      <span>{tileLabel}</span>
    </>
  );

  return (
    <section className="hero dash-hero">
      <div className="dash-hero-text">
        <h1>
          {greeting()}, {shortName(name)} <span aria-hidden="true">👋</span>
        </h1>
        <p>{message}</p>
      </div>

      {hasTile &&
        (tileTo ? (
          <Link to={tileTo} className="dash-hero-tile">
            {tile}
          </Link>
        ) : (
          <div className="dash-hero-tile">{tile}</div>
        ))}
    </section>
  );
}
