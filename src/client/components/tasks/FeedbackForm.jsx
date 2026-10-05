// FeedbackForm: the supervisor's structured feedback on a submission (FR-11, UC13).
// Decision (Approved / Needs Revision), strengths, improvements and the main comments.
// Used to give new feedback and to edit earlier feedback (UC13 alternative flow).
//
// Props:
//   submissionId  number    the submission being reviewed
//   feedback      object    existing feedback to edit, or null for new feedback
//   onSaved       function  called with the saved feedback
//   onCancel      function  optional; shows a Cancel button
import { useId, useState } from 'react';
import FormField from '../common/FormField.jsx';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createFeedback, updateFeedback } from '../../api/feedback.js';

const DECISIONS = [
  { value: 'Approved', icon: 'check', hint: 'The task will be marked as completed.', className: 'task-decision-approved' },
  { value: 'Needs Revision', icon: 'edit', hint: 'The task goes back to “In Progress”.', className: 'task-decision-revision' },
];

export default function FeedbackForm({ submissionId, feedback, onSaved, onCancel }) {
  const toast = useToast();
  const idPrefix = useId(); // unique ids, because several forms can be on one page
  const [decision, setDecision] = useState(feedback?.decision || '');
  const [strengths, setStrengths] = useState(feedback?.strengths || '');
  const [improvements, setImprovements] = useState(feedback?.improvements || '');
  const [comments, setComments] = useState(feedback?.comments || '');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    // UC13 exceptional flow: empty feedback is not accepted
    const found = {};
    if (!decision) found.decision = 'Please choose a decision.';
    if (!comments.trim()) found.comments = 'Please enter your feedback comments.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const data = { decision, strengths, improvements, comments };
    setSaving(true);
    try {
      const saved = feedback ? await updateFeedback(feedback.id, data) : await createFeedback({ ...data, submissionId });
      toast.success(feedback ? 'Feedback updated' : 'Feedback sent to the students');
      onSaved?.(saved);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form task-feedback-form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert alert-error">{formError}</div>}

      <fieldset className="task-fieldset">
        <legend>
          Decision <span className="required" aria-hidden="true">*</span>
        </legend>
        <div className="task-decision">
          {DECISIONS.map((option) => {
            const selected = decision === option.value;
            return (
              <label
                key={option.value}
                className={`task-decision-option ${option.className}${selected ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-decision`}
                  value={option.value}
                  checked={selected}
                  onChange={() => {
                    setDecision(option.value);
                    setErrors((old) => ({ ...old, decision: undefined }));
                  }}
                />
                <span>
                  <strong>
                    <Icon name={option.icon} size={16} /> {option.value}
                  </strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            );
          })}
        </div>
        {errors.decision && <p className="field-error">{errors.decision}</p>}
      </fieldset>

      <div className="form-row">
        <FormField
          id={`${idPrefix}-strengths`}
          label="Strengths"
          as="textarea"
          rows={3}
          placeholder="What was done well?"
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
        />
        <FormField
          id={`${idPrefix}-improvements`}
          label="Improvements"
          as="textarea"
          rows={3}
          placeholder="What should be improved?"
          value={improvements}
          onChange={(e) => setImprovements(e.target.value)}
        />
      </div>

      <FormField
        id={`${idPrefix}-comments`}
        label="Comments"
        required
        as="textarea"
        rows={4}
        placeholder="Your overall feedback for the students"
        value={comments}
        onChange={(e) => {
          setComments(e.target.value);
          setErrors((old) => ({ ...old, comments: undefined }));
        }}
        error={errors.comments}
      />

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Icon name="send" size={16} />
          {saving ? 'Saving...' : feedback ? 'Save feedback' : 'Send feedback'}
        </button>
      </div>
    </form>
  );
}
