// ProposalSection: the proposal part of a project page - where the proposal stands, a
// "Submit proposal" button for students, and the history with the reviewers' feedback
// (FR-6, FR-7, UC16, UC17: feedback is shown to the students).
//
// Props:
//   group           object    the group detail from GET /api/groups/:id
//   onChanged       function  reload the page after a change
//   showReviewLink  boolean   staff: show a link to the Proposals page for this group
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import ProposalTimeline from './ProposalTimeline.jsx';
import ProposalSubmitModal from './ProposalSubmitModal.jsx';
import { formatDate } from '../../utils/format.js';

// A short sentence explaining where the proposal stands: { type, text } or null
function getProposalHint(group) {
  const latest = group.proposals[0];
  const canSubmit = group.permissions.canSubmitProposal;

  if (!latest) {
    if (!group.supervisor) {
      return { type: 'warning', text: 'A supervisor must be chosen before the proposal can be submitted.' };
    }
    return canSubmit
      ? { type: 'info', text: 'The project is ready. Submit the proposal so the supervisor can review it.' }
      : { type: 'info', text: 'No proposal has been submitted yet.' };
  }

  switch (latest.status) {
    case 'Pending Supervisor':
      return { type: 'info', text: 'The proposal is waiting for the supervisor to review it.' };
    case 'Pending Examiner':
      return group.examiner
        ? { type: 'info', text: 'The supervisor approved the proposal. It is now waiting for the examiner.' }
        : {
            type: 'warning',
            text: 'The supervisor approved the proposal. The administrator will assign an examiner to review it.',
          };
    case 'Approved':
      return { type: 'success', text: 'The proposal was approved. The project is in progress.' };
    case 'Rejected':
      return {
        type: 'warning',
        text: canSubmit
          ? 'The last proposal was rejected. Read the feedback below, update the project if needed and submit a new proposal.'
          : 'The last proposal was rejected.',
      };
    default:
      return null;
  }
}

// One proposal with its number, date, status and review steps
function ProposalItem({ proposal, number }) {
  return (
    <div className="proj-history-item">
      <div className="proj-history-item-head">
        <div>
          <h3>Proposal #{number}</h3>
          <span className="meta">Submitted {formatDate(proposal.submittedAt)}</span>
        </div>
        <StatusBadge status={proposal.status} />
      </div>
      <ProposalTimeline proposal={proposal} />
    </div>
  );
}

export default function ProposalSection({ group, onChanged, showReviewLink = false }) {
  const [showSubmit, setShowSubmit] = useState(false);
  const { proposals, permissions, project } = group;
  const hint = getProposalHint(group);
  const [latest, ...earlier] = proposals;
  const needsReview = proposals.some((proposal) => proposal.canReview);

  const actions = (
    <>
      {permissions.canSubmitProposal && (
        <button type="button" className="btn btn-primary btn-small" onClick={() => setShowSubmit(true)}>
          <Icon name="send" size={16} /> Submit proposal
        </button>
      )}
      {showReviewLink && proposals.length > 0 && (
        <Link to={`/proposals?groupId=${group.id}`} className={needsReview ? 'btn btn-primary btn-small' : 'btn btn-secondary btn-small'}>
          {needsReview ? 'Review proposal' : 'Open in Proposals'}
        </Link>
      )}
    </>
  );

  return (
    <Card title="Proposal" subtitle="Review by the supervisor, then the examiner" icon="proposal" iconColor="purple" actions={actions}>
      <div className="stack">
        {hint && (
          <div className={`alert alert-${hint.type}`}>
            <Icon name={hint.type === 'success' ? 'check' : 'info'} size={18} />
            <span>
              {hint.text}{' '}
              {!group.supervisor && permissions.canChooseSupervisor && (
                <Link to="/supervisors" className="bold">
                  Choose a supervisor
                </Link>
              )}
            </span>
          </div>
        )}

        {latest ? (
          <ProposalItem proposal={latest} number={proposals.length} />
        ) : (
          <EmptyState compact icon="proposal" title="No proposal yet" message="The proposal history and the reviewers' feedback will appear here." />
        )}

        {earlier.length > 0 && (
          <details>
            <summary className="link-text">Earlier proposals ({earlier.length})</summary>
            <div className="proj-history mt-2">
              {earlier.map((proposal, index) => (
                <ProposalItem key={proposal.id} proposal={proposal} number={earlier.length - index} />
              ))}
            </div>
          </details>
        )}
      </div>

      {project && (
        <ProposalSubmitModal
          open={showSubmit}
          onClose={() => setShowSubmit(false)}
          project={project}
          supervisorName={group.supervisor?.name}
          onSubmitted={onChanged}
        />
      )}
    </Card>
  );
}
