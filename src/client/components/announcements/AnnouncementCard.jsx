// AnnouncementCard: one announcement (UI fig 44) - date tile, title, audience badge, text,
// publisher with role, date and an "edited" marker. The publisher and admins see edit/delete.
//
// Props:
//   announcement  object    from GET /api/announcements
//   onEdit        function  called with the announcement
//   onDelete      async function(announcement)  deletes it (errors are shown by ConfirmButton)
import { useState } from 'react';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import { formatDate, formatDateTime, toDate } from '../../utils/format.js';
import { audienceColor, audienceLabel } from './audience.js';

// Long texts are shortened until the user clicks "Read more"
const LONG_TEXT_CHARS = 320;
const LONG_TEXT_LINES = 5;
// Announcements newer than this get a "New" badge
const NEW_FOR_MS = 3 * 24 * 60 * 60 * 1000;

export default function AnnouncementCard({ announcement, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const { title, content, publisher, editedAt, canEdit } = announcement;

  const date = toDate(announcement.date);
  const isNew = date && Date.now() - date.getTime() < NEW_FOR_MS;
  const isLong = content.length > LONG_TEXT_CHARS || content.split('\n').length > LONG_TEXT_LINES;

  return (
    <article className="ann-card">
      {date && (
        <div className="ann-date" aria-hidden="true">
          <strong>{date.getDate()}</strong>
          <span>{date.toLocaleDateString('en-US', { month: 'short' })}</span>
        </div>
      )}

      <div className="ann-body">
        <div className="ann-head">
          <h2 className="ann-title">{title}</h2>
          <div className="ann-badges">
            {isNew && <span className="badge badge-green">New</span>}
            <span className={`badge badge-${audienceColor(announcement)}`}>
              <Icon name={announcement.group ? 'users' : 'megaphone'} size={12} />
              {audienceLabel(announcement)}
            </span>
          </div>
        </div>

        <p className={`ann-content ${isLong && !expanded ? 'ann-content-clamped' : ''}`.trim()}>{content}</p>
        {isLong && (
          <button
            type="button"
            className="link-button small ann-more"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}

        <div className="ann-footer">
          <div className="ann-meta">
            {publisher ? (
              <>
                <Avatar name={publisher.name} size="small" />
                <span className="ann-publisher">{publisher.name}</span>
                <StatusBadge status={publisher.role} />
              </>
            ) : (
              <span className="ann-publisher">Former user</span>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={announcement.date} title={formatDateTime(announcement.date)}>
              {formatDate(announcement.date)}
            </time>
            {editedAt && (
              <span className="ann-edited" title={`Edited ${formatDateTime(editedAt)}`}>
                <Icon name="edit" size={12} /> Edited
              </span>
            )}
          </div>

          {canEdit && (
            <div className="ann-actions">
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-small"
                onClick={() => onEdit(announcement)}
                aria-label={`Edit announcement: ${title}`}
                title="Edit"
              >
                <Icon name="edit" size={16} />
              </button>
              <ConfirmButton
                onConfirm={() => onDelete(announcement)}
                className="btn btn-ghost btn-icon btn-small ann-delete"
                ariaLabel={`Delete announcement: ${title}`}
                title="Delete announcement"
                message={`Delete "${title}"? Everyone who could see it will no longer find it.`}
              >
                <Icon name="trash" size={16} />
              </ConfirmButton>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
