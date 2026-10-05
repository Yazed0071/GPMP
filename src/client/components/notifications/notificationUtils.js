// Small helpers shared by the notification bell and the notifications page (FR-20).
import { statusColor } from '../common/StatusBadge.jsx';

// Icon shown for each notification type (names from components/common/Icon.jsx)
const TYPE_ICONS = {
  Announcement: 'megaphone',
  Deadline: 'clock',
  Meeting: 'calendar',
  Message: 'chat',
  Feedback: 'star',
  Task: 'tasks',
  Proposal: 'proposal',
  System: 'info',
};

// { icon, color } for a notification type, e.g. Message -> chat icon on a teal tile
export function notificationStyle(type) {
  return { icon: TYPE_ICONS[type] || 'bell', color: statusColor(type) };
}

/**
 * True when a notification's link points to the page the user is looking at right now,
 * e.g. link "/chat?groupId=1&channel=Group" while that chat is open. Used to skip the toast.
 * `location` is the object from react-router's useLocation().
 */
export function isCurrentPage(link, location) {
  if (!link) return false;
  let target;
  try {
    target = new URL(link, window.location.origin);
  } catch {
    return false; // not a valid link
  }
  if (target.pathname !== location.pathname) return false;

  const current = new URLSearchParams(location.search);
  for (const [key, value] of target.searchParams) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

// Puts a new or updated notification at the top of a list (without duplicates)
export function putOnTop(list, notification, maxLength = Infinity) {
  if (!list) return list;
  return [notification, ...list.filter((item) => item.id !== notification.id)].slice(0, maxLength);
}
