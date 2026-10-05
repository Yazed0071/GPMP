// AnnouncementsPage: important updates from supervisors and the administration (FR-12, UC7, UI fig 44).
// Everyone sees the announcements meant for them, can search them and filter by audience.
// Supervisors and administrators publish new ones (everyone in the audience is notified and
// emailed - UC8); the publisher or an administrator can edit or delete them.
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import AnnouncementCard from '../components/announcements/AnnouncementCard.jsx';
import AnnouncementFormModal from '../components/announcements/AnnouncementFormModal.jsx';
import { audienceLabel, sortAudiences } from '../components/announcements/audience.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { canPostAnnouncements } from '../config/roles.js';
import { getAnnouncements, deleteAnnouncement } from '../api/announcements.js';
import '../styles/announcements.css';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canPost = canPostAnnouncements(user.role);

  const { data, loading, error, reload, setData } = useApi(() => getAnnouncements(), []);
  const [search, setSearch] = useState('');
  const [audience, setAudience] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // the announcement being edited, null = new

  const announcements = data || [];

  // A new announcement for this user arrived live: refresh the list quietly
  useSocketEvent('notification:new', (notification) => {
    if (notification.type === 'Announcement') reload();
  });

  // ----- Filtering (on this page, the list is small) -----
  const audiences = sortAudiences([...new Set(announcements.map(audienceLabel))]);
  const text = search.trim().toLowerCase();
  const shown = announcements.filter((a) => {
    if (audience !== 'all' && audienceLabel(a) !== audience) return false;
    if (!text) return true;
    return [a.title, a.content, a.publisher?.name].some((value) => value?.toLowerCase().includes(text));
  });

  function clearFilters() {
    setSearch('');
    setAudience('all');
  }

  // ----- Actions -----
  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(announcement) {
    setEditing(announcement);
    setFormOpen(true);
  }

  function handleSaved(saved, isNew) {
    setFormOpen(false);
    setData((list) => (isNew ? [saved, ...(list || [])] : list?.map((a) => (a.id === saved.id ? saved : a))));
    toast.success(isNew ? 'Announcement published. Everyone in the audience has been notified.' : 'Announcement updated');
  }

  async function handleDelete(announcement) {
    await deleteAnnouncement(announcement.id);
    setData((list) => list?.filter((a) => a.id !== announcement.id));
    toast.success('Announcement deleted');
  }

  // ----- Render -----
  let content;
  if (loading) {
    content = <Loading text="Loading announcements..." />;
  } else if (error) {
    content = <ErrorMessage error={error} onRetry={reload} />;
  } else if (announcements.length === 0) {
    content = (
      <EmptyState
        icon="megaphone"
        title="No announcements yet"
        message={canPost ? 'Share the first update with your students.' : 'New announcements will appear here.'}
        action={
          canPost && (
            <button type="button" className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={18} /> New announcement
            </button>
          )
        }
      />
    );
  } else if (shown.length === 0) {
    content = (
      <EmptyState
        icon="search"
        title="No announcements match your search"
        message="Try another word or show all announcements."
        action={
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        }
      />
    );
  } else {
    content = (
      <div className="ann-list">
        {shown.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Important updates, deadlines and notices from supervisors and the administration."
        actions={
          canPost && (
            <button type="button" className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={18} /> New announcement
            </button>
          )
        }
      />

      {announcements.length > 0 && (
        <div className="ann-toolbar">
          <div className="ann-filters" role="group" aria-label="Filter by audience">
            {['all', ...audiences].map((value) => {
              const count =
                value === 'all' ? announcements.length : announcements.filter((a) => audienceLabel(a) === value).length;
              return (
                <button
                  key={value}
                  type="button"
                  className={audience === value ? 'ann-chip ann-chip-active' : 'ann-chip'}
                  onClick={() => setAudience(value)}
                  aria-pressed={audience === value}
                >
                  {value === 'all' ? 'All' : value}
                  <span className="ann-chip-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="ann-search">
            <label htmlFor="ann-search" className="sr-only">
              Search announcements
            </label>
            <div className="input-with-icon">
              <Icon name="search" size={16} />
              <input
                id="ann-search"
                type="search"
                placeholder="Search announcements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {content}

      {canPost && (
        <AnnouncementFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          announcement={editing}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
