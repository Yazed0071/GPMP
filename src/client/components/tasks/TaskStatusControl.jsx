// TaskStatusControl: buttons to move a task to another status.
// The backend decides which statuses this user may choose (task.permissions.allowedStatuses):
//   students: To Do / In Progress      supervisor or admin: To Do / In Progress / Completed
// 'Submitted' is never chosen by hand - it is set when work is submitted (UC5).
//
// Props:
//   task       object    the task from GET /api/tasks/:id (with permissions)
//   onChanged  function  called with the updated task
import { useState } from 'react';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { updateTaskStatus } from '../../api/tasks.js';

const ICONS = { 'To Do': 'clock', 'In Progress': 'refresh', Completed: 'check' };

export default function TaskStatusControl({ task, onChanged }) {
  const toast = useToast();
  const [saving, setSaving] = useState(null); // the status being saved, or null

  async function changeStatus(status) {
    setSaving(status);
    try {
      const updated = await updateTaskStatus(task.id, status);
      toast.success(`Task moved to "${status}"`);
      onChanged?.(updated);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="stack-sm">
      <div className="task-status-options" role="group" aria-label="Change the task status">
        {task.permissions.allowedStatuses.map((status) => {
          const current = task.status === status;
          return (
            <button
              key={status}
              type="button"
              className={current ? 'btn btn-small task-status-option active' : 'btn btn-small task-status-option'}
              aria-pressed={current}
              disabled={current || saving !== null}
              onClick={() => changeStatus(status)}
            >
              <Icon name={ICONS[status]} size={16} />
              {saving === status ? 'Saving...' : status}
            </button>
          );
        })}
      </div>
      {task.status === 'Submitted' && task.permissions.canGiveFeedback && (
        <p className="field-hint">
          Review the latest submission below: approving it completes the task automatically.
        </p>
      )}
    </div>
  );
}
