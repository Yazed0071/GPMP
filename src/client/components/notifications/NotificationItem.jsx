// NotificationItem: one notification row (icon by type, title, message, time, unread dot).
// Used in the navbar bell dropdown and on the notifications page.
//
// Props:
//   notification  object    { id, type, title, message, link, isRead, createdAt }
//   onOpen        function  called with the notification when the row is clicked
//   actions       node      optional buttons on the right (e.g. "mark as read", "delete")
//   compact       boolean   smaller layout for the dropdown (message on one line)
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { timeAgo, formatDateTime } from '../../utils/format.js';
import { notificationStyle } from './notificationUtils.js';

export default function NotificationItem({ notification, onOpen, actions, compact = false }) {
  const { type, title, message, isRead, createdAt } = notification;
  const { icon, color } = notificationStyle(type);

  return (
    <li className={`notif-item ${isRead ? '' : 'notif-unread'} ${compact ? 'notif-compact' : ''}`.trim()}>
      <button type="button" className="notif-item-main" onClick={() => onOpen(notification)}>
        <span className={`icon-tile tile-${color} notif-icon`}>
          <Icon name={icon} size={compact ? 16 : 18} />
        </span>
        <span className="notif-text">
          <span className="notif-title">{title}</span>
          {message && <span className="notif-message">{message}</span>}
          <span className="notif-meta">
            {!compact && <StatusBadge status={type} />}
            <time dateTime={createdAt} title={formatDateTime(createdAt)}>
              {timeAgo(createdAt)}
            </time>
          </span>
        </span>
        {!isRead && (
          <span className="notif-dot">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </button>
      {actions && <div className="notif-actions">{actions}</div>}
    </li>
  );
}
