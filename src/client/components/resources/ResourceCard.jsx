// ResourceCard: one learning resource (UI fig 45) - category icon, title, description,
// category badge, website name and an "Open" link that opens in a new tab.
//
// Props:
//   resource  object    from GET /api/resources
//   onEdit    function  called with the resource (only shown when resource.canEdit)
//   onDelete  async function(resource)
import Icon from '../common/Icon.jsx';
import StatusBadge, { statusColor } from '../common/StatusBadge.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import { categoryInfo, hostName } from './categories.js';

export default function ResourceCard({ resource, onEdit, onDelete }) {
  const { title, description, url, category, canEdit } = resource;
  const info = categoryInfo(category);

  return (
    <article className="res-card">
      <div className="res-card-top">
        <span className={`icon-tile tile-${statusColor(category)} res-tile`} aria-hidden="true">
          {info.emoji}
        </span>
        {canEdit && (
          <div className="res-card-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-small"
              onClick={() => onEdit(resource)}
              aria-label={`Edit resource: ${title}`}
              title="Edit"
            >
              <Icon name="edit" size={16} />
            </button>
            <ConfirmButton
              onConfirm={() => onDelete(resource)}
              className="btn btn-ghost btn-icon btn-small res-delete"
              ariaLabel={`Delete resource: ${title}`}
              title="Delete resource"
              message={`Delete "${title}" from the resources page?`}
            >
              <Icon name="trash" size={16} />
            </ConfirmButton>
          </div>
        )}
      </div>

      <h2 className="res-title">{title}</h2>
      <p className={description ? 'res-desc' : 'res-desc res-desc-empty'}>{description || 'No description.'}</p>

      <div className="res-footer">
        <StatusBadge status={category} />
        <span className="res-host truncate" title={url}>
          {hostName(url)}
        </span>
        <a className="res-open" href={url} target="_blank" rel="noreferrer">
          Open <Icon name="externalLink" size={14} />
          <span className="sr-only"> {title} (opens in a new tab)</span>
        </a>
      </div>
    </article>
  );
}
