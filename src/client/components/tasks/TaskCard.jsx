// TaskCard: one task on the board (title, milestone tag, assignee and due date).
// The whole card is a link to the task's detail page.
//
// Props:
//   task  object  a task from GET /api/tasks
import { Link } from 'react-router-dom';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { shortDate } from './taskHelpers.js';

export default function TaskCard({ task }) {
  const classes = ['task-card'];
  if (task.isOverdue) classes.push('task-card-overdue');
  if (task.status === 'Completed') classes.push('task-card-done');

  const needsRevision = task.latestSubmissionStatus === 'Needs Revision' && task.status !== 'Completed';

  return (
    <Link to={`/tasks/${task.id}`} className={classes.join(' ')}>
      {(task.isMilestone || needsRevision || task.isOverdue) && (
        <div className="task-card-badges">
          {task.isMilestone && (
            <StatusBadge status="Milestone">
              <Icon name="flag" size={12} /> Milestone
            </StatusBadge>
          )}
          {task.isOverdue && <StatusBadge status="Overdue" />}
          {needsRevision && <StatusBadge status="Needs Revision" />}
        </div>
      )}

      <p className="task-card-title">
        {task.status === 'Completed' && <Icon name="check" size={16} className="task-card-check" />}
        {task.title}
      </p>

      <div className="task-card-footer">
        {task.assignedTo ? (
          <span className="task-card-assignee">
            <Avatar name={task.assignedTo.name} size="small" />
            <span className="sr-only">Assigned to {task.assignedTo.name}</span>
          </span>
        ) : (
          <span className="task-card-unassigned">Team task</span>
        )}

        <span className="task-card-info">
          {task.submissionCount > 0 && (
            <span title={`${task.submissionCount} submission(s)`}>
              <Icon name="paperclip" size={14} /> {task.submissionCount}
            </span>
          )}
          {task.dueDate && (
            <span className={task.isOverdue ? 'task-due task-due-overdue' : 'task-due'}>
              <Icon name="clock" size={14} /> {task.isOverdue ? 'Due ' : ''}
              {shortDate(task.dueDate)}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
