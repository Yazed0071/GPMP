// TaskFormModal: the pop-up form to add a new task or edit an existing one (UC15 Add Tasks).
// Fields: title, description, due date, "milestone" checkbox and the student it is assigned to.
//
// Props:
//   open     boolean   show or hide the form
//   onClose  function  called when the form is closed without saving
//   groupId  number    the group the task belongs to
//   task     object    the task to edit, or null/undefined to add a new one
//   onSaved  function  called with the saved task after a successful save
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createTask, getAssignees, updateTask } from '../../api/tasks.js';
import { todayISO } from '../../utils/format.js';

export default function TaskFormModal({ open, onClose, groupId, task, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} closeOnBackdrop={false}>
      {/* The form is created fresh every time the modal opens, so it starts with the right values */}
      {open && <TaskForm groupId={groupId} task={task} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function TaskForm({ groupId, task, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(task);

  const [values, setValues] = useState({
    title: task?.title || '',
    description: task?.description || '',
    dueDate: task?.dueDate || '',
    isMilestone: task?.isMilestone || false,
    assignedToStudentId: task?.assignedTo?.studentId ? String(task.assignedTo.studentId) : '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // The students of the group, for the "Assign to" list
  const { data: students, loading: loadingStudents } = useApi(() => getAssignees(groupId), [groupId]);

  function setValue(name, value) {
    setValues((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: undefined }));
  }

  // Same rules as the backend, so the user sees problems before sending
  function validate() {
    const found = {};
    if (!values.title.trim()) found.title = 'Please enter a task title.';
    const dateChanged = values.dueDate !== (task?.dueDate || '');
    if (values.dueDate && dateChanged && values.dueDate < todayISO()) {
      found.dueDate = 'The due date cannot be in the past.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;

    const data = {
      title: values.title.trim(),
      description: values.description.trim(),
      dueDate: values.dueDate || null,
      isMilestone: values.isMilestone,
      assignedToStudentId: values.assignedToStudentId ? Number(values.assignedToStudentId) : null,
    };

    setSaving(true);
    try {
      const saved = isEdit ? await updateTask(task.id, data) : await createTask({ ...data, groupId });
      toast.success(isEdit ? 'Task updated' : 'Task created and the team was notified');
      onSaved?.(saved);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // A past due date that is being kept (editing an overdue task) must stay selectable
  const minDate = task?.dueDate && task.dueDate < todayISO() ? undefined : todayISO();

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert alert-error">{formError}</div>}

      <FormField
        id="task-title"
        label="Title"
        required
        maxLength={200}
        placeholder="e.g. Chapter 4 - Implementation"
        value={values.title}
        onChange={(e) => setValue('title', e.target.value)}
        error={errors.title}
      />

      <FormField
        id="task-description"
        label="Description"
        as="textarea"
        rows={4}
        placeholder="What needs to be done?"
        value={values.description}
        onChange={(e) => setValue('description', e.target.value)}
      />

      <div className="form-row">
        <FormField
          id="task-due-date"
          label="Due date"
          type="date"
          min={minDate}
          value={values.dueDate}
          onChange={(e) => setValue('dueDate', e.target.value)}
          error={errors.dueDate}
        />

        <FormField id="task-assignee" label="Assign to">
          <select
            id="task-assignee"
            value={values.assignedToStudentId}
            onChange={(e) => setValue('assignedToStudentId', e.target.value)}
            disabled={loadingStudents}
          >
            <option value="">{loadingStudents ? 'Loading students...' : 'Whole team (not assigned)'}</option>
            {(students || []).map((student) => (
              <option key={student.studentId} value={String(student.studentId)}>
                {student.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={values.isMilestone}
          onChange={(e) => setValue('isMilestone', e.target.checked)}
        />
        This is a milestone (a key moment of the project)
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create task'}
        </button>
      </div>
    </form>
  );
}
