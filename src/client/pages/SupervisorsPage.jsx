// SupervisorsPage (FR-5, UC11):
//   Students choose an available supervisor for their group (before the proposal is approved).
//   Administrators manage each supervisor's department, maximum number of groups and availability.
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import SupervisorCard from '../components/project/SupervisorCard.jsx';
import SupervisorRow from '../components/project/SupervisorRow.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { chooseSupervisor, getMySupervisorChoice, getSupervisors } from '../api/supervisors.js';
import '../styles/project.css';

// ----- Student view (UC11 Choose Supervisor) -----

async function loadStudentData() {
  const [choice, supervisors] = await Promise.all([getMySupervisorChoice(), getSupervisors()]);
  return { choice, supervisors };
}

// Current supervisor first, then the ones that can be chosen, then the rest
function sortForStudent(supervisors) {
  const rank = (s) => (s.isCurrent ? 0 : s.canBeChosen ? 1 : 2);
  return [...supervisors].sort((a, b) => rank(a) - rank(b));
}

function StudentSupervisors() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(loadStudentData, []);

  async function handleChoose(supervisor) {
    const result = await chooseSupervisor(supervisor.id);
    toast.success(result.message);
    reload();
  }

  let content;
  if (loading) content = <Loading text="Loading supervisors..." />;
  else if (error) content = <ErrorMessage error={error} onRetry={reload} />;
  else if (!data.choice.groupId) {
    content = (
      <Card>
        <EmptyState icon="users" title="You are not in a group yet" message={data.choice.message} />
      </Card>
    );
  } else {
    const { choice, supervisors } = data;
    const hasCurrent = supervisors.some((s) => s.isCurrent);
    const noneAvailable = !supervisors.some((s) => s.canBeChosen);

    content = (
      <>
        {!choice.canChange && (
          <div className="alert alert-info mb-2">
            <Icon name="lock" size={18} />
            <span>{choice.message}</span>
          </div>
        )}
        {/* UC11 exceptional flow */}
        {choice.canChange && noneAvailable && (
          <div className="alert alert-warning mb-2">
            <Icon name="alert" size={18} />
            <span>
              No supervisors are available at the moment.{' '}
              {hasCurrent ? 'You can keep your current supervisor.' : 'Please check again later or contact the administrator.'}
            </span>
          </div>
        )}
        {choice.canChange && !hasCurrent && !noneAvailable && (
          <div className="alert alert-info mb-2">
            <Icon name="info" size={18} />
            <span>
              Your group <strong>{choice.groupName}</strong> has no supervisor yet. Choose one to be able to submit
              your proposal.
            </span>
          </div>
        )}

        {supervisors.length === 0 ? (
          <Card>
            <EmptyState icon="supervisor" title="No supervisors are available at the moment." />
          </Card>
        ) : (
          <div className="grid">
            {sortForStudent(supervisors).map((supervisor) => (
              <SupervisorCard
                key={supervisor.id}
                supervisor={supervisor}
                canChoose={choice.canChange}
                onChoose={() => handleChoose(supervisor)}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Choose a Supervisor"
        subtitle="Pick an available supervisor for your group's graduation project."
        actions={
          <Link to="/project" className="btn btn-secondary">
            <Icon name="project" size={16} /> My Project
          </Link>
        }
      />
      {content}
    </>
  );
}

// ----- Administrator view (FR-5: manage the list of available supervisors) -----

function AdminSupervisors() {
  const { data: supervisors, loading, error, reload, setData } = useApi(getSupervisors, []);

  // Replace the saved row in the list without reloading everything
  function handleSaved(updated) {
    setData((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  let content;
  if (loading) content = <Loading text="Loading supervisors..." />;
  else if (error) content = <ErrorMessage error={error} onRetry={reload} />;
  else if (supervisors.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon="supervisor"
          title="No supervisors yet"
          message="Create supervisor accounts on the Users page first."
          action={
            <Link to="/users" className="btn btn-primary">
              Go to Users
            </Link>
          }
        />
      </Card>
    );
  } else {
    content = (
      <Card flush>
        <div className="table-wrap">
          <table className="table proj-sup-table">
            <thead>
              <tr>
                <th scope="col">Supervisor</th>
                <th scope="col">Department</th>
                <th scope="col">Groups</th>
                <th scope="col">Max groups</th>
                <th scope="col">Availability</th>
                <th scope="col" className="actions-cell">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {supervisors.map((supervisor) => (
                <SupervisorRow key={supervisor.id} supervisor={supervisor} onSaved={handleSaved} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Supervisors"
        subtitle="Set each supervisor's availability and the maximum number of groups students can assign to them."
      />
      {content}
    </>
  );
}

export default function SupervisorsPage() {
  const { user } = useAuth();
  return user.role === 'Administrator' ? <AdminSupervisors /> : <StudentSupervisors />;
}
