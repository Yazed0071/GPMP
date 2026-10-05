// EditFeedbackModal: a reviewer edits the feedback they already gave on a proposal
// (UC16 / UC17 alternative flow: "may edit previously submitted feedback").
//
// Props:
//   proposal  object|null  the proposal (null = closed); proposal.feedbackStage is
//                          'supervisor' or 'examiner' and decides which feedback is edited
//   onClose   function
//   onSaved   function     called after saving
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { updateExaminerFeedback, updateSupervisorFeedback } from '../../api/proposals.js';

function ProposalFeedbackForm({ proposal, onClose, onSaved }) {
  const toast = useToast();
  const isExaminer = proposal.feedbackStage === 'examiner';
  const [feedback, setFeedback] = useState(
    (isExaminer ? proposal.examinerFeedback : proposal.supervisorFeedback) || ''
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!feedback.trim()) {
      setError('Please enter your feedback');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const save = isExaminer ? updateExaminerFeedback : updateSupervisorFeedback;
      await save(proposal.id, feedback.trim());
      toast.success('Feedback updated. The students were notified.');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <p className="muted mb-0">
        {proposal.project.title} · {proposal.group.name}
      </p>
      <FormField
        id="edit-feedback"
        label={isExaminer ? 'Examiner feedback' : 'Supervisor feedback'}
        as="textarea"
        rows={6}
        required
        maxLength={5000}
        value={feedback}
        error={error}
        hint="The students see this feedback on their project page."
        onChange={(event) => setFeedback(event.target.value)}
      />
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save feedback'}
        </button>
      </div>
    </form>
  );
}

export default function EditFeedbackModal({ proposal, onClose, onSaved }) {
  return (
    <Modal open={Boolean(proposal)} onClose={onClose} title="Edit feedback" closeOnBackdrop={false}>
      {proposal && <ProposalFeedbackForm proposal={proposal} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}
