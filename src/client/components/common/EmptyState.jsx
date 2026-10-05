// EmptyState: friendly message shown when a list has nothing to show yet.
//
// Props:
//   icon     string  Icon name shown in a circle (default "folder")
//   title    string  bold heading, e.g. "No tasks yet"
//   message  string  optional explanation, e.g. "Create the first task for your team."
//   action   node    optional button or link, e.g. <button className="btn">Add Task</button>
//   compact  boolean true = less padding (for use inside small cards)
//
// Example:
//   if (tasks.length === 0) return <EmptyState icon="tasks" title="No tasks yet" />;
import Icon from './Icon.jsx';

export default function EmptyState({ icon = 'folder', title, message, action, compact = false }) {
  return (
    <div className={compact ? 'empty-state empty-state-compact' : 'empty-state'}>
      <span className="empty-state-icon">
        <Icon name={icon} size={compact ? 22 : 28} />
      </span>
      {title && <h3>{title}</h3>}
      {message && <p>{message}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
