// ProgressSummary: the group's overall progress - a ring with the percent completed
// and the number of tasks in each status (FR-14, "Overall Progress" in UI fig 46).
//
// Props:
//   progress  object  from GET /api/tasks/progress
//                     { total, toDo, inProgress, submitted, completed, overdue, percent }
import ProgressRing from '../common/ProgressRing.jsx';
import Icon from '../common/Icon.jsx';
import { plural } from '../../utils/format.js';

export default function ProgressSummary({ progress }) {
  const stats = [
    { label: 'To Do', value: progress.toDo, className: 'task-stat-todo' },
    { label: 'In Progress', value: progress.inProgress, className: 'task-stat-progress' },
    { label: 'Submitted', value: progress.submitted, className: 'task-stat-submitted' },
    { label: 'Completed', value: progress.completed, className: 'task-stat-completed' },
  ];

  return (
    <div className="task-progress">
      <ProgressRing value={progress.percent} size={132} label="Completed" />

      <div className="task-progress-side">
        <div className="task-progress-stats">
          {stats.map((stat) => (
            <div key={stat.label} className={`task-stat ${stat.className}`}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <p className="task-progress-note">
          {progress.completed} of {plural(progress.total, 'task')} completed
        </p>
        {progress.overdue > 0 && (
          <p className="task-progress-warning">
            <Icon name="alert" size={16} /> {plural(progress.overdue, 'task')} overdue
          </p>
        )}
      </div>
    </div>
  );
}
