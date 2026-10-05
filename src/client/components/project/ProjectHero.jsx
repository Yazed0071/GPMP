// ProjectHero: the navy banner at the top of a project page (title, status, description)
// with the "% complete" tile from the UI prototype (FR-4).
//
// Props:
//   project    object  { title, description, status, academicYear }
//   groupName  string  shown as a small tag
//   progress   object  { total, completed, percent } from the task list
//   actions    node    optional buttons under the description
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import { plural } from '../../utils/format.js';

export default function ProjectHero({ project, groupName, progress, actions }) {
  const percent = progress?.percent || 0;

  return (
    <section className="hero proj-hero">
      <div className="proj-hero-main">
        <div className="proj-hero-tags">
          <StatusBadge status={project.status} dot />
          {groupName && (
            <span className="proj-hero-tag">
              <Icon name="users" size={14} /> {groupName}
            </span>
          )}
          {project.academicYear && (
            <span className="proj-hero-tag">
              <Icon name="calendar" size={14} /> {project.academicYear}
            </span>
          )}
        </div>
        <h2>{project.title}</h2>
        <p className="proj-hero-description">{project.description || 'No description yet.'}</p>
        {actions && <div className="proj-hero-actions">{actions}</div>}
      </div>

      <div className="proj-hero-progress" aria-label={`Project ${percent}% complete`}>
        <strong>{percent}%</strong>
        <span>Project complete</span>
        <div className="proj-hero-bar" aria-hidden="true">
          <div style={{ width: `${percent}%` }} />
        </div>
        <span>
          {progress?.total
            ? `${progress.completed} of ${plural(progress.total, 'task')} completed`
            : 'No tasks yet'}
        </span>
      </div>
    </section>
  );
}
