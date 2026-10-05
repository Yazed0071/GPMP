// StatCard: a small card with an icon tile, a big number and a label
// (like "8 Tasks Completed" on the prototype dashboard).
//
// Props:
//   icon      string         Icon name for the tile (e.g. "tasks")
//   color     string         tile color: teal (default), blue, green, amber, red, purple, navy
//   value     string|number  the big number or short text (required)
//   label     string         text under the value (required)
//   tag       string|node    optional small pill in the top-right corner (e.g. "On track")
//   tagColor  string         badge color of the tag: green (default), blue, amber, red, gray, ...
//   to        string         optional link; the whole card becomes clickable
//
// Example: <StatCard icon="tasks" color="green" value={8} label="Tasks Completed" tag="On track" />
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function StatCard({ icon, color = 'teal', value, label, tag, tagColor = 'green', to }) {
  const content = (
    <>
      <div className="stat-card-top">
        {icon && (
          <span className={`icon-tile tile-${color}`}>
            <Icon name={icon} size={20} />
          </span>
        )}
        {tag && <span className={`badge badge-${tagColor}`}>{tag}</span>}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="stat-card stat-card-link">
        {content}
      </Link>
    );
  }
  return <div className="stat-card">{content}</div>;
}
