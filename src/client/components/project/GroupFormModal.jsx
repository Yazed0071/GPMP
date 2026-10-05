// GroupFormModal: the administrator's form to create or edit a group (UC10): the group name,
// its supervisor and examiner, and its student members.
//
// Props:
//   open     boolean
//   onClose  function
//   group    object|null  the group to edit ({ id, name, supervisor, examiner, members }), or null for a new one
//   onSaved  function     called with the saved group after a successful save
import { useMemo, useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import Loading from '../common/Loading.jsx';
import ErrorMessage from '../common/ErrorMessage.jsx';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createGroup, getAvailableStudents, updateGroup } from '../../api/groups.js';
import { getSupervisors } from '../../api/supervisors.js';
import { getExaminers } from '../../api/examiners.js';
import { plural } from '../../utils/format.js';

// Loads the drop-down options: supervisors, examiners and students without a group
async function loadOptions() {
  const [supervisors, examiners, students] = await Promise.all([
    getSupervisors(),
    getExaminers(),
    getAvailableStudents(),
  ]);
  return { supervisors, examiners, students };
}

// "Dr. Ahmed Alotaibi (2/3 groups)" + a note when the supervisor cannot take this group
function supervisorLabel(supervisor, isCurrent) {
  let label = `${supervisor.name} (${supervisor.currentGroups}/${supervisor.numberOfGroups} groups)`;
  if (!supervisor.hasCapacity && !isCurrent) label += ' - full';
  else if (!supervisor.isAvailable) label += ' - not taking new groups';
  return label;
}

function GroupForm({ group, onCancel, onSaved }) {
  const toast = useToast();
  const { data: options, loading, error, reload } = useApi(loadOptions, []);

  const [name, setName] = useState(group?.name || '');
  const [supervisorId, setSupervisorId] = useState(group?.supervisor ? String(group.supervisor.id) : '');
  const [examinerId, setExaminerId] = useState(group?.examiner ? String(group.examiner.id) : '');
  const [selectedIds, setSelectedIds] = useState(() => (group?.members || []).map((m) => m.studentId));
  const [search, setSearch] = useState('');
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Everyone who can be a member: the current members plus the students without a group
  const candidates = useMemo(() => {
    const current = (group?.members || []).map((member) => ({ ...member, isMember: true }));
    const free = (options?.students || []).filter((s) => !current.some((m) => m.studentId === s.studentId));
    return [...current, ...free];
  }, [group, options]);

  // Deactivated supervisors are hidden, unless one is still assigned to this group
  const supervisorOptions = (options?.supervisors || []).filter(
    (supervisor) => supervisor.isActive || supervisor.id === group?.supervisor?.id
  );

  const visibleCandidates = candidates.filter((student) =>
    `${student.name} ${student.email}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  function toggleStudent(studentId) {
    setSelectedIds((ids) => (ids.includes(studentId) ? ids.filter((id) => id !== studentId) : [...ids, studentId]));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Please enter a group name');
      return;
    }
    setNameError('');
    setFormError('');
    setSaving(true);

    const data = {
      name: name.trim(),
      supervisorId: supervisorId ? Number(supervisorId) : null,
      examinerId: examinerId ? Number(examinerId) : null,
      studentIds: selectedIds,
    };
    try {
      const saved = group ? await updateGroup(group.id, data) : await createGroup(data);
      toast.success(group ? 'Group saved.' : `Group "${saved.name}" created.`);
      onSaved(saved);
    } catch (err) {
      // "A group with this name already exists" belongs next to the name field
      if (err.message === 'A group with this name already exists') setNameError(err.message);
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} onRetry={reload} />;

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert alert-error">{formError}</div>}

      <FormField
        id="group-name"
        label="Group name"
        required
        maxLength={100}
        value={name}
        error={nameError}
        placeholder="e.g. Team Delta"
        onChange={(event) => setName(event.target.value)}
      />

      <div className="form-row">
        <FormField id="group-supervisor" label="Supervisor" hint="Students can also choose their own supervisor.">
          <select id="group-supervisor" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)}>
            <option value="">No supervisor yet</option>
            {supervisorOptions.map((supervisor) => {
              const isCurrent = group?.supervisor?.id === supervisor.id;
              return (
                <option
                  key={supervisor.id}
                  value={String(supervisor.id)}
                  disabled={!supervisor.hasCapacity && !isCurrent}
                >
                  {supervisorLabel(supervisor, isCurrent)}
                </option>
              );
            })}
          </select>
        </FormField>
        <FormField id="group-examiner" label="Examiner" hint="Reviews the proposal after the supervisor.">
          <select id="group-examiner" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}>
            <option value="">No examiner yet</option>
            {options.examiners.map((examiner) => (
              <option key={examiner.id} value={String(examiner.id)}>
                {examiner.name} ({plural(examiner.groupCount, 'group')})
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="form-field">
        <div className="row row-between">
          <label htmlFor="group-student-search">Members</label>
          <span className="muted small">{plural(selectedIds.length, 'student')} selected</span>
        </div>
        <div className="input-with-icon">
          <Icon name="search" size={16} />
          <input
            id="group-student-search"
            type="search"
            placeholder="Search students by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="proj-member-picker" role="group" aria-label="Students">
          {visibleCandidates.length === 0 ? (
            <p className="muted small text-center mt-1 mb-1">
              {candidates.length === 0 ? 'All students are already in a group.' : 'No student matches your search.'}
            </p>
          ) : (
            visibleCandidates.map((student) => (
              <label key={student.studentId} className="proj-member-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(student.studentId)}
                  onChange={() => toggleStudent(student.studentId)}
                />
                <Avatar name={student.name} size="small" />
                <span className="proj-person">
                  <strong>{student.name}</strong>
                  <span className="meta">
                    <span className="truncate">{student.email}</span>
                    {student.major && <span>{student.major}</span>}
                  </span>
                </span>
                {student.isMember && <span className="badge badge-teal">Member</span>}
              </label>
            ))
          )}
        </div>
        <p className="field-hint">
          Only students without a group are listed. Students you untick leave the group.
        </p>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : group ? 'Save changes' : 'Create group'}
        </button>
      </div>
    </form>
  );
}

export default function GroupFormModal({ open, onClose, group = null, onSaved }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? `Edit ${group.name}` : 'New group'}
      size="large"
      closeOnBackdrop={false}
    >
      <GroupForm group={group} onCancel={onClose} onSaved={onSaved} />
    </Modal>
  );
}
