// TaskBoard: the tasks in four columns - To Do, In Progress, Submitted, Completed
// (like the "Tasks & Progress" prototype screen). On phones the columns stack vertically.
//
// Props:
//   tasks  array  the tasks to show (already filtered by the page)
import Icon from '../common/Icon.jsx';
import TaskCard from './TaskCard.jsx';
import { TASK_COLUMNS } from './taskHelpers.js';

export default function TaskBoard({ tasks }) {
  return (
    <div className="task-board">
      {TASK_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        return (
          <section key={column.status} className={`task-column ${column.className}`} aria-label={column.status}>
            <header className="task-column-header">
              <span className="task-column-icon">
                <Icon name={column.icon} size={16} />
              </span>
              <h2>{column.status}</h2>
              <span className="task-column-count">{columnTasks.length}</span>
            </header>

            <div className="task-column-body">
              {columnTasks.length === 0 ? (
                <p className="task-column-empty">No tasks here</p>
              ) : (
                columnTasks.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
