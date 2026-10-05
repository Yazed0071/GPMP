// FeedbackCard: shows one piece of structured feedback (FR-11): the decision, strengths,
// improvements and comments, who gave it and when. The author can switch it into edit mode.
//
// Props:
//   feedback  object    { id, decision, strengths, improvements, comments, givenBy, createdAt, isEdited }
//   canEdit   boolean   true = show the Edit button (only for the feedback's author)
//   onEdit    function  called when Edit is clicked
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { formatDateTime } from '../../utils/format.js';

export default function FeedbackCard({ feedback, canEdit = false, onEdit }) {
  const approved = feedback.decision === 'Approved';
  const author = feedback.givenBy?.name || 'Former user';

  return (
    <article className={approved ? 'task-feedback' : 'task-feedback task-feedback-revision'}>
      <header className="task-feedback-header">
        <Avatar name={author} size="small" />
        <div className="task-feedback-author">
          <strong>{author}</strong>
          <span className="tiny muted">
            {formatDateTime(feedback.createdAt)}
            {feedback.isEdited && ' · edited'}
          </span>
        </div>
        <StatusBadge status={feedback.decision} dot />
        {canEdit && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
            <Icon name="edit" size={14} /> Edit
          </button>
        )}
      </header>

      {(feedback.strengths || feedback.improvements) && (
        <div className="task-feedback-sections">
          {feedback.strengths && (
            <section className="task-feedback-section task-feedback-strengths">
              <h4>
                <Icon name="star" size={14} /> Strengths
              </h4>
              <p>{feedback.strengths}</p>
            </section>
          )}
          {feedback.improvements && (
            <section className="task-feedback-section task-feedback-improvements">
              <h4>
                <Icon name="trendingUp" size={14} /> Improvements
              </h4>
              <p>{feedback.improvements}</p>
            </section>
          )}
        </div>
      )}

      <section className="task-feedback-section">
        <h4>
          <Icon name="chat" size={14} /> Comments
        </h4>
        <p>{feedback.comments}</p>
      </section>
    </article>
  );
}
