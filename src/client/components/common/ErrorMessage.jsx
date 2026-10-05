// ErrorMessage: a red box explaining that something failed, with an optional "Try again" button.
//
// Props:
//   error    Error|ApiError|string  the error to show (its .message is used)
//   message  string                 custom text (used instead of the error's message)
//   title    string                 bold first line (default "Something went wrong")
//   onRetry  function               optional; shows a "Try again" button that calls it
//
// Example: if (error) return <ErrorMessage error={error} onRetry={reload} />;
import Icon from './Icon.jsx';

export default function ErrorMessage({ error, message, title = 'Something went wrong', onRetry }) {
  const text =
    message || (typeof error === 'string' ? error : error?.message) || 'Please try again.';

  return (
    <div className="error-message" role="alert">
      <span className="error-message-icon">
        <Icon name="alert" size={22} />
      </span>
      <div className="error-message-text">
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-small" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </button>
      )}
    </div>
  );
}
