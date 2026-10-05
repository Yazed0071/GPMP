// PasswordInput: a password box with an eye button that shows or hides the password.
//
// Props:
//   id           string   id of the input (a <label htmlFor={id}> must point to it) (required)
//   invalid      boolean  true = mark the input as wrong (red border, aria-invalid)
//   describedBy  string   ids of hint/error texts that describe the input
//   ref          ref      optional, e.g. to focus the input (React 19 passes it like a prop)
//   ...rest               any other input props: value, onChange, autoComplete, required...
//
// Example:
//   <label htmlFor="login-password">Password</label>
//   <PasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} />
import { useState } from 'react';
import Icon from '../common/Icon.jsx';
import '../../styles/auth.css';

export default function PasswordInput({ id, invalid = false, describedBy, ...rest }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-password">
      <input
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy || undefined}
        autoCapitalize="none"
        spellCheck={false}
        {...rest}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setVisible((isVisible) => !isVisible)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={id}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}
