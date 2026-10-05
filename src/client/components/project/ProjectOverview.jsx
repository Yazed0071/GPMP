// ProjectOverview: everything about one group's project on one page (FR-3, FR-4) - used by
// My Project (students) and the group detail page (staff). It shows the project banner,
// proposal, showcase, documents, team, supervision and upcoming events, and only the
// buttons the current user may use (group.permissions comes from the backend).
//
// Props:
//   group      object    the group detail from GET /api/groups/:id
//   onChanged  function  reload the group after any change
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import Modal from '../common/Modal.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Icon from '../common/Icon.jsx';
import ProjectHero from './ProjectHero.jsx';
import ProjectForm from './ProjectForm.jsx';
import ProposalSection from './ProposalSection.jsx';
import ProjectStatusCard from './ProjectStatusCard.jsx';
import SupervisionCard from './SupervisionCard.jsx';
import TeamCard from './TeamCard.jsx';
import RecentDocumentsCard from './RecentDocumentsCard.jsx';
import UpcomingEventsCard from './UpcomingEventsCard.jsx';
import ShowcaseEditor from '../showcase/ShowcaseEditor.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { FINISHED_STATUSES, createProject, updateProject } from '../../api/projects.js';

// Shown instead of the banner while the group has no project yet
function NoProjectCard({ canCreate, hasSupervisor, onCreate }) {
  if (!canCreate) {
    return (
      <Card>
        <EmptyState
          icon="project"
          title="No project yet"
          message="The students of this group have not created their graduation project yet."
        />
      </Card>
    );
  }
  return (
    <Card
      title="Create your graduation project"
      subtitle={
        hasSupervisor
          ? 'Create the project, then submit your proposal to your supervisor.'
          : 'Create the project, choose a supervisor, then submit your proposal.'
      }
      icon="project"
      iconColor="teal"
    >
      <ProjectForm submitLabel="Create project" onSubmit={onCreate} />
    </Card>
  );
}

export default function ProjectOverview({ group, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const { project, permissions } = group;
  const isStudent = user.role === 'Student';
  const isAdmin = user.role === 'Administrator';
  const isGroupSupervisor = user.role === 'Supervisor' && group.supervisor?.id === user.supervisorId;
  const isFinished = Boolean(project) && FINISHED_STATUSES.includes(project.status);

  async function handleCreate(values) {
    await createProject(values);
    // The next step depends on whether the group already chose a supervisor (UC11)
    toast.success(
      group.supervisor
        ? 'Project created. Next, submit your proposal.'
        : 'Project created. Next, choose a supervisor and submit your proposal.'
    );
    onChanged();
  }

  async function handleUpdate(values) {
    await updateProject(project.id, values);
    toast.success('Project details saved.');
    setEditing(false);
    onChanged();
  }

  const heroActions = project && (
    <>
      {permissions.canEditProject && (
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
          <Icon name="edit" size={16} /> Edit project
        </button>
      )}
      <Link to={`/tasks?groupId=${group.id}`} className="btn proj-hero-button">
        <Icon name="tasks" size={16} /> Tasks &amp; progress
      </Link>
      {isFinished && (
        <Link to={`/showcase?search=${encodeURIComponent(project.title)}`} className="btn proj-hero-button">
          <Icon name="trophy" size={16} /> View in showcase
        </Link>
      )}
    </>
  );

  return (
    <>
      {project && (
        <ProjectHero project={project} groupName={group.name} progress={group.progress} actions={heroActions} />
      )}

      <div className="split">
        <div className="stack">
          {project ? (
            <ProposalSection group={group} onChanged={onChanged} showReviewLink={!isStudent} />
          ) : (
            <NoProjectCard
              canCreate={permissions.canCreateProject}
              hasSupervisor={Boolean(group.supervisor)}
              onCreate={handleCreate}
            />
          )}

          {/* FR-18: the students add the showcase once the project is completed */}
          {isFinished && permissions.canEditShowcase && (
            <ShowcaseEditor key={project.id} project={project} onSaved={onChanged} />
          )}

          <RecentDocumentsCard documents={group.recentDocuments} groupId={group.id} />
        </div>

        <div className="stack">
          {project && (isAdmin || isGroupSupervisor) && (
            // key: start fresh when the status changes (resets the admin drop-down)
            <ProjectStatusCard
              key={project.status}
              project={project}
              permissions={permissions}
              isAdmin={isAdmin}
              onChanged={onChanged}
            />
          )}
          <SupervisionCard
            supervisor={group.supervisor}
            examiner={group.examiner}
            canChooseSupervisor={permissions.canChooseSupervisor}
          />
          <TeamCard members={group.members} />
          <UpcomingEventsCard events={group.upcomingEvents} groupId={group.id} />
        </div>
      </div>

      {project && (
        <Modal open={editing} onClose={() => setEditing(false)} title="Edit project" closeOnBackdrop={false}>
          <ProjectForm
            initialValues={project}
            submitLabel="Save changes"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
    </>
  );
}
