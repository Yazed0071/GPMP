// UserFormModal: the "Add user" and "Edit user" form for administrators.
// When adding, the administrator picks the role first and the fields of that role appear:
// major and GPA for students, department for staff, capacity and availability for supervisors.
// The role of an existing user cannot be changed (the backend refuses it too).
//
// Props:
//   user     object|null  the user to edit, or null to add a new user
//   onClose  function     closes the modal
//   onSaved  function     called with the saved user returned by the server
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Icon from '../common/Icon.jsx';
import NewPasswordFields from '../auth/NewPasswordFields.jsx';
import { checkNewPassword } from '../auth/passwordPolicy.js';
import { createUser, updateUser } from '../../api/users.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';
import { EMAIL_PATTERN } from '../../utils/validation.js';
import '../../styles/users.css';

const ROLE_OPTIONS = [
  { value: 'Student', icon: 'project', hint: 'Works on a project' },
  { value: 'Supervisor', icon: 'supervisor', hint: 'Guides groups' },
  { value: 'Examiner', icon: 'proposal', hint: 'Reviews projects' },
  { value: 'Administrator', icon: 'shield', hint: 'Manages GPMP' },
];

// Fields the server may name in error.details.field; their message is shown under that field
const FIELDS_WITH_ERRORS = ['name', 'email', 'password', 'major', 'gpa', 'department', 'numberOfGroups'];

// The starting values of the form (empty for a new user)
function initialForm(user) {
  return {
    role: user?.role || 'Student',
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    confirm: '',
    major: user?.major || '',
    gpa: user?.gpa !== null && user?.gpa !== undefined ? String(user.gpa) : '',
    department: user?.department || '',
    numberOfGroups: String(user?.numberOfGroups ?? 3),
    isAvailable: user?.isAvailable ?? true,
  };
}

export default function UserFormModal({ user, onClose, onSaved }) {
  const isNew = !user;
  const toast = useToast();
  const [form, setForm] = useState(() => initialForm(user));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Updates one field and hides its old error message
  function setField(field, value) {
    setForm((old) => ({ ...old, [field]: value }));
    setErrors((old) => ({ ...old, [field]: undefined }));
  }

  function handleClose() {
    if (!saving) onClose(); // do not close while saving
  }

  function validate() {
    const found = {};
    if (!form.name.trim()) found.name = 'Please enter the full name.';
    if (!form.email.trim()) found.email = 'Please enter the email address.';
    else if (!EMAIL_PATTERN.test(form.email.trim())) found.email = 'Please enter a valid email address.';

    if (isNew) Object.assign(found, checkNewPassword(form.password, form.confirm));

    if (form.role === 'Student' && form.gpa !== '') {
      const gpa = Number(form.gpa);
      if (!Number.isFinite(gpa) || gpa < 0 || gpa > 5) found.gpa = 'GPA must be a number between 0 and 5.';
    }

    if (form.role === 'Supervisor') {
      const maxGroups = Number(form.numberOfGroups);
      if (!Number.isInteger(maxGroups) || maxGroups < 1 || maxGroups > 20) {
        found.numberOfGroups = 'Please enter a whole number from 1 to 20.';
      } else if (!isNew && user.assignedGroups > maxGroups) {
        found.numberOfGroups = `This supervisor already has ${user.assignedGroups} groups.`;
      }
    }
    return found;
  }

  // Only the fields that belong to the chosen role are sent
  function buildPayload() {
    const data = { name: form.name.trim(), email: form.email.trim() };
    if (isNew) {
      data.role = form.role;
      data.password = form.password;
    }
    if (form.role === 'Student') {
      data.major = form.major.trim();
      data.gpa = form.gpa === '' ? null : Number(form.gpa);
    } else {
      data.department = form.department.trim();
    }
    if (form.role === 'Supervisor') {
      data.numberOfGroups = Number(form.numberOfGroups);
      data.isAvailable = form.isAvailable;
    }
    return data;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const saved = isNew ? await createUser(buildPayload()) : await updateUser(user.id, buildPayload());
      toast.success(isNew ? `${saved.name} has been added.` : 'Your changes have been saved.');
      onSaved(saved);
    } catch (err) {
      const field = err.details?.field;
      if (FIELDS_WITH_ERRORS.includes(field)) setErrors({ [field]: err.message });
      else setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={handleClose} title={isNew ? 'Add user' : 'Edit user'} closeOnBackdrop={false}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{formError}</span>
          </div>
        )}

        {isNew ? (
          <fieldset className="users-role-picker">
            <legend className="label">
              Role
              <span className="required" aria-hidden="true">
                {' '}*
              </span>
            </legend>
            <div className="users-role-options">
              {ROLE_OPTIONS.map((option) => {
                const selected = form.role === option.value;
                return (
                  <label
                    key={option.value}
                    className={selected ? 'users-role-option users-role-option-active' : 'users-role-option'}
                  >
                    <input
                      type="radio"
                      name="user-role"
                      className="sr-only"
                      value={option.value}
                      checked={selected}
                      onChange={() => setField('role', option.value)}
                    />
                    <Icon name={option.icon} size={20} />
                    <span className="users-role-name">{option.value}</span>
                    <span className="users-role-hint">{option.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <div className="users-role-fixed">
            <StatusBadge status={user.role} />
            <span>
              The role cannot be changed. Account created {formatDate(user.createdAt)}.
            </span>
          </div>
        )}

        <div className="form-row">
          <FormField
            id="user-name"
            label="Full name"
            required
            maxLength={100}
            autoComplete="off"
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            error={errors.name}
          />
          <FormField
            id="user-email"
            label="Email"
            type="email"
            required
            maxLength={150}
            autoComplete="off"
            autoCapitalize="none"
            placeholder="name@gpmp.edu"
            value={form.email}
            onChange={(event) => setField('email', event.target.value)}
            error={errors.email}
          />
        </div>

        {isNew && (
          <NewPasswordFields
            idPrefix="user"
            label="Password"
            allowGenerate
            password={form.password}
            confirm={form.confirm}
            onPasswordChange={(value) => setField('password', value)}
            onConfirmChange={(value) => setField('confirm', value)}
            errors={errors}
          />
        )}

        {form.role === 'Student' ? (
          <div className="form-row">
            <FormField
              id="user-major"
              label="Major"
              maxLength={100}
              placeholder="e.g. Software Engineering"
              value={form.major}
              onChange={(event) => setField('major', event.target.value)}
              error={errors.major}
            />
            <FormField
              id="user-gpa"
              label="GPA"
              type="number"
              inputMode="decimal"
              min="0"
              max="5"
              step="0.01"
              placeholder="e.g. 3.50"
              hint="Optional, from 0 to 5."
              value={form.gpa}
              onChange={(event) => setField('gpa', event.target.value)}
              error={errors.gpa}
            />
          </div>
        ) : (
          <FormField
            id="user-department"
            label="Department"
            maxLength={100}
            placeholder={form.role === 'Administrator' ? 'e.g. Deanship of Academic Affairs' : 'e.g. Software Engineering'}
            value={form.department}
            onChange={(event) => setField('department', event.target.value)}
            error={errors.department}
          />
        )}

        {form.role === 'Supervisor' && (
          <div className="form-row">
            <FormField
              id="user-max-groups"
              label="Maximum number of groups"
              type="number"
              inputMode="numeric"
              required
              min="1"
              max="20"
              step="1"
              hint={isNew ? 'How many groups this supervisor can accept.' : `Currently supervising ${user.assignedGroups ?? 0}.`}
              value={form.numberOfGroups}
              onChange={(event) => setField('numberOfGroups', event.target.value)}
              error={errors.numberOfGroups}
            />
            <div className="form-field">
              <span className="label">Availability</span>
              <label className="checkbox users-available">
                <input
                  type="checkbox"
                  checked={form.isAvailable}
                  onChange={(event) => setField('isAvailable', event.target.checked)}
                />
                Available for new groups
              </label>
              <p className="field-hint">Students can only choose available supervisors.</p>
            </div>
          </div>
        )}

        {!isNew && user.role === 'Student' && (
          <p className="field-hint">
            Group: <strong>{user.groupName || 'not in a group yet'}</strong>. Group membership is
            managed on the Groups page.
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create user' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
