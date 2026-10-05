// AttendancePage: attendance for group meetings and presentations (FR-15, UC14 Take Attendance).
// - Supervisors and administrators: choose a group, see its sessions with counts, open one to mark
//   every student Present / Absent / Late / Excused, and see a summary with attendance rates.
// - Students: their own attendance records and rate.
// The address keeps the choices, e.g. /attendance?groupId=1&session=8 (the calendar links here).
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import GroupSelect from '../components/common/GroupSelect.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import SessionList from '../components/attendance/SessionList.jsx';
import TakeAttendance from '../components/attendance/TakeAttendance.jsx';
import AttendanceSummary from '../components/attendance/AttendanceSummary.jsx';
import MyAttendance from '../components/attendance/MyAttendance.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useMyGroups } from '../hooks/useMyGroups.js';
import { useGroupParam } from '../hooks/useGroupParam.js';
import { getSessions, getAttendanceSummary } from '../api/attendance.js';
import { isStudent } from '../config/roles.js';
import '../styles/attendance.css';

const TABS = [
  { value: 'sessions', label: 'Sessions', icon: 'calendar' },
  { value: 'summary', label: 'Summary', icon: 'trendingUp' },
];

// Supervisors and administrators: record and review the attendance of a group
function StaffAttendance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [groupId] = useGroupParam();
  const { groups, loading: groupsLoading, error: groupsError, reload: reloadGroups } = useMyGroups();
  const [tab, setTab] = useState('sessions');

  // The opened session is kept in the address (?session=8) so the browser's Back button works
  const sessionId = Number(searchParams.get('session')) || null;

  const sessionsData = useApi(() => (groupId ? getSessions(groupId) : Promise.resolve([])), [groupId]);
  const summaryData = useApi(
    () => (groupId && tab === 'summary' ? getAttendanceSummary(groupId) : Promise.resolve([])),
    [groupId, tab]
  );

  // Changing the group also closes an opened session (one update, so both changes are kept)
  function handleGroupChange(newGroupId) {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (newGroupId) next.set('groupId', String(newGroupId));
        else next.delete('groupId');
        next.delete('session');
        return next;
      },
      { replace: true }
    );
  }

  function openSession(session) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('session', String(session.id));
      return next;
    });
  }

  function closeSession() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('session');
      return next;
    });
  }

  if (groupsLoading) return <Loading text="Loading your groups..." />;
  if (groupsError) return <ErrorMessage error={groupsError} onRetry={reloadGroups} />;
  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="users"
          title="No groups yet"
          message="Attendance is recorded for the meetings of the groups you supervise."
        />
      </Card>
    );
  }

  // One session opened: the "take attendance" view
  if (sessionId) {
    return (
      <TakeAttendance key={sessionId} sessionId={sessionId} onBack={closeSession} onSaved={sessionsData.reload} />
    );
  }

  return (
    <>
      <div className="att-toolbar">
        <GroupSelect id="attendance-group" value={groupId} onChange={handleGroupChange} />
        <Tabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Attendance views" />
      </div>

      {tab === 'sessions' &&
        (sessionsData.loading ? (
          <Loading text="Loading sessions..." />
        ) : sessionsData.error ? (
          // UC14 exceptional flow: attendance cannot be recorded until the list loads
          <ErrorMessage error={sessionsData.error} onRetry={sessionsData.reload} title="The attendance page could not be loaded" />
        ) : (
          <SessionList sessions={sessionsData.data} groupId={groupId} onOpen={openSession} />
        ))}

      {tab === 'summary' && (
        <Card title="Attendance summary" subtitle="Sessions that have started" icon="trendingUp" iconColor="green" flush>
          {summaryData.loading ? (
            <Loading text="Loading the summary..." />
          ) : summaryData.error ? (
            <div className="att-card-padding">
              <ErrorMessage error={summaryData.error} onRetry={summaryData.reload} />
            </div>
          ) : (
            <AttendanceSummary rows={summaryData.data} />
          )}
        </Card>
      )}
    </>
  );
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [groupId] = useGroupParam();
  const studentView = isStudent(user.role);

  return (
    <>
      <PageHeader
        title={studentView ? 'My Attendance' : 'Attendance'}
        subtitle={
          studentView
            ? 'Your attendance at group meetings and presentations.'
            : 'Record who attended each meeting and presentation, and follow attendance rates.'
        }
        actions={
          !studentView && (
            <Link className="btn btn-secondary" to={groupId ? `/calendar?groupId=${groupId}` : '/calendar'}>
              <Icon name="calendar" size={18} /> Schedule a meeting
            </Link>
          )
        }
      />
      {studentView ? <MyAttendance /> : <StaffAttendance />}
    </>
  );
}
