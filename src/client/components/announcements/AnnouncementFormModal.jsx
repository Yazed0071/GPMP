// AnnouncementFormModal: the pop-up form to publish a new announcement or edit one (UC7).
// Administrators choose the audience: everyone, one role, or one group.
// Supervisors always post to one of their own groups.
// A new announcement can be saved as a draft on this device and finished later (UC7 alternative flow).
//
// Props:
//   open          boolean
//   onClose       function
//   announcement  object|null   null = new announcement, otherwise the one being edited
//   onSaved       function(savedAnnouncement, isNew)
import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import GroupSelect from '../common/GroupSelect.jsx';
import Icon from '../common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useMyGroups } from '../../hooks/useMyGroups.js';
import { createAnnouncement, updateAnnouncement } from '../../api/announcements.js';
import { TARGET_ROLE_LABELS } from './audience.js';

const EMPTY_FORM = { title: '', content: '', audience: 'everyone', groupId: null, groupRole: 'All' };

// Who can be chosen inside one group
const GROUP_ROLE_OPTIONS = [
  { value: 'All', label: 'Everyone in the group' },
  { value: 'Student', label: 'Students only' },
];

// ----- Draft kept in this browser (localStorage can be blocked, so every access is guarded) -----
function draftKey(userId) {
  return `gpmp_announcement_draft_${userId}`;
}
function readDraft(userId) {
  try {
    const saved = localStorage.getItem(draftKey(userId));
    return saved ? { ...EMPTY_FORM, ...JSON.parse(saved) } : null;
  } catch {
    return null;
  }
}
function writeDraft(userId, form) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(form));
    return true;
  } catch {
    return false;
  }
}
function removeDraft(userId) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // nothing to do
  }
}

// Announcement from the API -> form values
function formFromAnnouncement(announcement) {
  if (announcement.group) {
    return {
      title: announcement.title,
      content: announcement.content,
      audience: 'group',
      groupId: announcement.group.id,
      groupRole: announcement.targetRole,
    };
  }
  return {
    title: announcement.title,
    content: announcement.content,
    audience: announcement.targetRole === 'All' ? 'everyone' : announcement.targetRole,
    groupId: null,
    groupRole: 'All',
  };
}

export default function AnnouncementFormModal({ open, onClose, announcement, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const { groups, loading: groupsLoading } = useMyGroups();
  const isAdmin = user.role === 'Administrator';
  const isNew = !announcement;

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Fill the form every time the modal opens
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError('');
    if (announcement) {
      setForm(formFromAnnouncement(announcement));
      setDraftRestored(false);
      return;
    }
    const draft = readDraft(user.id);
    const start = draft || EMPTY_FORM;
    // Supervisors always post to a group
    setForm(isAdmin ? start : { ...start, audience: 'group' });
    setDraftRestored(Boolean(draft));
  }, [open, announcement, user.id, isAdmin]);

  function setField(name, value) {
    setForm((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: undefined }));
  }

  const toGroup = !isAdmin || form.audience === 'group';
  const noGroups = !isAdmin && !groupsLoading && groups.length === 0;

  // Keeps an unusual existing value (e.g. "Examiner" in a group) selectable when editing
  const groupRoleOptions = GROUP_ROLE_OPTIONS.some((o) => o.value === form.groupRole)
    ? GROUP_ROLE_OPTIONS
    : [...GROUP_ROLE_OPTIONS, { value: form.groupRole, label: `${TARGET_ROLE_LABELS[form.groupRole]} only` }];

  // UC7 exceptional flow: incomplete content -> ask for a correction
  function validate() {
    const found = {};
    if (!form.title.trim()) found.title = 'Title is required';
    if (!form.content.trim()) found.content = 'Content is required';
    if (toGroup && !form.groupId) found.groupId = 'Please choose a group';
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  // Form values -> the body the API expects
  function buildPayload() {
    const base = { title: form.title.trim(), content: form.content.trim() };
    if (toGroup) return { ...base, targetRole: form.groupRole, groupId: form.groupId };
    return { ...base, targetRole: form.audience === 'everyone' ? 'All' : form.audience, groupId: null };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const saved = isNew
        ? await createAnnouncement(buildPayload())
        : await updateAnnouncement(announcement.id, buildPayload());
      if (isNew) removeDraft(user.id);
      onSaved(saved, isNew);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveDraft() {
    if (writeDraft(user.id, form)) {
      toast.success('Draft saved on this device. You can finish it later.');
      onClose();
    } else {
      toast.error('The draft could not be saved in this browser.');
    }
  }

  function handleDiscardDraft() {
    removeDraft(user.id);
    setForm(isAdmin ? EMPTY_FORM : { ...EMPTY_FORM, audience: 'group' });
    setDraftRestored(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'New announcement' : 'Edit announcement'}
      size="medium"
      closeOnBackdrop={false}
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert alert-error">{formError}</div>}

        {draftRestored && (
          <div className="alert alert-info ann-draft-note">
            <Icon name="info" size={18} />
            <span>Your saved draft was restored.</span>
            <button type="button" className="link-button" onClick={handleDiscardDraft}>
              Discard draft
            </button>
          </div>
        )}

        {noGroups && (
          <div className="alert alert-warning">You can post announcements once you supervise a group.</div>
        )}

        <FormField
          id="ann-title"
          label="Title"
          required
          maxLength={200}
          placeholder="e.g. Final report submission deadline"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          error={errors.title}
        />

        <FormField
          id="ann-content"
          label="Content"
          as="textarea"
          required
          rows={6}
          maxLength={10000}
          placeholder="Write the details your audience needs to know..."
          value={form.content}
          onChange={(e) => setField('content', e.target.value)}
          error={errors.content}
        />

        {isAdmin && (
          <FormField id="ann-audience" label="Who should see it?">
            <select id="ann-audience" value={form.audience} onChange={(e) => setField('audience', e.target.value)}>
              <option value="everyone">Everyone</option>
              <option value="Student">All students</option>
              <option value="Supervisor">All supervisors</option>
              <option value="Examiner">All examiners</option>
              <option value="group">One group</option>
            </select>
          </FormField>
        )}

        {toGroup && (
          <div className="form-row">
            <div className={errors.groupId ? 'form-field has-error' : 'form-field'}>
              <GroupSelect id="ann-group" value={form.groupId} onChange={(id) => setField('groupId', id)} />
              {errors.groupId && <p className="field-error">{errors.groupId}</p>}
            </div>
            <FormField id="ann-group-role" label="Who in the group?">
              <select id="ann-group-role" value={form.groupRole} onChange={(e) => setField('groupRole', e.target.value)}>
                {groupRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        )}

        <p className="field-hint ann-email-hint">
          <Icon name="mail" size={14} /> Everyone in the audience receives a notification and an email.
        </p>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {isNew && (
            <button type="button" className="btn btn-secondary" onClick={handleSaveDraft} disabled={saving}>
              Save draft
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving || noGroups}>
            {saving ? 'Saving...' : isNew ? 'Publish' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
