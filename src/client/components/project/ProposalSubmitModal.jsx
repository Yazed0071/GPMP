// ProposalSubmitModal: the form a student uses to submit the group's proposal for review (FR-6).
//
// Props:
//   open            boolean
//   onClose         function
//   project         object    { id, title }
//   supervisorName  string    who will review it first
//   onSubmitted     function  called after a successful submit (e.g. reload the page)
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { submitProposal } from '../../api/proposals.js';

export default function ProposalSubmitModal({ open, onClose, project, supervisorName, onSubmitted }) {
  const toast = useToast();
  const [comments, setComments] = useState('');
  const [deadline, setDeadline] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleClose() {
    if (saving) return;
    setFormError('');
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await submitProposal({ projectId: project.id, comments: comments.trim(), deadline: deadline || undefined });
      toast.success('Proposal submitted. Your supervisor has been notified.');
      setComments('');
      setDeadline('');
      onClose();
      onSubmitted?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Submit proposal" closeOnBackdrop={false}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert alert-error">{formError}</div>}
        <div className="alert alert-info">
          <span>
            <strong>{project.title}</strong> will be sent to {supervisorName || 'your supervisor'} for review.
            After the supervisor approves it, the examiner reviews it.
          </span>
        </div>

        <FormField
          id="proposal-comments"
          label="Comments for the reviewers"
          as="textarea"
          rows={4}
          maxLength={5000}
          value={comments}
          hint="Optional: what should the reviewers know? Where can they find the full proposal document?"
          onChange={(event) => setComments(event.target.value)}
        />
        <FormField
          id="proposal-deadline"
          label="Proposal deadline"
          type="date"
          value={deadline}
          hint="Optional: the deadline announced for proposals."
          onChange={(event) => setDeadline(event.target.value)}
        />

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Submitting...' : 'Submit proposal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
