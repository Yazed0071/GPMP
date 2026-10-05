// CalendarPage: meetings, deadlines, presentations, academic dates and task due dates (FR-13, UC9).
// - Month grid (or agenda list) with colored items by type, "+N more" for busy days
// - Sidebar with a countdown to the next deadline and the upcoming items
// - Click a day to add an event (if allowed), click an item for its details
// - Staff can filter by group; ?groupId= and ?date= in the address open a group / month directly
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import GroupSelect from '../components/common/GroupSelect.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import Icon from '../components/common/Icon.jsx';
import MonthGrid from '../components/calendar/MonthGrid.jsx';
import AgendaList from '../components/calendar/AgendaList.jsx';
import UpcomingList from '../components/calendar/UpcomingList.jsx';
import CalendarCountdown from '../components/calendar/CalendarCountdown.jsx';
import EventFormModal from '../components/calendar/EventFormModal.jsx';
import EventDetailsModal from '../components/calendar/EventDetailsModal.jsx';
import DayItemsModal from '../components/calendar/DayItemsModal.jsx';
import { statusColor } from '../components/common/StatusBadge.jsx';
import {
  CALENDAR_TYPES,
  startOfMonth,
  addMonths,
  monthTitle,
  gridRange,
  groupItemsByDay,
  dayKey,
  isPastDay,
  isFinishedTask,
  defaultStartFor,
} from '../components/calendar/calendarUtils.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useMyGroups } from '../hooks/useMyGroups.js';
import { useGroupParam } from '../hooks/useGroupParam.js';
import { getEvents } from '../api/events.js';
import { toDate, todayISO } from '../utils/format.js';
import { canTakeAttendance, isStudent } from '../config/roles.js';
import '../styles/calendar.css';

const VIEWS = [
  { value: 'month', label: 'Month', icon: 'calendar' },
  { value: 'agenda', label: 'Agenda', icon: 'tasks' },
];
const UPCOMING_DAYS = 90; // how far ahead the sidebar looks

// Phones get a simpler interaction: tapping a day opens its list
function isSmallScreen() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { groups } = useMyGroups();
  const [searchParams] = useSearchParams();
  const [groupId, setGroupId] = useGroupParam();

  // A notification link like /calendar?date=2026-10-10 opens that month and highlights the day
  const linkedDay = searchParams.get('date');
  const [month, setMonth] = useState(() => startOfMonth(toDate(linkedDay) || new Date()));
  const [view, setView] = useState('month');

  // A new ?date= in the address (e.g. a notification clicked while this page is open) opens that month
  useEffect(() => {
    const linkedDate = toDate(linkedDay);
    if (linkedDate) setMonth(startOfMonth(linkedDate));
  }, [linkedDay]);

  const [form, setForm] = useState(null); // { event } or { initialStart } while the form is open
  const [selected, setSelected] = useState(null); // item shown in the details dialog
  const [openDay, setOpenDay] = useState(null); // day shown in the "items of this day" dialog

  const role = user.role;
  const studentView = isStudent(role);
  // The calendar of an archived project is kept as it is (FR-8): only admins may add to it
  const editableGroups = role === 'Administrator' ? groups : groups.filter((g) => g.projectStatus !== 'Archived');
  const ownGroupArchived = groups.find((g) => g.id === user.groupId)?.projectStatus === 'Archived';
  // Who may add events: admins, supervisors with (not archived) groups, students in a group (meetings only)
  const canAdd =
    role === 'Administrator' ||
    (role === 'Supervisor' && editableGroups.length > 0) ||
    (studentView && Boolean(user.groupId) && !ownGroupArchived);

  // Items of the visible month grid
  const range = gridRange(month);
  const monthData = useApi(
    () => getEvents({ from: range.from, to: range.to, groupId }),
    [range.from, groupId]
  );

  // Items of the sidebar: from the start of today, up to 90 days ahead
  const upcomingData = useApi(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const until = new Date(now.getTime() + UPCOMING_DAYS * 86400000);
    return getEvents({ from: startOfToday.toISOString(), to: until.toISOString(), groupId });
  }, [groupId]);

  const itemsByDay = useMemo(() => groupItemsByDay(monthData.data || []), [monthData.data]);

  // Upcoming = events that have not ended yet + unfinished tasks due today or later
  const upcoming = useMemo(() => {
    const now = Date.now();
    const today = todayISO();
    return (upcomingData.data || []).filter((item) =>
      item.source === 'task'
        ? item.eventDate >= today && !isFinishedTask(item)
        : new Date(item.endDate || item.eventDate).getTime() >= now
    );
  }, [upcomingData.data]);

  function reloadAll() {
    monthData.reload();
    upcomingData.reload();
  }

  // Someone else added, moved or cancelled an event -> refresh quietly
  useSocketEvent('notification:new', (notification) => {
    if (notification?.type === 'Meeting' || notification?.type === 'Deadline') reloadAll();
  });

  // ----- Opening dialogs -----

  function openCreate(day) {
    setOpenDay(null);
    setForm({ event: null, initialStart: defaultStartFor(day) });
  }

  function handleDayClick(day) {
    const dayItems = itemsByDay[day] || [];
    // On phones, or on days you cannot add to, show the day's list (if there is something)
    if (isSmallScreen() || !canAdd || isPastDay(day)) {
      if (dayItems.length > 0 || (canAdd && !isPastDay(day))) setOpenDay(day);
      return;
    }
    openCreate(day);
  }

  function handleItemClick(item) {
    setOpenDay(null);
    setSelected(item);
  }

  function handleSaved(saved) {
    setForm(null);
    setSelected(null);
    // Jump to the month of the saved event so the user sees it
    const savedMonth = startOfMonth(toDate(saved.eventDate));
    if (savedMonth.getTime() !== month.getTime()) setMonth(savedMonth);
    reloadAll();
  }

  function handleDeleted() {
    setSelected(null);
    reloadAll();
  }

  const isThisMonth = dayKey(month) === dayKey(startOfMonth(new Date()));

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Meetings, deadlines, presentations and academic dates in one place."
        actions={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={() => openCreate(todayISO())}>
              <Icon name="plus" size={18} /> {studentView ? 'Schedule Meeting' : 'Add Event'}
            </button>
          )
        }
      />

      {studentView && !user.groupId && (
        <div className="alert alert-info mb-2">
          <Icon name="info" size={18} />
          <span>You are not in a group yet, so you see the shared academic calendar only.</span>
        </div>
      )}

      {!studentView && groups.length > 0 && (
        <div className="cal-filters">
          <GroupSelect
            id="calendar-group"
            label="Show calendar of"
            value={groupId}
            onChange={setGroupId}
            includeAll
            allLabel={role === 'Administrator' ? 'All groups + academic calendar' : 'All my groups + academic calendar'}
          />
        </div>
      )}

      <div className="cal-layout">
        <Card flush className="cal-card">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button
                type="button"
                className="btn btn-secondary btn-icon btn-small"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
              >
                <Icon name="chevronLeft" size={18} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setMonth(startOfMonth(new Date()))}
                disabled={isThisMonth}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-icon btn-small"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
              >
                <Icon name="chevronRight" size={18} />
              </button>
              <h2 className="cal-month-title" aria-live="polite">
                {monthTitle(month)}
              </h2>
              {monthData.loading && <Loading inline text="" />}
            </div>
            <Tabs tabs={VIEWS} active={view} onChange={setView} ariaLabel="Calendar view" />
          </div>

          {monthData.error ? (
            <div className="cal-error">
              <ErrorMessage error={monthData.error} onRetry={monthData.reload} title="Could not load the calendar" />
            </div>
          ) : view === 'month' ? (
            <MonthGrid
              month={month}
              itemsByDay={itemsByDay}
              onDayClick={handleDayClick}
              onItemClick={handleItemClick}
              onMoreClick={setOpenDay}
              highlightDay={linkedDay}
            />
          ) : monthData.loading && !monthData.data ? (
            <Loading />
          ) : (
            <AgendaList month={month} itemsByDay={itemsByDay} onItemClick={handleItemClick} />
          )}

          <div className="cal-legend" aria-label="Colors">
            {CALENDAR_TYPES.map((type) => (
              <span key={type} className="cal-legend-item">
                <span className={`cal-dot cal-dot-${statusColor(type)}`} aria-hidden="true" /> {type}
              </span>
            ))}
            {canAdd && view === 'month' && (
              <span className="cal-legend-hint hide-mobile">Tip: click a day to add an event.</span>
            )}
          </div>
        </Card>

        <aside className="cal-side">
          {upcomingData.loading ? (
            <Card>
              <Loading text="Loading upcoming items..." />
            </Card>
          ) : upcomingData.error ? (
            <ErrorMessage error={upcomingData.error} onRetry={upcomingData.reload} />
          ) : (
            <>
              <CalendarCountdown items={upcoming} onOpen={handleItemClick} />
              <Card title="Upcoming" subtitle={`Next ${UPCOMING_DAYS} days`} icon="clock" iconColor="blue" flush>
                <UpcomingList items={upcoming.slice(0, 6)} onSelect={handleItemClick} />
              </Card>
            </>
          )}
        </aside>
      </div>

      <DayItemsModal
        day={openDay}
        items={openDay ? itemsByDay[openDay] || [] : []}
        canAdd={canAdd}
        onClose={() => setOpenDay(null)}
        onItemClick={handleItemClick}
        onAdd={openCreate}
      />

      <EventDetailsModal
        item={selected}
        canTakeAttendance={canTakeAttendance(role)}
        onClose={() => setSelected(null)}
        onEdit={(item) => {
          setSelected(null);
          setForm({ event: item });
        }}
        onDeleted={handleDeleted}
      />

      {form && (
        <EventFormModal
          event={form.event}
          initialStart={form.initialStart}
          groups={editableGroups}
          defaultGroupId={editableGroups.some((g) => g.id === groupId) ? groupId : null}
          user={user}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
