// TakeAttendance: mark each student of a meeting as Present, Absent, Late or Excused (UC14).
// Changes stay on screen until "Save attendance" is clicked, so they can still be corrected
// before saving (UC14 alternative flow). Clicking the chosen status again clears it.
//
// Props:
//   sessionId  number    the meeting / presentation (important_date id)
//   onBack     function  back to the list of sessions
//   onSaved    function  called after attendance was saved (e.g. to refresh the list)
import { useState } from 'react';
import Card from '../common/Card.jsx';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import Loading from '../common/Loading.jsx';
import ErrorMessage from '../common/ErrorMessage.jsx';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import AttendanceCounts from './AttendanceCounts.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { getSession, saveAttendance, ATTENDANCE_STATUSES } from '../../api/attendance.js';
import { formatDateTime, timeAgo, plural } from '../../utils/format.js';

export default function TakeAttendance({ sessionId, onBack, onSaved }) {
  const toast = useToast();
  const { data: session, loading, error, reload, setData } = useApi(() => getSession(sessionId), [sessionId]);
  const [changes, setChanges] = useState({}); // studentId -> new status (null = clear), not saved yet
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading text="Loading the attendance list..." />;
  if (error) {
    // UC14 exceptional flow: attendance cannot be recorded while the page fails to load
    return (
      <>
        <button type="button" className="link-button mb-2" onClick={onBack}>
          <Icon name="arrowLeft" size={16} /> Back to sessions
        </button>
        <ErrorMessage error={error} onRetry={reload} title="The attendance list could not be loaded" />
      </>
    );
  }

  const readOnly = !session.canRecord;
  const changedCount = Object.keys(changes).length;
  const statusOf = (student) => (student.studentId in changes ? changes[student.studentId] : student.status);

  // Counts including the unsaved changes, so the summary updates while clicking
  const liveCounts = { present: 0, absent: 0, late: 0, excused: 0, notRecorded: 0 };
  session.students.forEach((student) => {
    const status = statusOf(student);
    if (status) liveCounts[status.toLowerCase()] += 1;
    else liveCounts.notRecorded += 1;
  });

  function setStatus(student, status) {
    setChanges((old) => {
      const current = student.studentId in old ? old[student.studentId] : student.status;
      const wanted = current === status ? null : status; // a second click clears the choice
      const next = { ...old };
      if (wanted === student.status) delete next[student.studentId]; // back to the saved value
      else next[student.studentId] = wanted;
      return next;
    });
  }

  function markAllPresent() {
    const next = {};
    session.students.forEach((student) => {
      if (student.status !== 'Present') next[student.studentId] = 'Present';
    });
    setChanges(next);
  }

  async function handleSave() {
    const records = Object.entries(changes).map(([studentId, status]) => ({ studentId: Number(studentId), status }));
    if (records.length === 0) return;
    setSaving(true);
    try {
      const updated = await saveAttendance(sessionId, records);
      setData(updated);
      setChanges({});
      toast.success('Attendance saved');
      onSaved?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const backButton =
    changedCount > 0 ? (
      <ConfirmButton
        onConfirm={onBack}
        className="link-button"
        title="Leave without saving?"
        message="Your attendance changes have not been saved yet."
        confirmLabel="Leave"
        cancelLabel="Stay"
      >
        <Icon name="arrowLeft" size={16} /> Back to sessions
      </ConfirmButton>
    ) : (
      <button type="button" className="link-button" onClick={onBack}>
        <Icon name="arrowLeft" size={16} /> Back to sessions
      </button>
    );

  return (
    <div className="att-take">
      <div className="att-take-header">
        {backButton}
        <h2>{session.title}</h2>
        <div className="meta">
          <StatusBadge status={session.type} />
          <span>
            <Icon name="clock" size={14} /> {formatDateTime(session.eventDate)}
          </span>
          {session.location && (
            <span>
              <Icon name="mapPin" size={14} /> {session.location}
            </span>
          )}
          <span>{session.groupName}</span>
        </div>
      </div>

      {!session.hasStarted && (
        <div className="alert alert-info mb-2">
          <Icon name="info" size={18} /> Attendance can only be recorded for meetings that have started.
        </div>
      )}
      {session.hasStarted && readOnly && (
        <div className="alert alert-info mb-2">
          <Icon name="info" size={18} /> Only the group's supervisor can record attendance for this session.
        </div>
      )}

      <Card
        title="Students"
        subtitle={readOnly ? undefined : 'Choose a status for each student, then save.'}
        icon="users"
        actions={
          !readOnly &&
          session.students.length > 0 && (
            <button type="button" className="btn btn-secondary btn-small" onClick={markAllPresent} disabled={saving}>
              <Icon name="check" size={16} /> Mark all present
            </button>
          )
        }
        flush
      >
        {session.students.length === 0 ? (
          <EmptyState compact icon="users" title="This group has no students yet" />
        ) : (
          <ul className="att-students">
            {session.students.map((student) => {
              const current = statusOf(student);
              const changed = student.studentId in changes;
              return (
                <li key={student.studentId} className={changed ? 'att-student att-student-changed' : 'att-student'}>
                  <Avatar name={student.name} />
                  <div className="att-student-text">
                    <strong>{student.name}</strong>
                    <span className="meta">
                      {changed ? (
                        <span className="text-warning">Not saved yet</span>
                      ) : student.recordedAt ? (
                        <span>
                          Recorded {timeAgo(student.recordedAt)}
                          {student.recordedBy ? ` by ${student.recordedBy}` : ''}
                        </span>
                      ) : (
                        <span>Not recorded</span>
                      )}
                    </span>
                  </div>
                  <div className="att-status-group" role="group" aria-label={`Attendance of ${student.name}`}>
                    {ATTENDANCE_STATUSES.map((status) => {
                      const active = current === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          className={`att-status att-status-${status.toLowerCase()}${active ? ' active' : ''}`}
                          aria-pressed={active}
                          disabled={readOnly || saving}
                          onClick={() => setStatus(student, status)}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="att-take-footer">
          <AttendanceCounts counts={liveCounts} />
          {!readOnly && (
            <div className="att-take-actions">
              {changedCount > 0 && <span className="small text-warning">{plural(changedCount, 'unsaved change')}</span>}
              {changedCount > 0 && (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setChanges({})} disabled={saving}>
                  Undo changes
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || changedCount === 0}>
                <Icon name="check" size={18} /> {saving ? 'Saving...' : 'Save attendance'}
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
