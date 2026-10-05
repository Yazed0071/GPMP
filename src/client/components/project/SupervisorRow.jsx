// SupervisorRow: one editable row of the administrator's supervisors table (FR-5):
// department, maximum number of groups and availability, saved with the row's Save button.
//
// Props:
//   supervisor  object    from GET /api/supervisors
//   onSaved     function  (updatedSupervisor) => called after a successful save
import { useState } from 'react';
import Avatar from '../common/Avatar.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { updateSupervisor } from '../../api/supervisors.js';

export default function SupervisorRow({ supervisor, onSaved }) {
  const toast = useToast();
  const [department, setDepartment] = useState(supervisor.department || '');
  const [maxGroups, setMaxGroups] = useState(String(supervisor.numberOfGroups));
  const [isAvailable, setIsAvailable] = useState(supervisor.isAvailable);
  const [saving, setSaving] = useState(false);

  // The Save button is only active when something was changed
  const changed =
    department.trim() !== (supervisor.department || '') ||
    Number(maxGroups) !== supervisor.numberOfGroups ||
    isAvailable !== supervisor.isAvailable;

  async function handleSave() {
    const max = Number(maxGroups);
    if (!Number.isInteger(max) || max < 1 || max > 20) {
      toast.error('The maximum number of groups must be a whole number from 1 to 20.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSupervisor(supervisor.id, {
        department: department.trim(),
        numberOfGroups: max,
        isAvailable,
      });
      toast.success(`${supervisor.name} was updated.`);
      onSaved(updated);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const idPrefix = `supervisor-${supervisor.id}`;

  return (
    <tr>
      <td>
        <div className="row row-nowrap">
          <Avatar name={supervisor.name} size="small" />
          <div className="proj-person">
            <strong>{supervisor.name}</strong>
            <span className="meta">{supervisor.email}</span>
          </div>
          {!supervisor.isActive && <StatusBadge status="Inactive" />}
        </div>
      </td>
      <td className="proj-sup-dept-cell">
        <label htmlFor={`${idPrefix}-department`} className="sr-only">
          Department of {supervisor.name}
        </label>
        <input
          id={`${idPrefix}-department`}
          type="text"
          maxLength={100}
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        />
      </td>
      <td>
        <StatusBadge status={supervisor.hasCapacity ? 'Available' : 'Full'}>
          {supervisor.currentGroups} / {supervisor.numberOfGroups}
        </StatusBadge>
      </td>
      <td className="proj-sup-max">
        <label htmlFor={`${idPrefix}-max`} className="sr-only">
          Maximum groups for {supervisor.name}
        </label>
        <input
          id={`${idPrefix}-max`}
          type="number"
          min={Math.max(1, supervisor.currentGroups)}
          max={20}
          value={maxGroups}
          onChange={(event) => setMaxGroups(event.target.value)}
        />
      </td>
      <td>
        <label className="checkbox">
          <input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} />
          {isAvailable ? 'Available' : 'Unavailable'}
        </label>
      </td>
      <td className="actions-cell">
        <button type="button" className="btn btn-primary btn-small" onClick={handleSave} disabled={!changed || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
