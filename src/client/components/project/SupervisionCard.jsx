// SupervisionCard: the group's supervisor and examiner (FR-4 "supervisor details").
// Students who may still choose see a "Choose a supervisor" call to action (UC11).
//
// Props:
//   supervisor           object|null  { name, email, department }
//   examiner             object|null  { name, email, department }
//   canChooseSupervisor  boolean      show the link to the supervisors page
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';

// One row: avatar + role + name + contact details, or an empty placeholder
function PersonRow({ role, person, emptyText, action }) {
  return (
    <li>
      {person ? (
        <Avatar name={person.name} />
      ) : (
        <span className="proj-empty-avatar">
          <Icon name="user" size={16} />
        </span>
      )}
      <div className="proj-person">
        <span className="proj-role-label">{role}</span>
        {person ? (
          <>
            <strong>{person.name}</strong>
            <div className="meta">
              {person.department && <span>{person.department}</span>}
              <a href={`mailto:${person.email}`} className="truncate">
                {person.email}
              </a>
            </div>
          </>
        ) : (
          <span className="muted small">{emptyText}</span>
        )}
      </div>
      {action}
    </li>
  );
}

export default function SupervisionCard({ supervisor, examiner, canChooseSupervisor = false }) {
  const chooseLink = canChooseSupervisor ? (
    <Link to="/supervisors" className={supervisor ? 'btn btn-secondary btn-small' : 'btn btn-primary btn-small'}>
      {supervisor ? 'Change' : 'Choose'}
    </Link>
  ) : null;

  return (
    <Card title="Supervision" icon="supervisor" iconColor="teal" flush>
      <ul className="list">
        <PersonRow
          role="Supervisor"
          person={supervisor}
          emptyText="No supervisor yet. Choose one before submitting your proposal."
          action={chooseLink}
        />
        <PersonRow role="Examiner" person={examiner} emptyText="Not assigned yet (the administrator assigns examiners)." />
      </ul>
    </Card>
  );
}
