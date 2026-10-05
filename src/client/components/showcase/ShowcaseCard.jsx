// ShowcaseCard: one finished project in the showcase grid (UI fig 43, FR-19).
//
// Props:
//   project  object    an item from GET /api/showcase
//   onOpen   function  called when the user wants the details (title, picture or links)
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { plural } from '../../utils/format.js';

// A picture and a color theme for the top of the card, picked from the project id
const EMOJIS = ['🎓', '🤖', '📱', '💡', '🌿', '📚', '🗺️', '🛰️'];
const THEME_COUNT = 6;

export default function ShowcaseCard({ project, onOpen }) {
  const emoji = EMOJIS[project.projectId % EMOJIS.length];
  const theme = project.projectId % THEME_COUNT;
  const description = project.showcaseDescription || project.description;

  return (
    <article className="show-card">
      {/* The picture is clickable with the mouse; keyboard users use the title button below */}
      <div className={`show-card-media show-media-${theme}`} onClick={onOpen} aria-hidden="true">
        <span className="show-card-emoji">{emoji}</span>
        {project.academicYear && <span className="show-year">{project.academicYear}</span>}
        {project.hasVideo && (
          <span className="show-play">
            <Icon name="video" size={18} />
          </span>
        )}
      </div>

      <div className="show-card-body">
        <button type="button" className="show-card-title" onClick={onOpen}>
          {project.title}
        </button>
        <p className="show-card-desc">{description || 'No description yet.'}</p>

        <div className="show-card-team">
          <div className="avatar-stack">
            {project.members.slice(0, 3).map((name, index) => (
              <Avatar key={`${name}-${index}`} name={name} size="small" />
            ))}
          </div>
          <span>
            {plural(project.members.length, 'member')}
            {project.supervisorName && ` · ${project.supervisorName}`}
          </span>
          <span className="spacer" />
          <StatusBadge status={project.status} />
        </div>

        <div className="show-card-links">
          <button type="button" className="link-button" onClick={onOpen}>
            <Icon name="info" size={15} /> Details
          </button>
          {project.documentCount > 0 && (
            <button type="button" className="link-button" onClick={onOpen}>
              <Icon name="document" size={15} /> Final report
            </button>
          )}
          {project.hasVideo && (
            <button type="button" className="link-button show-link-video" onClick={onOpen}>
              <Icon name="video" size={15} /> Demo video
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
