// AttendanceSummary: one table row per student with their attendance counts and rate (FR-15).
//
// Props:
//   rows  array  from GET /api/attendance/summary?groupId=
import Avatar from '../common/Avatar.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ProgressBar from '../common/ProgressBar.jsx';

// Green from 80%, amber from 60%, red below
function rateColor(rate) {
  if (rate >= 80) return 'green';
  if (rate >= 60) return 'amber';
  return 'red';
}

export default function AttendanceSummary({ rows }) {
  if (rows.length === 0) {
    return <EmptyState compact icon="users" title="This group has no students yet" />;
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Present</th>
              <th scope="col">Late</th>
              <th scope="col">Absent</th>
              <th scope="col">Excused</th>
              <th scope="col">Not recorded</th>
              <th scope="col">Attendance rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId}>
                <td>
                  <div className="att-person">
                    <Avatar name={row.name} size="small" />
                    <div>
                      <strong>{row.name}</strong>
                      <div className="meta">{row.email}</div>
                    </div>
                  </div>
                </td>
                <td>{row.present}</td>
                <td>{row.late}</td>
                <td>{row.absent}</td>
                <td>{row.excused}</td>
                <td>{row.notRecorded}</td>
                <td className="att-rate-cell">
                  {row.rate === null ? (
                    <span className="muted small">No records yet</span>
                  ) : (
                    <ProgressBar value={row.rate} showValue size="small" color={rateColor(row.rate)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="att-note">
        Attendance rate = (Present + Late) ÷ (Present + Late + Absent). Excused sessions do not count
        against the student.
      </p>
    </>
  );
}
