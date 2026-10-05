// NotificationsPage: every notification of the logged-in user (FR-20) with All / Unread tabs.
// Users can open a notification (marks it read), mark one or all as read, and delete them.
// The list updates live when new notifications arrive.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ConfirmButton from '../components/common/ConfirmButton.jsx';
import Icon from '../components/common/Icon.jsx';
import NotificationItem from '../components/notifications/NotificationItem.jsx';
import { putOnTop } from '../components/notifications/notificationUtils.js';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../api/notifications.js';
import '../styles/notifications.css';

// How many notifications the page shows (the newest ones)
const PAGE_LIMIT = 100;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [markingAll, setMarkingAll] = useState(false);

  const { data, loading, error, reload, setData } = useApi(() => getNotifications({ limit: PAGE_LIMIT }), []);
  const notifications = data || [];
  const unread = notifications.filter((n) => !n.isRead);
  const shown = tab === 'unread' ? unread : notifications;

  // ----- Live updates -----
  useSocketEvent('notification:new', (notification) => setData((list) => putOnTop(list, notification)));
  useSocketEvent('notification:updated', (notification) => setData((list) => putOnTop(list, notification)));
  useSocketEvent('notification:sync', () => reload());
  useSocketEvent('connect', () => reload());

  // Marks one notification as read in the list shown on screen
  function showAsRead(id) {
    setData((list) => list?.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  async function handleMarkRead(notification) {
    try {
      await markNotificationRead(notification.id);
      showAsRead(notification.id);
    } catch (err) {
      toast.error(err);
    }
  }

  // Click on a notification: mark it read and go to its page
  function handleOpen(notification) {
    if (!notification.isRead) {
      showAsRead(notification.id);
      markNotificationRead(notification.id).catch(() => {});
    }
    if (notification.link) navigate(notification.link);
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setData((list) => list?.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(err);
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleDelete(notification) {
    await deleteNotification(notification.id); // ConfirmButton shows an error toast if this fails
    setData((list) => list?.filter((n) => n.id !== notification.id));
    toast.success('Notification deleted');
  }

  let content;
  if (loading) {
    content = <Loading text="Loading notifications..." />;
  } else if (error) {
    content = <ErrorMessage error={error} onRetry={reload} />;
  } else if (shown.length === 0) {
    content =
      tab === 'unread' ? (
        <EmptyState icon="check" title="You're all caught up" message="You have no unread notifications." />
      ) : (
        <EmptyState
          icon="bell"
          title="No notifications yet"
          message="You will be notified about announcements, deadlines, meetings, messages and feedback."
        />
      );
  } else {
    content = (
      <Card flush>
        <ul className="notif-list notif-page-list">
          {shown.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onOpen={handleOpen}
              actions={
                <>
                  {!notification.isRead && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-small"
                      onClick={() => handleMarkRead(notification)}
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      <Icon name="check" size={16} />
                    </button>
                  )}
                  <ConfirmButton
                    onConfirm={() => handleDelete(notification)}
                    className="btn btn-ghost btn-icon btn-small notif-delete"
                    ariaLabel="Delete notification"
                    title="Delete notification"
                    message="Delete this notification? This cannot be undone."
                  >
                    <Icon name="trash" size={16} />
                  </ConfirmButton>
                </>
              }
            />
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Announcements, deadlines, meetings, messages and feedback updates in one place."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleMarkAll}
            disabled={markingAll || unread.length === 0}
          >
            <Icon name="check" size={18} /> {markingAll ? 'Marking...' : 'Mark all as read'}
          </button>
        }
      />

      <div className="notif-toolbar">
        <Tabs
          ariaLabel="Filter notifications"
          tabs={[
            { value: 'all', label: 'All', count: notifications.length },
            { value: 'unread', label: 'Unread', count: unread.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        {notifications.length >= PAGE_LIMIT && (
          <span className="muted small">Showing your latest {PAGE_LIMIT} notifications.</span>
        )}
      </div>

      {content}
    </>
  );
}
