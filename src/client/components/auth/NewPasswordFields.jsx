// NewPasswordFields: the "new password" and "confirm password" boxes with the live password
// rules. Used by the reset-password page, the profile page and the administrator's user forms,
// so choosing a password looks and works the same everywhere.
//
// Props:
//   idPrefix          string    start of the input ids, e.g. "reset" -> "reset-password", "reset-confirm"
//   password          string    value of the first box
//   confirm           string    value of the second box
//   onPasswordChange  function  called with the new text of the first box
//   onConfirmChange   function  called with the new text of the second box
//   errors            object    { password?, confirm? } error texts to show under the boxes
//   label             string    label of the first box (default "New password")
//   allowGenerate     boolean   shows a "Generate" button that fills in a random strong password
//   disabled          boolean   disables both boxes
import { useState } from 'react';
import Icon from '../common/Icon.jsx';
import PasswordInput from './PasswordInput.jsx';
import PasswordRules from './PasswordRules.jsx';
import { generatePassword } from './passwordPolicy.js';
import '../../styles/auth.css';

export default function NewPasswordFields({
  idPrefix,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  errors = {},
  label = 'New password',
  allowGenerate = false,
  disabled = false,
}) {
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const passwordId = `${idPrefix}-password`;
  const confirmId = `${idPrefix}-confirm`;
  const rulesId = `${idPrefix}-rules`;

  function handleGenerate() {
    const newPassword = generatePassword();
    setGenerated(newPassword);
    setCopied(false);
    onPasswordChange(newPassword);
    onConfirmChange(newPassword);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
    } catch {
      // The browser blocked the clipboard; the password is still visible to copy by hand
    }
  }

  // The generated password is shown only while the box still contains it
  const showGenerated = generated && generated === password;

  return (
    <>
      <div className={`form-field ${errors.password ? 'has-error' : ''}`.trim()}>
        <div className="auth-label-row">
          <label htmlFor={passwordId}>
            {label}
            <span className="required" aria-hidden="true">
              {' '}*
            </span>
          </label>
          {allowGenerate && (
            <button type="button" className="link-button auth-small-link" onClick={handleGenerate} disabled={disabled}>
              <Icon name="refresh" size={14} /> Generate
            </button>
          )}
        </div>
        <PasswordInput
          id={passwordId}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="new-password"
          required
          disabled={disabled}
          invalid={Boolean(errors.password)}
          describedBy={[rulesId, errors.password && `${passwordId}-error`].filter(Boolean).join(' ')}
        />
        {showGenerated && (
          <div className="auth-generated">
            <span>
              Generated password: <code>{generated}</code>
            </span>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleCopy}>
              <Icon name={copied ? 'check' : 'paperclip'} size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        <PasswordRules id={rulesId} password={password} />
        {errors.password && (
          <p className="field-error" id={`${passwordId}-error`}>
            {errors.password}
          </p>
        )}
      </div>

      <div className={`form-field ${errors.confirm ? 'has-error' : ''}`.trim()}>
        <label htmlFor={confirmId}>
          Confirm {label.toLowerCase()}
          <span className="required" aria-hidden="true">
            {' '}*
          </span>
        </label>
        <PasswordInput
          id={confirmId}
          value={confirm}
          onChange={(event) => onConfirmChange(event.target.value)}
          autoComplete="new-password"
          required
          disabled={disabled}
          invalid={Boolean(errors.confirm)}
          describedBy={errors.confirm ? `${confirmId}-error` : undefined}
        />
        {errors.confirm && (
          <p className="field-error" id={`${confirmId}-error`}>
            {errors.confirm}
          </p>
        )}
      </div>
    </>
  );
}
