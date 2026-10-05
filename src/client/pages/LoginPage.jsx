// LoginPage: UC1 Log In (UI fig 41). The user signs in with email and password.
// Wrong details, locked accounts (after 5 failed attempts) and an unreachable server all show
// a clear message. After signing in the user goes back to the page they wanted
// (location.state.from, set by ProtectedRoute) or to the dashboard.
import { useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import AuthShell from '../components/auth/AuthShell.jsx';
import PasswordInput from '../components/auth/PasswordInput.jsx';
import DemoAccounts from '../components/auth/DemoAccounts.jsx';
import FormField from '../components/common/FormField.jsx';
import Loading from '../components/common/Loading.jsx';
import Icon from '../components/common/Icon.jsx';
import { EMAIL_PATTERN } from '../utils/validation.js';
import '../styles/auth.css';

// The box above the form that explains why signing in failed.
// resetState carries the typed email to the forgot-password page, so it is filled in there.
function LoginError({ error, resetState }) {
  const isLocked = error.status === 423;
  const attemptsLeft = error.details?.attemptsLeft;

  return (
    <div className={isLocked ? 'alert alert-warning' : 'alert alert-error'} role="alert">
      <Icon name={isLocked ? 'lock' : 'alert'} size={18} />
      <div>
        <strong>{error.message}</strong>
        {/* Warn before the account gets locked (UC1 exceptional flow) */}
        {attemptsLeft !== undefined && attemptsLeft <= 2 && (
          <p className="auth-alert-note">
            {attemptsLeft === 1 ? '1 attempt' : `${attemptsLeft} attempts`} left before the account is
            locked for 15 minutes. <Link to="/forgot-password" state={resetState}>
              Reset your password?
            </Link>
          </p>
        )}
        {isLocked && (
          <p className="auth-alert-note">
            Forgot your password? <Link to="/forgot-password" state={resetState}>
              Reset it here
            </Link>.
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const passwordRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({}); // messages under the fields
  const [serverError, setServerError] = useState(null); // ApiError from the backend
  const [submitting, setSubmitting] = useState(false);

  // While a saved login is being checked, wait instead of showing the form
  if (loading) return <Loading fullPage text="Loading GPMP..." />;

  // Already signed in (or just signed in): go to the page they wanted, or the dashboard
  if (user) return <Navigate to={location.state?.from || '/dashboard'} replace />;

  function validate() {
    const found = {};
    if (!email.trim()) found.email = 'Please enter your email address.';
    else if (!EMAIL_PATTERN.test(email.trim())) found.email = 'Please enter a valid email address.';
    if (!password) found.password = 'Please enter your password.';
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      toast.success(`Welcome back, ${signedIn.name}!`);
      // Setting the user re-renders this page, and the <Navigate> above opens the next page
    } catch (err) {
      setServerError(err);
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  // Demo helper: fill in the email and move to the password box
  function pickDemoAccount(demoEmail) {
    setEmail(demoEmail);
    setErrors({});
    setServerError(null);
    passwordRef.current?.focus();
  }

  return (
    <AuthShell
      title="Sign in to GPMP"
      subtitle="Enter your university email and password to continue."
      footer={
        <>
          <Link to="/" className="auth-back-link">
            <Icon name="arrowLeft" size={16} /> Back to home
          </Link>
          <span className="auth-help">Need help? Contact your GPMP administrator.</span>
        </>
      }
    >
      <form className="form auth-form" onSubmit={handleSubmit} noValidate>
        {serverError && <LoginError error={serverError} resetState={{ email: email.trim() }} />}

        <FormField
          id="login-email"
          label="University email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          placeholder="name@gpmp.edu"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((old) => ({ ...old, email: undefined }));
          }}
          error={errors.email}
          autoFocus
        />

        <div className={`form-field ${errors.password ? 'has-error' : ''}`.trim()}>
          <div className="auth-label-row">
            <label htmlFor="login-password">Password</label>
            <Link to="/forgot-password" state={{ email: email.trim() }} className="auth-small-link">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            ref={passwordRef}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((old) => ({ ...old, password: undefined }));
            }}
            autoComplete="current-password"
            placeholder="Your password"
            invalid={Boolean(errors.password)}
            describedBy={errors.password ? 'login-password-error' : undefined}
          />
          {errors.password && (
            <p className="field-error" id="login-password-error">
              {errors.password}
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-dark btn-large btn-block auth-submit" disabled={submitting}>
          {submitting ? (
            <Loading inline text="Signing in..." />
          ) : (
            <>
              Sign In <Icon name="arrowRight" size={18} />
            </>
          )}
        </button>
      </form>

      {import.meta.env.DEV && <DemoAccounts onPick={pickDemoAccount} />}
    </AuthShell>
  );
}
