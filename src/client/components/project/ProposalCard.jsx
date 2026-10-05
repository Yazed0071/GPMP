// ProposalCard: one proposal on the Proposals page - project information, the review history
// and the Approve / Reject / Edit feedback buttons for the users allowed to use them (FR-6, FR-7).
//
// Props:
//   proposal        object    a proposal from GET /api/proposals
//   isAdmin         boolean   shows the "assign an examiner" hint when one is missing
//   onReview        function  (proposal, 'approve' | 'reject') => opens the review modal
//   onEditFeedback  function  (proposal) => opens the edit feedback modal
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import ProposalTimeline from './ProposalTimeline.jsx';
import { formatDate } from '../../utils/format.js';

export default function ProposalCard({ proposal, isAdmin = false, onReview, onEditFeedback }) {
  const { project, group } = proposal;
  const needsExaminer = isAdmin && proposal.status === 'Pending Examiner' && !proposal.hasExaminer;

  return (
    <Card
      className="proj-proposal-card"
      title={project.title}
      subtitle={
        <span className="meta">
          <span>{group.name}</span>
          <span>Submitted {formatDate(proposal.submittedAt)}</span>
          {proposal.deadline && <span>Deadline {formatDate(proposal.deadline)}</span>}
        </span>
      }
      icon="proposal"
      iconColor="purple"
      actions={
        <>
          {proposal.canReview && <span className="badge badge-amber">Waiting for you</span>}
          <StatusBadge status={proposal.status} />
        </>
      }
    >
      <div className="proj-proposal-grid">
        <div>
          <p className="proj-section-label">Project</p>
          <p className="proj-proposal-description">{project.description || 'No description.'}</p>
          <div className="meta">
            <span>Supervisor: {proposal.supervisorName || 'not chosen yet'}</span>
            <span>Examiner: {proposal.examinerName || 'not assigned yet'}</span>
          </div>
          {needsExaminer && (
            <div className="alert alert-warning mt-2">
              <Icon name="alert" size={18} />
              <span>
                This group has no examiner yet, so nobody can do the second review.{' '}
                <Link to={`/groups/${group.id}`} className="bold">
                  Assign an examiner
                </Link>
              </span>
            </div>
          )}
        </div>
        <div>
          <p className="proj-section-label">Review history</p>
          <ProposalTimeline proposal={proposal} />
        </div>
      </div>

      <div className="proj-proposal-actions">
        {proposal.canReview && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => onReview(proposal, 'approve')}>
              <Icon name="check" size={16} /> Approve
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onReview(proposal, 'reject')}>
              <Icon name="x" size={16} /> Reject
            </button>
          </>
        )}
        {proposal.canEditFeedback && (
          <button type="button" className="btn btn-secondary" onClick={() => onEditFeedback(proposal)}>
            <Icon name="edit" size={16} /> Edit feedback
          </button>
        )}
        <span className="spacer" />
        <Link to={`/groups/${group.id}`} className="btn btn-ghost">
          Open group <Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </Card>
  );
}
