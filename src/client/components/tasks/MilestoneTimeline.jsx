// MilestoneTimeline: the group's milestones as a vertical timeline (FR-14).
// Completed milestones get a green check, the next open one is highlighted,
// and overdue ones are shown in red.
//
// Props:
//   milestones  array  [{ id, title, dueDate, status, isOverdue }] from GET /api/tasks/progress
import { Link } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { formatDate } from '../../utils/format.js';

export default function MilestoneTimeline({ milestones }) {
  if (milestones.length === 0) {
    return (
      <EmptyState
        compact
        icon="flag"
        title="No milestones yet"
        message="Tick “This is a milestone” when adding a task to mark a key moment."
      />
    );
  }

  // The first milestone that is not completed yet is the "next" one
  const nextId = milestones.find((milestone) => milestone.status !== 'Completed')?.id;

  return (
    <ol className="task-timeline">
      {milestones.map((milestone) => {
        const done = milestone.status === 'Completed';
        let dotClass = 'task-timeline-dot';
        if (done) dotClass += ' task-timeline-dot-done';
        else if (milestone.isOverdue) dotClass += ' task-timeline-dot-overdue';
        else if (milestone.id === nextId) dotClass += ' task-timeline-dot-next';

        return (
          <li key={milestone.id}>
            <span className={dotClass} aria-hidden="true">
              <Icon name={done ? 'check' : 'flag'} size={14} />
            </span>
            <div className="task-timeline-body">
              <Link to={`/tasks/${milestone.id}`} className="task-timeline-title">
                {milestone.title}
              </Link>
              <div className="meta">
                <span>{milestone.dueDate ? formatDate(milestone.dueDate) : 'No due date'}</span>
                <StatusBadge status={milestone.isOverdue ? 'Overdue' : milestone.status} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
