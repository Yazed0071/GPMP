// TaskDetailPage: one task with everything around it (FR-11, FR-14, UC5, UC13).
// - Task details, status and the allowed status changes
// - Edit / delete buttons (only when the backend's permissions allow them)
// - "Submit work" form for the group's students (UC5)
// - Submission history with file downloads and structured feedback;
//   the supervisor gives or edits feedback right under each submission (UC13)
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ConfirmButton from '../components/common/ConfirmButton.jsx';
import Avatar from '../components/common/Avatar.jsx';
import Icon from '../components/common/Icon.jsx';
import TaskFormModal from '../components/tasks/TaskFormModal.jsx';
import TaskStatusControl from '../components/tasks/TaskStatusControl.jsx';
import SubmitWorkForm from '../components/tasks/SubmitWorkForm.jsx';
import SubmissionCard from '../components/tasks/SubmissionCard.jsx';
import { dueText } from '../components/tasks/taskHelpers.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { deleteTask, getTask } from '../api/tasks.js';
import { formatDate, plural } from '../utils/format.js';
import '../styles/tasks.css';

export default function TaskDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data: task, loading, error, reload } = useApi(() => getTask(id), [id]);

  // Live update: a new submission or feedback for THIS task
  useSocketEvent('notification:new', (notification) => {
    if (notification.link === `/tasks/${id}`) reload();
  });

  if (loading) return <Loading text="Loading task..." />;

  if (error) {
    if (error.status === 404 || error.status === 403) {
      return (
        <EmptyState
          icon="tasks"
          title={error.status === 404 ? 'Task not found' : 'You cannot open this task'}
          message={error.status === 404 ? 'This task may have been deleted.' : error.message}
          action={
            <Link to="/tasks" className="btn btn-primary">
              <Icon name="arrowLeft" size={16} /> Back to tasks
            </Link>
          }
        />
      );
    }
    return <ErrorMessage error={error} onRetry={reload} />;
  }

  const { permissions, submissions } = task;
  const backTo = `/tasks?groupId=${task.groupId}`;
  const due = dueText(task);

  async function handleDelete() {
    await deleteTask(task.id); // ConfirmButton shows the error if this fails
    toast.success('Task deleted');
    navigate(backTo, { replace: true });
  }

  const headerActions = (permissions.canEdit || permissions.canDelete) && (
    <>
      {permissions.canEdit && (
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          <Icon name="edit" size={16} /> Edit
        </button>
      )}
      {permissions.canDelete && (
        <ConfirmButton
          onConfirm={handleDelete}
          title="Delete this task?"
          message={
            task.submissionCount > 0
              ? `This also deletes its ${plural(task.submissionCount, 'submission')}, their files and feedback. This cannot be undone.`
              : 'The task will be removed for the whole team. This cannot be undone.'
          }
        >
          <Icon name="trash" size={16} /> Delete
        </ConfirmButton>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={`${task.groupName} · ${task.isMilestone ? 'Milestone' : 'Task'}`}
        backTo={backTo}
        backLabel="Back to tasks"
        actions={headerActions}
      />

      <div className="split">
        {/* Main column: description, submit form and submission history */}
        <div className="stack">
          <Card title="Description" icon="document" iconColor="blue">
            {task.description ? (
              <p className="task-description">{task.description}</p>
            ) : (
              <p className="muted">No description was added for this task.</p>
            )}
          </Card>

          {permissions.canSubmit && (
            <Card
              title="Submit work"
              subtitle="Attach your files and/or a link. Your supervisor will review it."
              icon="upload"
            >
              <SubmitWorkForm task={task} onSubmitted={reload} />
            </Card>
          )}

          <Card
            title="Submissions"
            subtitle={submissions.length > 0 ? `${plural(submissions.length, 'submission')}, newest first` : undefined}
            icon="paperclip"
            iconColor="amber"
          >
            {submissions.length === 0 ? (
              <EmptyState
                compact
                icon="upload"
                title="No submissions yet"
                message={
                  permissions.canSubmit
                    ? 'Use the form above to submit your work.'
                    : 'Work submitted by the students will appear here.'
                }
              />
            ) : (
              submissions.map((submission, index) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  isLatest={index === 0}
                  canGiveFeedback={permissions.canGiveFeedback}
                  currentUserId={user.id}
                  onChanged={reload}
                />
              ))
            )}
          </Card>
        </div>

        {/* Side column: details and status */}
        <div className="stack">
          <Card title="Details" icon="info">
            <dl className="task-info-list">
              <div>
                <dt>Status</dt>
                <dd className="task-info-badges">
                  <StatusBadge status={task.status} dot />
                  {task.isOverdue && <StatusBadge status="Overdue" />}
                  {task.isMilestone && <StatusBadge status="Milestone" />}
                </dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>
                  {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                  {due && (
                    <span className={task.isOverdue ? 'task-info-note text-danger' : 'task-info-note'}>{due}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>
                  {task.assignedTo ? (
                    <span className="task-info-person">
                      <Avatar name={task.assignedTo.name} size="small" /> {task.assignedTo.name}
                    </span>
                  ) : (
                    'Whole team'
                  )}
                </dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>{task.createdBy?.name || '—'}</dd>
              </div>
              <div>
                <dt>Created on</dt>
                <dd>{formatDate(task.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          {permissions.canChangeStatus && (
            <Card title="Update status" icon="refresh" iconColor="green">
              <TaskStatusControl task={task} onChanged={reload} />
            </Card>
          )}

          {!permissions.canChangeStatus && task.status === 'Submitted' && user.role === 'Student' && (
            <div className="alert alert-info">
              Your work was submitted and is waiting for your supervisor&apos;s feedback.
            </div>
          )}
        </div>
      </div>

      <TaskFormModal
        open={editing}
        onClose={() => setEditing(false)}
        groupId={task.groupId}
        task={task}
        onSaved={() => {
          setEditing(false);
          reload();
        }}
      />
    </>
  );
}
