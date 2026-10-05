// ResetPasswordPage: UC2 Reset Password, step 2. Opened from the emailed link
// (/reset-password?token=...). The user chooses a new password and is then sent to the
// login page. An expired or already used link shows a message with a way to get a new one.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import AuthShell from '../components/auth/AuthShell.jsx';
import NewPasswordFields from '../components/auth/NewPasswordFields.jsx';
import { checkNewPassword } from '../components/auth/passwordPolicy.js';
import Loading from '../components/common/Loading.jsx';
import Icon from '../components/common/Icon.jsx';
import { resetPassword } from '../api/auth.js';
import '../styles/auth.css';

const INVALID_LINK = 'This reset link is invalid or has expired. Please request a new one.';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null); // ApiError
  const [saving, setSaving] = useState(false);

  // Without a token the link is broken, so offer to send a new one
  if (!token) {
    return (
      <AuthShell title="Reset link not valid" subtitle={INVALID_LINK}>
        <div className="auth-actions">
          <Link to="/forgot-password" className="btn btn-primary">
            <Icon name="mail" size={16} /> Request a new link
          </Link>
          <Link to="/login" className="btn btn-secondary">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError(null);
    const found = checkNewPassword(password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const result = await resetPassword(token, password);
      toast.success(result.message);
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(err);
      setSaving(false);
    }
  }

  // Errors about the link itself have no "field" detail; password rule errors do
  const linkProblem = serverError && !serverError.details?.field;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick a password you have not used before. You will use it the next time you sign in."
      footer={
        <Link to="/login" className="auth-back-link">
          <Icon name="arrowLeft" size={16} /> Back to sign in
        </Link>
      }
    >
      <form className="form auth-form" onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <strong>{serverError.message}</strong>
              {linkProblem && (
                <p className="auth-alert-note">
                  <Link to="/forgot-password">Request a new reset link</Link>
                </p>
              )}
            </div>
          </div>
        )}

        <NewPasswordFields
          idPrefix="reset"
          password={password}
          confirm={confirm}
          onPasswordChange={(value) => {
            setPassword(value);
            setErrors((old) => ({ ...old, password: undefined }));
          }}
          onConfirmChange={(value) => {
            setConfirm(value);
            setErrors((old) => ({ ...old, confirm: undefined }));
          }}
          errors={errors}
        />

        <button type="submit" className="btn btn-dark btn-large btn-block auth-submit" disabled={saving}>
          {saving ? (
            <Loading inline text="Saving..." />
          ) : (
            <>
              <Icon name="lock" size={18} /> Save new password
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
