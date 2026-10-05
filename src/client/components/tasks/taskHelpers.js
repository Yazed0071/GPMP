// Small display helpers shared by the task components and pages:
// the board columns, short dates and "Due in 3 days" texts.
import { toDate, daysUntil, plural } from '../../utils/format.js';

// The four board columns, in workflow order (FR-14, UI fig 46)
export const TASK_COLUMNS = [
  { status: 'To Do', icon: 'clock', className: 'task-column-todo' },
  { status: 'In Progress', icon: 'refresh', className: 'task-column-progress' },
  { status: 'Submitted', icon: 'upload', className: 'task-column-submitted' },
  { status: 'Completed', icon: 'check', className: 'task-column-completed' },
];

// "Sep 27" - a compact date for task cards
export function shortDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

// A friendly due-date text for tasks that are still open:
// "Due today", "Due tomorrow", "Due in 5 days", "3 days overdue".
// Returns null for tasks without a due date or that are already submitted/completed.
export function dueText(task) {
  if (!task.dueDate || task.status === 'Submitted' || task.status === 'Completed') return null;
  const days = daysUntil(task.dueDate);
  if (days === null) return null;
  if (days < 0) return `${plural(-days, 'day')} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${plural(days, 'day')}`;
}
