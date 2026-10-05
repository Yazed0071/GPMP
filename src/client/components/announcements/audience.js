// Who an announcement is for ("audience"), shown as a badge and used by the filter chips (FR-12).
import { statusColor } from '../common/StatusBadge.jsx';

// TargetRole values from the database -> readable names
export const TARGET_ROLE_LABELS = {
  All: 'Everyone',
  Student: 'Students',
  Supervisor: 'Supervisors',
  Examiner: 'Examiners',
};

// "Everyone", "Students", "Team Alpha" or "Team Alpha · Students"
export function audienceLabel(announcement) {
  const roleLabel = TARGET_ROLE_LABELS[announcement.targetRole] || 'Everyone';
  if (!announcement.group) return roleLabel;
  return announcement.targetRole === 'All' ? announcement.group.name : `${announcement.group.name} · ${roleLabel}`;
}

// Badge color: navy for everyone, teal for one group, the role's color for one role
export function audienceColor(announcement) {
  if (announcement.group) return 'teal';
  if (announcement.targetRole === 'All') return 'navy';
  return statusColor(announcement.targetRole);
}

// Sorts audience labels for the filter chips: Everyone, the roles, then the groups (A-Z)
export function sortAudiences(labels) {
  const fixedOrder = Object.values(TARGET_ROLE_LABELS);
  return [...labels].sort((a, b) => {
    const indexA = fixedOrder.includes(a) ? fixedOrder.indexOf(a) : 99;
    const indexB = fixedOrder.includes(b) ? fixedOrder.indexOf(b) : 99;
    return indexA - indexB || a.localeCompare(b);
  });
}
