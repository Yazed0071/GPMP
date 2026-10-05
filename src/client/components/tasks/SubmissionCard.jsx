// SubmissionCard: one submission in a task's history (UC5) - who submitted and when,
// the notes, the link, the attached files (with download buttons) and the feedback (UC13).
// The supervisor can give feedback here, and the author of feedback can edit it.
//
// Props:
//   submission       object    from GET /api/tasks/:id (with files and feedback)
//   isLatest         boolean   true for the newest submission (highlighted)
//   canGiveFeedback  boolean   true for the group's supervisor or an admin
//   currentUserId    number    the logged-in user's id (to find their own feedback)
//   onChanged        function  called after feedback was saved (to reload the task)
import { useState } from 'react';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import FeedbackCard from './FeedbackCard.jsx';
import FeedbackForm from './FeedbackForm.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadGroupFile } from '../../api/files.js';
import { fileIconName } from '../../utils/files.js';
import { formatDate, formatDateTime, formatFileSize } from '../../utils/format.js';

export default function SubmissionCard({ submission, isLatest, canGiveFeedback, currentUserId, onChanged }) {
  const toast = useToast();
  const myFeedback = submission.feedback.find((item) => item.givenBy?.id === currentUserId);
  const waitingForReview = submission.status === 'Submitted';

  // The review form starts open on the newest submission that still waits for a review
  const [reviewing, setReviewing] = useState(canGiveFeedback && isLatest && waitingForReview && !myFeedback);
  const [editingId, setEditingId] = useState(null); // id of the feedback being edited
  const [downloadingId, setDownloadingId] = useState(null);

  async function handleDownload(file) {
    setDownloadingId(file.id);
    try {
      await downloadGroupFile(file);
    } catch (err) {
      toast.error(err);
    } finally {
      setDownloadingId(null);
    }
  }

  function handleFeedbackSaved() {
    setReviewing(false);
    setEditingId(null);
    onChanged?.();
  }

  const studentName = submission.submittedBy?.name || 'Former student';

  return (
    <article className={isLatest ? 'task-submission task-submission-latest' : 'task-submission'}>
      <header className="task-submission-header">
        <Avatar name={studentName} size="small" />
        <div className="task-submission-author">
          <strong>{studentName}</strong>
          <span className="tiny muted">Submitted {formatDateTime(submission.submissionDate)}</span>
        </div>
        <div className="task-submission-badges">
          {isLatest && <span className="badge badge-teal">Latest</span>}
          {submission.isLate && (
            <span className="badge badge-red" title={`Due date was ${formatDate(submission.deadline)}`}>
              Late
            </span>
          )}
          <StatusBadge status={submission.status} dot />
        </div>
      </header>

      {submission.notes && <p className="task-submission-notes">{submission.notes}</p>}

      {submission.source && (
        <a className="task-submission-link" href={submission.source} target="_blank" rel="noopener noreferrer">
          <Icon name="link" size={16} />
          <span>{submission.source}</span>
          <Icon name="externalLink" size={14} />
        </a>
      )}

      {submission.files.length > 0 && (
        <ul className="file-list">
          {submission.files.map((file) => (
            <li key={file.id}>
              <Icon name={fileIconName(file.fileName)} size={18} />
              <span className="file-list-name" title={file.fileName}>
                {file.fileName}
              </span>
              <span className="muted small nowrap">{formatFileSize(file.fileSize)}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-small"
                onClick={() => handleDownload(file)}
                disabled={downloadingId === file.id}
                aria-label={`Download ${file.fileName}`}
                title="Download"
              >
                <Icon name="download" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Feedback on this submission (FR-11) */}
      {submission.feedback.map((item) =>
        editingId === item.id ? (
          <div key={item.id} className="task-feedback-editor">
            <FeedbackForm
              submissionId={submission.id}
              feedback={item}
              onSaved={handleFeedbackSaved}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <FeedbackCard
            key={item.id}
            feedback={item}
            canEdit={item.givenBy?.id === currentUserId}
            onEdit={() => setEditingId(item.id)}
          />
        )
      )}

      {canGiveFeedback && !myFeedback && (
        <div className="task-feedback-editor">
          {reviewing ? (
            <>
              <h3 className="task-feedback-title">Give feedback</h3>
              {!isLatest && (
                <p className="field-hint mb-1">
                  This is an older submission, so your decision will not change the task&apos;s status.
                </p>
              )}
              <FeedbackForm
                submissionId={submission.id}
                onSaved={handleFeedbackSaved}
                onCancel={() => setReviewing(false)}
              />
            </>
          ) : (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setReviewing(true)}>
              <Icon name="chat" size={16} /> Give feedback
            </button>
          )}
        </div>
      )}
    </article>
  );
}
