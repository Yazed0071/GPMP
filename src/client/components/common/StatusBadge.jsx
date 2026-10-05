// StatusBadge: a small colored label for a status, e.g. "In Progress", "Approved", "High".
// Every status value used in the database has a fixed color, so the same status always
// looks the same on every page.
//
// Props:
//   status     string  the status text, e.g. "Pending Supervisor" (required)
//   children   node    optional label to show instead of the status text
//   dot        boolean true = show a small colored dot before the text
//   className  string  extra CSS classes
//
// Example: <StatusBadge status={task.status} />
//
// Also exported: statusColor(status) -> "green" | "amber" | ... (to color other things alike)

const STATUS_COLORS = {
  // Project status
  Proposed: 'blue',
  'In Progress': 'amber',
  Completed: 'green',
  Archived: 'gray',
  // Proposal status
  'Pending Supervisor': 'amber',
  'Pending Examiner': 'purple',
  Approved: 'green',
  Rejected: 'red',
  // Task / submission status
  'To Do': 'gray',
  Submitted: 'blue',
  'Needs Revision': 'orange',
  Overdue: 'red',
  Milestone: 'purple',
  // Attendance
  Present: 'green',
  Absent: 'red',
  Late: 'amber',
  Excused: 'blue',
  // Priority
  Low: 'teal',
  Medium: 'amber',
  High: 'red',
  // Calendar event types
  Deadline: 'red',
  Meeting: 'blue',
  Presentation: 'purple',
  Academic: 'green',
  // Accounts and availability
  Active: 'green',
  Inactive: 'gray',
  Available: 'green',
  Unavailable: 'gray',
  Full: 'amber',
  // Roles
  Student: 'blue',
  Supervisor: 'teal',
  Examiner: 'purple',
  Administrator: 'navy',
  // Resource categories
  Tutorial: 'blue',
  Tool: 'teal',
  Framework: 'purple',
  Library: 'amber',
  Guide: 'green',
  // Chat channels and file categories
  Group: 'teal',
  Staff: 'purple',
  Document: 'blue',
  Submission: 'amber',
  Showcase: 'purple',
  // Notification types
  Announcement: 'blue',
  Message: 'teal',
  Feedback: 'orange',
  Task: 'amber',
  Proposal: 'purple',
  System: 'gray',
};

export function statusColor(status) {
  return STATUS_COLORS[status] || 'gray';
}

export default function StatusBadge({ status, children, dot = false, className = '' }) {
  if (!status && !children) return null;
  return (
    <span className={`badge badge-${statusColor(status)} ${className}`.trim()}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children || status}
    </span>
  );
}
