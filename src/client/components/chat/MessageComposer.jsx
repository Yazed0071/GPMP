// MessageComposer: the box at the bottom of a conversation for writing a message.
// Enter sends, Shift+Enter starts a new line. The box grows with the text (up to ~5 lines).
// If sending fails, the text stays in the box so the user can try again (UC6 exceptional flow).
//
// Props:
//   onSend       async function(text)  sends the message; throw to keep the text
//   placeholder  string
//   disabled     boolean
import { useLayoutEffect, useRef, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { MAX_MESSAGE_LENGTH } from './chatUtils.js';

export default function MessageComposer({ onSend, placeholder = 'Type a message...', disabled = false }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  // Grow the box to fit the text (max 140px, then it scrolls)
  useLayoutEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
  }, [text]);

  async function submit() {
    const value = text.trim();
    if (!value || sending || disabled) return;
    setSending(true);
    try {
      await onSend(value);
      setText('');
    } catch {
      // The conversation already showed the error; keep the text so nothing is lost
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event) {
    // isComposing: do not send while typing with an input method (e.g. Arabic/Asian keyboards)
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const nearLimit = text.length > MAX_MESSAGE_LENGTH - 200;

  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="chat-composer-box">
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-message"
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={MAX_MESSAGE_LENGTH}
          readOnly={sending}
          disabled={disabled}
        />
        {nearLimit && (
          <span className="chat-composer-count">
            {text.length}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>
      <button
        type="submit"
        className="btn btn-primary btn-icon chat-send"
        disabled={disabled || sending || !text.trim()}
        aria-label={sending ? 'Sending message' : 'Send message'}
        title="Send (Enter)"
      >
        {sending ? <span className="spinner spinner-small" aria-hidden="true" /> : <Icon name="send" size={18} />}
      </button>
    </form>
  );
}
