// TasksPage: tasks, milestones and progress of a group (FR-14, UC15, UI fig 46 "Tasks & Progress").
// - Students always see their own group; staff choose a group (kept in the URL as ?groupId=).
// - Top: overall progress (ring + counts) and the milestone timeline.
// - Below: filter tabs and a board with the columns To Do / In Progress / Submitted / Completed.
// - Students, the group's supervisor and admins can add tasks ("New task"); examiners only view.
// - An archived project (FR-8) is read-only: only an administrator can still add tasks.
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import GroupSelect from '../components/common/GroupSelect.jsx';
import Card from '../components/common/Card.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import ProgressSummary from '../components/tasks/ProgressSummary.jsx';
import MilestoneTimeline from '../components/tasks/MilestoneTimeline.jsx';
import TaskBoard from '../components/tasks/TaskBoard.jsx';
import TaskFormModal from '../components/tasks/TaskFormModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useGroupParam } from '../hooks/useGroupParam.js';
import { useMyGroups } from '../hooks/useMyGroups.js';
import { getTaskProgress, getTasks } from '../api/tasks.js';
import { isAdmin, isExaminer, isStudent } from '../config/roles.js';
import '../styles/tasks.css';

export default function TasksPage() {
  const { user } = useAuth();
  const student = isStudent(user.role);

  // Students always use their own group; staff pick one (saved in ?groupId=)
  const [paramGroupId, setGroupId] = useGroupParam();
  const groupId = student ? user.groupId : paramGroupId;

  // An archived project is kept as it is (FR-8): only an administrator may still change it
  const { groups } = useMyGroups();
  const isArchived =
    !isAdmin(user.role) && groups.find((group) => group.id === groupId)?.projectStatus === 'Archived';

  const [tab, setTab] = useState('all');
  const [showForm, setShowForm] = useState(false);

  const tasksData = useApi(() => (groupId ? getTasks({ groupId }) : Promise.resolve([])), [groupId]);
  const progressData = useApi(() => (groupId ? getTaskProgress(groupId) : Promise.resolve(null)), [groupId]);

  function reloadAll() {
    tasksData.reload();
    progressData.reload();
  }

  // Live update: someone added a task, submitted work or gave feedback
  useSocketEvent('notification:new', (notification) => {
    if (groupId && ['Task', 'Feedback'].includes(notification.type)) reloadAll();
  });

  // Examiners only view tasks (UC15 is for supervisors; students may plan their own team's work)
  const canAddTasks = Boolean(groupId) && !isExaminer(user.role) && !isArchived;

  const header = (
    <PageHeader
      title="Tasks & Progress"
      subtitle="Track your team's tasks, deadlines, milestones and overall project progress."
      actions={
        canAddTasks && (
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={18} /> New task
          </button>
        )
      }
    />
  );

  // A student who has not been placed in a group yet
  if (student && !user.groupId) {
    return (
      <>
        {header}
        <EmptyState
          icon="users"
          title="You are not in a group yet"
          message="Your tasks will appear here once the administrator adds you to a project group."
        />
      </>
    );
  }

  const tasks = tasksData.data || [];
  const progress = progressData.data;

  // Filter tabs (the board always keeps its four columns)
  const myTasks = tasks.filter((task) => task.assignedTo?.studentId === user.studentId);
  const overdueTasks = tasks.filter((task) => task.isOverdue);
  const milestoneTasks = tasks.filter((task) => task.isMilestone);
  const tabs = [
    { value: 'all', label: 'All tasks', count: tasks.length },
    ...(student ? [{ value: 'mine', label: 'Assigned to me', count: myTasks.length }] : []),
    { value: 'milestones', label: 'Milestones', count: milestoneTasks.length },
    { value: 'overdue', label: 'Overdue', count: overdueTasks.length },
  ];
  const visibleTasks = { all: tasks, mine: myTasks, milestones: milestoneTasks, overdue: overdueTasks }[tab] || tasks;

  function renderContent() {
    if (!groupId) {
      return (
        <EmptyState
          icon="tasks"
          title="Choose a group"
          message="Select a group above to see its tasks. If the list is empty, no group has been assigned to you yet."
        />
      );
    }
    if (tasksData.loading || progressData.loading) return <Loading text="Loading tasks..." />;
    const error = tasksData.error || progressData.error;
    if (error) return <ErrorMessage error={error} onRetry={reloadAll} />;

    if (tasks.length === 0) {
      return (
        <EmptyState
          icon="tasks"
          title="No tasks yet"
          message={
            canAddTasks
              ? 'Create the first task to start planning the project.'
              : 'The supervisor has not added any tasks to this group yet.'
          }
          action={
            canAddTasks && (
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                <Icon name="plus" size={18} /> New task
              </button>
            )
          }
        />
      );
    }

    return (
      <>
        <div className="task-overview">
          <Card title="Overall Progress" icon="trendingUp">
            <ProgressSummary progress={progress} />
          </Card>
          <Card title="Milestones" icon="flag" iconColor="purple">
            <MilestoneTimeline milestones={progress.milestones} />
          </Card>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={setTab} ariaLabel="Filter tasks" />
        <TaskBoard tasks={visibleTasks} />
      </>
    );
  }

  return (
    <>
      {header}

      {!student && (
        <div className="task-group-bar">
          <GroupSelect value={paramGroupId} onChange={setGroupId} />
        </div>
      )}

      {renderContent()}

      <TaskFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        groupId={groupId}
        onSaved={() => {
          setShowForm(false);
          reloadAll();
        }}
      />
    </>
  );
}
