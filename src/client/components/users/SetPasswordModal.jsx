// SetPasswordModal: the administrator gives a user a new password, for example when the user
// cannot receive the "Forgot password" email. Saving also unlocks a locked account (UC1).
//
// Props:
//   user     object    the user whose password is changed (required)
//   onClose  function  closes the modal
//   onSaved  function  called with the server's success message
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import NewPasswordFields from '../auth/NewPasswordFields.jsx';
import { checkNewPassword } from '../auth/passwordPolicy.js';
import { setUserPassword } from '../../api/users.js';
import { setToken } from '../../api/client.js';
import '../../styles/users.css';

export default function SetPasswordModal({ user, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleClose() {
    if (!saving) onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    const found = checkNewPassword(password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const result = await setUserPassword(user.id, password);
      // A new password ends the user's sessions. When admins change their own password,
      // the server sends a new token so this tab stays signed in.
      if (result.token) setToken(result.token);
      onSaved(result.message);
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={handleClose} title="Set a new password" closeOnBackdrop={false}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="users-modal-person">
          <Avatar name={user.name} />
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <div className="alert alert-info">
          <Icon name="info" size={18} />
          <span>
            {user.name} can sign in with the new password right away
            {user.isLocked ? ', and the locked account will be unlocked' : ''}. Share it with them
            privately.
          </span>
        </div>

        {formError && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{formError}</span>
          </div>
        )}

        <NewPasswordFields
          idPrefix="set"
          allowGenerate
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
          disabled={saving}
        />

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Icon name="lock" size={16} /> {saving ? 'Saving...' : 'Save password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
