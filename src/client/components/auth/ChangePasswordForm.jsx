// ChangePasswordForm: lets a logged-in user change their own password (shown on the profile page).
// The user types the current password once and the new password twice.
// The change signs the user out everywhere else; this tab receives a new login token.
import { useState } from 'react';
import Icon from '../common/Icon.jsx';
import PasswordInput from './PasswordInput.jsx';
import NewPasswordFields from './NewPasswordFields.jsx';
import { checkNewPassword } from './passwordPolicy.js';
import { changePassword } from '../../api/auth.js';
import { setToken } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';

const EMPTY_FORM = { current: '', password: '', confirm: '' };

export default function ChangePasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Updates one field and hides its old error message
  function setField(field, value) {
    setForm((old) => ({ ...old, [field]: value }));
    setErrors((old) => ({ ...old, [field]: undefined }));
  }

  function validate() {
    const found = checkNewPassword(form.password, form.confirm);
    if (!form.current) found.current = 'Please enter your current password.';
    else if (form.current === form.password && !found.password) {
      found.password = 'Your new password must be different from your current password.';
    }
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const result = await changePassword(form.current, form.password);
      // The old token stopped working with the change, so keep the new one
      if (result.token) setToken(result.token);
      toast.success(result.message);
      setForm(EMPTY_FORM);
    } catch (err) {
      // Show the server's message next to the field it is about, when it says which one
      if (err.details?.field === 'currentPassword') setErrors({ current: err.message });
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="alert alert-error" role="alert">
          <Icon name="alert" size={18} />
          <span>{formError}</span>
        </div>
      )}

      <div className={`form-field ${errors.current ? 'has-error' : ''}`.trim()}>
        <label htmlFor="change-current">
          Current password
          <span className="required" aria-hidden="true">
            {' '}*
          </span>
        </label>
        <PasswordInput
          id="change-current"
          value={form.current}
          onChange={(event) => setField('current', event.target.value)}
          autoComplete="current-password"
          required
          disabled={saving}
          invalid={Boolean(errors.current)}
          describedBy={errors.current ? 'change-current-error' : undefined}
        />
        {errors.current && (
          <p className="field-error" id="change-current-error">
            {errors.current}
          </p>
        )}
      </div>

      <NewPasswordFields
        idPrefix="change"
        password={form.password}
        confirm={form.confirm}
        onPasswordChange={(value) => setField('password', value)}
        onConfirmChange={(value) => setField('confirm', value)}
        errors={errors}
        disabled={saving}
      />

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Icon name="lock" size={16} /> {saving ? 'Saving...' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
