// SupervisorCard: one supervisor on the student's "Choose a supervisor" page (UC11) with the
// department, capacity (e.g. 2 / 3 groups), availability and a "Choose" button.
//
// Props:
//   supervisor  object    from GET /api/supervisors ({ name, department, currentGroups,
//                         numberOfGroups, isAvailable, hasCapacity, canBeChosen, isCurrent })
//   canChoose   boolean   false when the group may no longer change its supervisor
//   onChoose    function  async () => ... chooses this supervisor (called after confirming)
import Avatar from '../common/Avatar.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';

export default function SupervisorCard({ supervisor, canChoose, onChoose }) {
  const { currentGroups, numberOfGroups } = supervisor;
  const percent = numberOfGroups > 0 ? (currentGroups / numberOfGroups) * 100 : 100;

  let availability = 'Available';
  if (!supervisor.isAvailable) availability = 'Unavailable';
  else if (!supervisor.hasCapacity) availability = 'Full';

  const classes = ['proj-sup-card'];
  if (supervisor.isCurrent) classes.push('is-current');
  else if (!supervisor.canBeChosen) classes.push('is-disabled');

  return (
    <article className={classes.join(' ')}>
      <Avatar name={supervisor.name} size="large" />
      <h3>{supervisor.name}</h3>
      <p className="proj-sup-dept">{supervisor.department || 'Department not set'}</p>
      <a href={`mailto:${supervisor.email}`} className="small">
        {supervisor.email}
      </a>

      <div className="proj-sup-badges">
        {supervisor.isCurrent && <StatusBadge status="Active">Your supervisor</StatusBadge>}
        <StatusBadge status={availability} dot />
      </div>

      <div className="proj-sup-capacity">
        <ProgressBar
          value={percent}
          size="small"
          color={supervisor.hasCapacity ? 'teal' : 'amber'}
          label={`${currentGroups} / ${numberOfGroups} groups`}
        />
      </div>

      {supervisor.isCurrent ? (
        <span className="proj-sup-current">
          <Icon name="check" size={16} /> Current supervisor
        </span>
      ) : (
        <ConfirmButton
          className="btn btn-primary"
          danger={false}
          disabled={!canChoose || !supervisor.canBeChosen}
          title="Choose this supervisor?"
          message={`${supervisor.name} will become your group's supervisor and will be notified. You can change your choice until the supervisor approves your proposal.`}
          confirmLabel="Choose supervisor"
          onConfirm={onChoose}
        >
          {supervisor.canBeChosen ? 'Choose' : availability === 'Full' ? 'No free places' : 'Not available'}
        </ConfirmButton>
      )}
    </article>
  );
}
