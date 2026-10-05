// ForgotPasswordPage: UC2 Reset Password, step 1. The user enters their email and GPMP sends
// them a reset link. If the email is unknown, the server's error message is shown.
// During development without a real email server, and only on the computer that runs the
// backend, the backend also returns the link (devResetLink), which is shown here so the demo
// still works.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthShell from '../components/auth/AuthShell.jsx';
import FormField from '../components/common/FormField.jsx';
import Loading from '../components/common/Loading.jsx';
import Icon from '../components/common/Icon.jsx';
import { requestPasswordReset } from '../api/auth.js';
import { EMAIL_PATTERN } from '../utils/validation.js';
import '../styles/auth.css';

// "http://localhost:5173/reset-password?token=..." -> "/reset-password?token=..."
// so the link opens inside this app, whatever address the app is running on
function toAppPath(link) {
  try {
    const url = new URL(link);
    return `${url.pathname}${url.search}`;
  } catch {
    return link;
  }
}

export default function ForgotPasswordPage() {
  const location = useLocation();
  // The login page passes the email the user already typed (location.state.email)
  const [email, setEmail] = useState(location.state?.email || '');
  const [fieldError, setFieldError] = useState('');
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { message, devResetLink? } after success

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError('');
    const trimmed = email.trim();
    if (!trimmed) return setFieldError('Please enter your email address.');
    if (!EMAIL_PATTERN.test(trimmed)) return setFieldError('Please enter a valid email address.');
    setFieldError('');

    setSending(true);
    try {
      setResult(await requestPasswordReset(trimmed));
    } catch (err) {
      // e.g. "No account was found with this email address." (UC2 exceptional flow)
      setServerError(err.message);
    } finally {
      setSending(false);
    }
  }

  // Step 2 of the page: the link was sent
  if (result) {
    return (
      <AuthShell title="Check your email" subtitle={result.message}>
        <div className="auth-sent">
          <span className="auth-sent-icon">
            <Icon name="mail" size={26} />
          </span>
          <p>
            We sent a reset link to <strong>{email.trim()}</strong>. It can be used once and expires
            in 30 minutes. Remember to check your spam folder.
          </p>
        </div>

        {result.devResetLink && (
          <div className="alert alert-info auth-dev-link">
            <Icon name="info" size={18} />
            <div>
              <strong>Development mode</strong>
              <p>Emails are only printed in the backend terminal, so here is your reset link:</p>
              <Link to={toAppPath(result.devResetLink)}>
                Open the reset link <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </div>
        )}

        <div className="auth-actions">
          <Link to="/login" className="btn btn-primary">
            <Icon name="arrowLeft" size={16} /> Back to sign in
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  // Step 1: ask for the email address
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email of your GPMP account and we will send you a link to choose a new password."
      footer={
        // UC2 alternative flow: the user remembers the password and goes back
        <Link to="/login" className="auth-back-link">
          <Icon name="arrowLeft" size={16} /> I remember my password — back to sign in
        </Link>
      }
    >
      <form className="form auth-form" onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{serverError}</span>
          </div>
        )}

        <FormField
          id="forgot-email"
          label="University email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="name@gpmp.edu"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldError('');
          }}
          error={fieldError}
          autoFocus
        />

        <button type="submit" className="btn btn-dark btn-large btn-block auth-submit" disabled={sending}>
          {sending ? (
            <Loading inline text="Sending..." />
          ) : (
            <>
              <Icon name="send" size={18} /> Send reset link
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
