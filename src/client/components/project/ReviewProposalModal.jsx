// ReviewProposalModal: approve or reject a proposal with feedback for the students
// (FR-6, FR-7, UC16 Evaluate Proposal). It also lists similar existing projects, so the
// reviewer can check whether the idea was already done (UC16 description), and has a search
// box to look for other projects by any words.
//
// Props:
//   proposal         object|null  the proposal to review (null = closed)
//   initialDecision  string       'approve' or 'reject' (the button the user pressed)
//   onClose          function
//   onReviewed       function     called after the decision was saved
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import Loading from '../common/Loading.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { reviewProposal } from '../../api/proposals.js';
import { findSimilarProjects } from '../../api/projects.js';

// UC16: other projects with similar titles, or with the words the reviewer searches for.
// This sits inside the review <form>, so it uses a button (not a nested form) and stops
// Enter from submitting the review.
function SimilarProjects({ projectId }) {
  const [search, setSearch] = useState(''); // what is typed in the box
  const [searchWords, setSearchWords] = useState(''); // what was last searched ('' = title match)
  // Without search words the backend matches the proposal's title; the project itself is left out
  const { data: projects, loading, error } = useApi(
    () => findSimilarProjects({ projectId, q: searchWords }),
    [projectId, searchWords]
  );

  function runSearch() {
    setSearchWords(search.trim());
  }

  let results;
  if (loading) results = <Loading inline text="Looking for similar projects..." />;
  else if (error) results = <p className="muted small">Similar projects could not be loaded.</p>;
  else if (projects.length === 0) results = <p className="muted small">No similar projects were found.</p>;
  else results = <SimilarList projects={projects} />;

  return (
    <>
      <div className="proj-similar-search">
        <input
          type="search"
          aria-label="Search other projects"
          placeholder="Search other projects, e.g. parking sensors"
          value={search}
          maxLength={200}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault(); // do not submit the review
              runSearch();
            }
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={runSearch}>
          <Icon name="search" size={16} /> Search
        </button>
      </div>
      <p className="field-hint">
        {searchWords
          ? `Results for "${searchWords}". Clear the box and press Search to see matches for the title again.`
          : 'Matches for the proposal title. Search words need at least 4 letters.'}
      </p>
      {results}
    </>
  );
}

// The list of similar projects
function SimilarList({ projects }) {
  return (
    <ul className="proj-similar">
      {projects.map((project) => (
        <li key={project.id}>
          <span>
            <strong>{project.title}</strong>
            <span className="meta">
              <span>{project.groupName}</span>
              {project.academicYear && <span>{project.academicYear}</span>}
              <span>Matches: {project.matchedWords.join(', ')}</span>
            </span>
          </span>
          <StatusBadge status={project.status} />
        </li>
      ))}
    </ul>
  );
}

function ReviewForm({ proposal, initialDecision, onClose, onReviewed }) {
  const { user } = useAuth();
  const toast = useToast();
  // The stage decides which feedback is edited: the supervisor's or the examiner's
  const stage = proposal.status === 'Pending Supervisor' ? 'supervisor' : 'examiner';
  const [decision, setDecision] = useState(initialDecision);
  const [feedback, setFeedback] = useState(proposal[`${stage}Feedback`] || '');
  const [feedbackError, setFeedbackError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  let approveResult = 'The proposal is approved and the project starts.';
  if (user.role === 'Administrator') approveResult = 'As administrator you approve it directly; the project starts.';
  else if (stage === 'supervisor') approveResult = 'The proposal goes to the examiner for the final review.';

  async function handleSubmit(event) {
    event.preventDefault();
    // UC16 / UC17 exceptional flow: the feedback field may not be empty
    if (!feedback.trim()) {
      setFeedbackError('Please enter your feedback');
      return;
    }
    setFeedbackError('');
    setFormError('');
    setSaving(true);
    try {
      const result = await reviewProposal(proposal.id, decision, feedback.trim());
      if (decision === 'reject') toast.success('Proposal rejected. The students were notified.');
      else if (result.status === 'Pending Examiner') toast.success('Proposal approved and sent to the examiner.');
      else toast.success('Proposal approved. The project is now in progress.');
      onReviewed();
    } catch (err) {
      if (err.message === 'Please enter your feedback') setFeedbackError(err.message);
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert alert-error">{formError}</div>}

      <div className="proj-review-summary">
        <h3>{proposal.project.title}</h3>
        <div className="meta mb-1">
          <span>{proposal.group.name}</span>
          <StatusBadge status={proposal.status} />
        </div>
        {proposal.project.description && <p className="proj-proposal-description">{proposal.project.description}</p>}
        {proposal.comments && (
          <p className="proj-feedback">
            <strong>Students&apos; comments: </strong>
            {proposal.comments}
          </p>
        )}
      </div>

      <section>
        <p className="proj-section-label">Similar projects</p>
        <SimilarProjects projectId={proposal.project.id} />
      </section>

      <fieldset className="form-field proj-fieldset">
        <legend className="label mb-1">Decision</legend>
        <div className="proj-decision">
          <label className={`proj-decision-option is-approve${decision === 'approve' ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="decision"
              value="approve"
              checked={decision === 'approve'}
              onChange={() => setDecision('approve')}
            />
            <Icon name="check" size={18} /> Approve
          </label>
          <label className={`proj-decision-option is-reject${decision === 'reject' ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="decision"
              value="reject"
              checked={decision === 'reject'}
              onChange={() => setDecision('reject')}
            />
            <Icon name="x" size={18} /> Reject
          </label>
        </div>
        <p className="field-hint">
          {decision === 'approve' ? approveResult : 'The students can improve the project and submit a new proposal.'}
        </p>
      </fieldset>

      <FormField
        id="review-feedback"
        label="Feedback for the students"
        as="textarea"
        rows={5}
        required
        maxLength={5000}
        value={feedback}
        error={feedbackError}
        hint={
          decision === 'reject'
            ? 'Explain what must change.'
            : 'Tell the students what is good and what to watch out for.'
        }
        onChange={(event) => setFeedback(event.target.value)}
      />

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={decision === 'reject' ? 'btn btn-danger' : 'btn btn-primary'} disabled={saving}>
          {saving ? 'Saving...' : decision === 'reject' ? 'Reject proposal' : 'Approve proposal'}
        </button>
      </div>
    </form>
  );
}

export default function ReviewProposalModal({ proposal, initialDecision = 'approve', onClose, onReviewed }) {
  return (
    <Modal open={Boolean(proposal)} onClose={onClose} title="Review proposal" size="large" closeOnBackdrop={false}>
      {proposal && (
        <ReviewForm proposal={proposal} initialDecision={initialDecision} onClose={onClose} onReviewed={onReviewed} />
      )}
    </Modal>
  );
}
