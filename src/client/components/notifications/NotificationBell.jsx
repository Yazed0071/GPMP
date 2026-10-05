// NotificationBell: the bell in the navbar (FR-20).
// Shows the number of unread notifications and, when clicked, a dropdown with the latest 8.
// Clicking a notification marks it as read and opens its page.
//
// Live updates (Socket.IO):
//   'notification:new'     -> count + 1, add it to the list, show a toast
//   'notification:updated' -> a collapsed chat notification changed: move it to the top
//   'notification:sync'    -> notifications were read/deleted (maybe in another tab): use the new count
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import Loading from '../common/Loading.jsx';
import EmptyState from '../common/EmptyState.jsx';
import NotificationItem from './NotificationItem.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../api/notifications.js';
import { isCurrentPage, putOnTop } from './notificationUtils.js';
import '../../styles/notifications.css';

const DROPDOWN_SIZE = 8;

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState(null); // null until the dropdown is opened once
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState(null);

  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);

  const loadCount = useCallback(() => {
    getUnreadCount()
      .then((result) => setCount(result.count))
      .catch(() => {}); // the bell simply keeps its old number
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      setItems(await getNotifications({ limit: DROPDOWN_SIZE }));
    } catch (err) {
      setListError(err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Load the number once when the navbar appears
  useEffect(() => {
    loadCount();
  }, [loadCount]);

  // ----- Live updates -----
  useSocketEvent('notification:new', (notification) => {
    setCount((value) => value + 1);
    setItems((list) => putOnTop(list, notification, DROPDOWN_SIZE));
    // No pop-up when the user is already looking at that page (e.g. the open chat)
    if (!isCurrentPage(notification.link, location)) toast.info(notification.title);
  });

  useSocketEvent('notification:updated', (notification) => {
    setItems((list) => putOnTop(list, notification, DROPDOWN_SIZE));
  });

  useSocketEvent('notification:sync', ({ unreadCount }) => {
    setCount(unreadCount);
    if (items) loadList();
  });

  // After a lost connection comes back, fetch what we may have missed
  useSocketEvent('connect', () => {
    loadCount();
    if (items) loadList();
  });

  // ----- Close on outside click or Escape -----
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open) loadList(); // always show fresh notifications when opening
    setOpen(!open);
  }

  // Click on a notification: mark it read (without waiting) and open its page
  function handleOpen(notification) {
    setOpen(false);
    if (!notification.isRead) {
      setItems((list) => list?.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
      setCount((value) => Math.max(0, value - 1));
      markNotificationRead(notification.id).catch(() => {}); // the server then syncs the real count
    }
    if (notification.link) navigate(notification.link);
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead();
      setCount(0);
      setItems((list) => list?.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(err);
    }
  }

  let body;
  if (loadingList && !items) {
    body = <Loading text="Loading notifications..." />;
  } else if (listError && !items) {
    body = (
      <div className="notif-dropdown-error">
        <p>Could not load notifications.</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={loadList}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      </div>
    );
  } else if (!items || items.length === 0) {
    body = <EmptyState compact icon="bell" title="You're all caught up" message="New notifications will appear here." />;
  } else {
    body = (
      <ul className="notif-list">
        {items.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onOpen={handleOpen} compact />
        ))}
      </ul>
    );
  }

  return (
    <div className="notif-bell" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-icon notif-bell-button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        title="Notifications"
      >
        <Icon name="bell" />
        {count > 0 && (
          <span className="notif-bell-count" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="notif-dropdown-header">
            <strong>Notifications</strong>
            {count > 0 && <span className="badge badge-teal">{count} new</span>}
            <span className="spacer" />
            <button type="button" className="link-button small" onClick={handleMarkAll} disabled={count === 0}>
              Mark all as read
            </button>
          </div>
          <div className="notif-dropdown-body">{body}</div>
          <div className="notif-dropdown-footer">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              View all notifications <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
