// AttendanceCounts: small colored badges like "3 present · 1 late · 2 not recorded".
// Statuses with a count of 0 are hidden to keep the row short.
//
// Props:
//   counts  object  { present, absent, late, excused, notRecorded }
import StatusBadge from '../common/StatusBadge.jsx';

const PARTS = [
  { key: 'present', status: 'Present', label: 'present' },
  { key: 'late', status: 'Late', label: 'late' },
  { key: 'absent', status: 'Absent', label: 'absent' },
  { key: 'excused', status: 'Excused', label: 'excused' },
  { key: 'notRecorded', status: 'To Do', label: 'not recorded' },
];

export default function AttendanceCounts({ counts }) {
  const visible = PARTS.filter((part) => counts[part.key] > 0);
  if (visible.length === 0) return <span className="muted small">No students</span>;

  return (
    <span className="att-counts">
      {visible.map((part) => (
        <StatusBadge key={part.key} status={part.status}>
          {counts[part.key]} {part.label}
        </StatusBadge>
      ))}
    </span>
  );
}
