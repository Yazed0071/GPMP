// PageHeader: the title, short description and main buttons at the top of every page.
//
// Props:
//   title      string|node  page title (required)
//   subtitle   string|node  optional description under the title
//   actions    node         optional buttons on the right (e.g. an "Add Task" button)
//   backTo     string       optional link shown above the title, e.g. "/groups"
//   backLabel  string       text of that link (default "Back")
//
// Example:
//   <PageHeader title="Tasks & Progress" subtitle="Track your team's work."
//     actions={<button className="btn btn-primary">Add Task</button>} />
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function PageHeader({ title, subtitle, actions, backTo, backLabel = 'Back' }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {backTo && (
          <Link to={backTo} className="page-header-back">
            <Icon name="arrowLeft" size={16} /> {backLabel}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
