// ActivityFeed: "Recent Activity" - the latest feedback, submissions, document uploads and
// newly scheduled events of the user's group(s), shown as "<actor> <text> <target>".
//
// Props:
//   items      array    recentActivity from GET /api/dashboard
//   showGroup  boolean  true = also show the group name (staff follow several groups)
import { Link } from 'react-router-dom';
import EmptyState from '../common/EmptyState.jsx';
import { timeAgo, formatDateTime } from '../../utils/format.js';

// Dot color per kind of activity
const KIND_COLORS = {
  feedback: 'blue',
  submission: 'green',
  upload: 'teal',
  event: 'amber',
};

export default function ActivityFeed({ items, showGroup = false }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        compact
        icon="clock"
        title="No activity yet"
        message="Feedback, submissions, uploads and new meetings will appear here."
      />
    );
  }

  return (
    <ul className="dash-activity">
      {items.map((item) => (
        <li key={item.id} className="dash-activity-item">
          <span className={`dash-dot dash-dot-${KIND_COLORS[item.kind] || 'gray'}`} aria-hidden="true" />
          <div className="dash-activity-body">
            <p className="dash-activity-text">
              <strong>{item.actor}</strong> {item.text} <Link to={item.link}>{item.target}</Link>
              {item.eventDate && <span className="muted"> — {formatDateTime(item.eventDate)}</span>}
            </p>
            <span className="meta">
              <span>{timeAgo(item.date)}</span>
              {showGroup && item.groupName && <span>{item.groupName}</span>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
