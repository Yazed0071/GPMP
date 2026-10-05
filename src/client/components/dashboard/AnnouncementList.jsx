// AnnouncementList: the latest announcements the user can see (FR-12), each linking to the
// Announcements page.
//
// Props:
//   items  array  announcements from GET /api/dashboard: { id, title, excerpt, date, publisherName, groupName }
import { Link } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { timeAgo } from '../../utils/format.js';

export default function AnnouncementList({ items }) {
  if (!items || items.length === 0) {
    return <EmptyState compact icon="megaphone" title="No announcements yet" />;
  }

  return (
    <ul className="dash-announcements">
      {items.map((announcement) => (
        <li key={announcement.id}>
          <Link to="/announcements" className="dash-announcement">
            <span className="icon-tile tile-blue">
              <Icon name="megaphone" size={18} />
            </span>
            <span className="dash-announcement-text">
              <strong>{announcement.title}</strong>
              <span className="dash-announcement-excerpt">{announcement.excerpt}</span>
              <span className="meta">
                <span>{announcement.publisherName || 'GPMP'}</span>
                <span>{timeAgo(announcement.date)}</span>
                {announcement.groupName && <span>{announcement.groupName}</span>}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
