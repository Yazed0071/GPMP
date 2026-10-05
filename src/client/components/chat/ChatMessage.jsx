// ChatMessage: one message bubble in a conversation (UI fig 48).
// Own messages are on the right (dark bubble); other people's on the left with their avatar.
// The first message of a "run" (same sender, close in time) shows the name, role and time.
//
// Props:
//   message     object    { id, text, date, sender: { id, name, role } }
//   isOwn       boolean   true when the logged-in user sent it
//   showHeader  boolean   show avatar + name + role + time (first message of a run)
//   onDelete    function  optional; shows a delete button on own messages (UC6 alternative flow)
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import { formatTime, formatDateTime } from '../../utils/format.js';

// Turns web addresses in the text into clickable links (React escapes everything else)
function renderText(text) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}

export default function ChatMessage({ message, isOwn, showHeader, onDelete }) {
  const { sender, date, text } = message;

  return (
    <div className={`chat-msg ${isOwn ? 'chat-msg-own' : ''} ${showHeader ? 'chat-msg-first' : ''}`.trim()}>
      {!isOwn && (showHeader ? <Avatar name={sender.name} size="small" /> : <span className="chat-msg-spacer" />)}

      <div className="chat-msg-body">
        {showHeader && (
          <div className="chat-msg-header">
            <span className="chat-msg-name">{isOwn ? 'You' : sender.name}</span>
            {!isOwn && sender.role && <StatusBadge status={sender.role} />}
            <time dateTime={date}>{formatTime(date)}</time>
          </div>
        )}

        <div className="chat-msg-row">
          {isOwn && onDelete && (
            <ConfirmButton
              onConfirm={() => onDelete(message)}
              className="btn btn-ghost btn-icon btn-small chat-msg-delete"
              ariaLabel="Delete message"
              title="Delete message"
              message="Delete this message for everyone in the chat?"
            >
              <Icon name="trash" size={14} />
            </ConfirmButton>
          )}
          <div className="chat-bubble" title={formatDateTime(date)}>
            {renderText(text)}
          </div>
        </div>
      </div>
    </div>
  );
}
