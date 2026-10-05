// GroupSelect: a drop-down list of the groups the user can open (from useMyGroups).
// Used by group-scoped pages (tasks, documents, calendar, attendance, chat...).
//
// Props:
//   value       number|null  the selected group id (null = none / "all")
//   onChange    function     called with the new group id (a number) or null for "all"
//   label       string       label text (default "Group")
//   id          string       id of the <select> (default "group-select")
//   includeAll  boolean      true = add an "All groups" option at the top (value null)
//   allLabel    string       text of that option (default "All groups")
//   autoSelect  boolean      true (default) = when nothing is selected, pick the first group
//                            automatically (ignored when includeAll is true)
//   hideLabel   boolean      true = label is only read by screen readers
//   disabled    boolean
//
// Example (keeps the choice in the URL as ?groupId=3):
//   const [groupId, setGroupId] = useGroupParam();
//   <GroupSelect value={groupId} onChange={setGroupId} />
import { useEffect } from 'react';
import { useMyGroups } from '../../hooks/useMyGroups.js';

export default function GroupSelect({
  value,
  onChange,
  label = 'Group',
  id = 'group-select',
  includeAll = false,
  allLabel = 'All groups',
  autoSelect = true,
  hideLabel = false,
  disabled = false,
}) {
  const { groups, loading, error } = useMyGroups();
  const hasValue = value !== null && value !== undefined && value !== '';

  // Pick the first group automatically so group pages can load right away
  useEffect(() => {
    if (autoSelect && !includeAll && !hasValue && groups.length > 0) {
      onChange(groups[0].id);
    }
  }, [autoSelect, includeAll, hasValue, groups, onChange]);

  function handleChange(event) {
    const raw = event.target.value;
    onChange(raw === '' ? null : Number(raw));
  }

  let placeholder = null;
  if (loading) placeholder = 'Loading groups...';
  else if (error) placeholder = 'Could not load groups';
  else if (groups.length === 0) placeholder = 'No groups available';

  return (
    <div className="form-field group-select">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <select
        id={id}
        value={hasValue ? String(value) : ''}
        onChange={handleChange}
        disabled={disabled || Boolean(placeholder)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {!placeholder && includeAll && <option value="">{allLabel}</option>}
        {!placeholder && !includeAll && !hasValue && <option value="">Select a group</option>}
        {groups.map((group) => (
          <option key={group.id} value={String(group.id)}>
            {group.projectTitle ? `${group.name} — ${group.projectTitle}` : group.name}
          </option>
        ))}
      </select>
    </div>
  );
}
