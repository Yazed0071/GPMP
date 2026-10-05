// ProposalTimeline: the review steps of one proposal - submitted, supervisor review,
// examiner review - with each reviewer's feedback, so students can read it (UC16, UC17).
//
// Props:
//   proposal  object  a proposal from the API (status, submittedAt, comments,
//                     supervisorName/Feedback/ReviewedAt, examinerName/Feedback/ReviewedAt,
//                     supervisorReviewerName/Role, examinerReviewerName/Role, decidedByName)
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';

// How each step state looks: the badge text, a status whose badge color we reuse, and the icon
const STATES = {
  done: { label: 'Approved', badge: 'Approved', icon: 'check' },
  rejected: { label: 'Rejected', badge: 'Rejected', icon: 'x' },
  waiting: { label: 'Waiting for review', badge: 'Pending Supervisor', icon: 'clock' },
  upcoming: { label: 'Not started', badge: 'To Do', icon: 'clock' },
  skipped: { label: 'Not needed', badge: 'Archived', icon: 'more' },
};

// Works out the state of the supervisor step and the examiner step from the proposal
function getStepStates(proposal) {
  const { status, supervisorReviewedAt, examinerReviewedAt } = proposal;

  let supervisor = 'skipped';
  if (status === 'Pending Supervisor') supervisor = 'waiting';
  else if (supervisorReviewedAt) {
    // Rejected before the examiner saw it = rejected by the supervisor (or the admin at that stage)
    supervisor = status === 'Rejected' && !examinerReviewedAt ? 'rejected' : 'done';
  }

  let examiner = 'skipped';
  if (status === 'Pending Examiner') examiner = 'waiting';
  else if (examinerReviewedAt) examiner = status === 'Rejected' ? 'rejected' : 'done';
  else if (status === 'Pending Supervisor') examiner = 'upcoming';

  return { supervisor, examiner };
}

// The person shown on a step: who actually reviewed it (marked when it was the administrator),
// otherwise the group's current supervisor / examiner (the step is still open)
function stepPerson(reviewerName, reviewerRole, currentName) {
  if (!reviewerName) return currentName;
  return reviewerRole === 'Administrator' ? `${reviewerName} (administrator)` : reviewerName;
}

// One review step (supervisor or examiner)
function ReviewStep({ title, person, state, reviewedAt, feedback }) {
  const look = STATES[state];
  return (
    <li className={`proj-step proj-step-${state}`}>
      <span className="proj-step-dot">
        <Icon name={look.icon} size={14} />
      </span>
      <div className="proj-step-body">
        <div className="proj-step-head">
          <strong>{title}</strong>
          <StatusBadge status={look.badge}>{look.label}</StatusBadge>
        </div>
        <div className="meta">
          <span>{person || 'Not assigned yet'}</span>
          {reviewedAt && <span>{formatDateTime(reviewedAt)}</span>}
        </div>
        {feedback && <p className="proj-feedback">{feedback}</p>}
      </div>
    </li>
  );
}

export default function ProposalTimeline({ proposal }) {
  const states = getStepStates(proposal);
  const isDecided = proposal.status === 'Approved' || proposal.status === 'Rejected';

  return (
    <>
      <ol className="proj-timeline">
        <li className="proj-step proj-step-submitted">
          <span className="proj-step-dot">
            <Icon name="send" size={14} />
          </span>
          <div className="proj-step-body">
            <div className="proj-step-head">
              <strong>Submitted</strong>
            </div>
            <div className="meta">
              <span>{formatDateTime(proposal.submittedAt)}</span>
              {proposal.deadline && <span>Deadline {formatDate(proposal.deadline)}</span>}
            </div>
            {proposal.comments && <p className="proj-step-text">{proposal.comments}</p>}
          </div>
        </li>
        <ReviewStep
          title="Supervisor review"
          person={stepPerson(proposal.supervisorReviewerName, proposal.supervisorReviewerRole, proposal.supervisorName)}
          state={states.supervisor}
          reviewedAt={proposal.supervisorReviewedAt}
          feedback={proposal.supervisorFeedback}
        />
        <ReviewStep
          title="Examiner review"
          person={stepPerson(proposal.examinerReviewerName, proposal.examinerReviewerRole, proposal.examinerName)}
          state={states.examiner}
          reviewedAt={proposal.examinerReviewedAt}
          feedback={proposal.examinerFeedback}
        />
      </ol>
      {isDecided && proposal.decidedByName && (
        <p className="proj-decided-by">
          Final decision by <strong>{proposal.decidedByName}</strong>
        </p>
      )}
    </>
  );
}
