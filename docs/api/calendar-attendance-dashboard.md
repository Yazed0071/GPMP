# Calendar, attendance, dashboard and reminders

This part of GPMP covers scheduling, attendance and the start page:

| Feature | Requirements | Backend | Frontend page |
| --- | --- | --- | --- |
| Calendar: meetings, deadlines, presentations, academic dates, task due dates | FR-13, UC9 Manage Deadlines | `/api/events` | `/calendar` (CalendarPage) |
| Attendance for meetings and presentations | FR-15, UC14 Take Attendance | `/api/attendance` | `/attendance` (AttendancePage) |
| Role-specific dashboard | UI fig 47 | `/api/dashboard` | `/dashboard` (DashboardPage) |
| Deadline and meeting reminders (in-app + email) | FR-20, UC8 | `services/reminders.js` (background job) | notifications ([communication.md](communication.md)) |

All endpoints need a login token (`Authorization: Bearer <token>`) and follow the common rules:
data is returned directly, errors are `{ "error": { "message": "...", "details"?: ... } }`,
keys are camelCase, DATETIME values are ISO strings in UTC, DATE values are `'YYYY-MM-DD'`.

---

## 1. Files

**Backend**

```
src/server/routes/events.routes.js       src/server/controllers/events.controller.js
src/server/routes/attendance.routes.js   src/server/controllers/attendance.controller.js
src/server/routes/dashboard.routes.js    src/server/controllers/dashboard.controller.js
src/server/services/reminders.js         reminder job + shared event helpers
```

- `events.controller.js` exports `fetchCalendarItems(context, options)`; the dashboard reuses it
  for its "upcoming" lists, so both pages show exactly the same items.
- `services/reminders.js` exports `startReminders()` (called by `server.js`), `runReminders()`
  (one check, handy for tests) and small shared helpers: `dateInAppZone()` (used by the dashboard,
  tasks and submissions), plus `formatEventTime()`, `notificationTypeFor()`, `calendarLinkFor()` and
  `getEventAudience()` (used by the events controller).

**Frontend**

```
src/client/api/events.js, attendance.js, dashboard.js      API functions
src/client/pages/CalendarPage.jsx, AttendancePage.jsx, DashboardPage.jsx
src/client/components/calendar/    MonthGrid, EventChip, AgendaList, ItemRow, DayItemsModal, EventFormModal,
                                   EventDetailsModal, CalendarCountdown, UpcomingList, DateTile, calendarUtils.js
src/client/components/attendance/  SessionList, TakeAttendance, AttendanceSummary, AttendanceCounts, MyAttendance
src/client/components/dashboard/   DashboardHero, StudentDashboard, StaffDashboard, AdminDashboard,
                                   ProgressList, ActivityFeed, AnnouncementList, Breakdown
src/client/styles/calendar.css (cal-), attendance.css (att-), dashboard.css (dash-)
```

`UpcomingList` and `DateTile` (calendar components) are reused by the dashboard and attendance pages;
they import `calendar.css` themselves.

---

## 2. Time zone

The database and the API work in **UTC**. The university's time zone is used only where the server
has to write a time into a text or decide what "today" / "tomorrow" means (notification texts,
reminders, task due dates, "days left"). It is `Asia/Riyadh` by default and can be changed with an
optional `APP_TIME_ZONE=...` line in `.env` (read by `config/env.js`; the server refuses to start
with a clear message when the name is not a valid time zone, e.g. `Asia/Riyad`). The frontend always shows
times in the browser's local time.

---

## 3. Calendar events — `/api/events` (FR-13, UC9)

### 3.1 Who may do what

| Action | Shared academic calendar (`groupId` null) | A group calendar |
| --- | --- | --- |
| See events | everybody | people with access to the group (its students, supervisor, examiner, admins) |
| Add | Administrator | the group's Supervisor or an Administrator; **students of the group: type `Meeting` only** |
| Change / delete | Administrator | the group's Supervisor or an Administrator; **the student who created a meeting, only before it starts** |

Examiners can see their groups' calendars but cannot add events. A student who created a meeting
can change or delete it until it starts, but not into another type. Once a meeting has started, its
attendance belongs to the supervisor (FR-15, UC14), so the student can no longer move or delete it.
The calendar of an **Archived** project (FR-8) can only be changed by an administrator: adding an event
answers 409 `This project is archived. Only the administrator can change it.`, and its events come with
`canEdit: false` (changing or deleting them answers 403).

### 3.2 Calendar item shape

`GET /api/events` returns events **and** task due dates (FR-14) as one list sorted by date:

```json
{
  "id": 9,                        // a number for events, "task-5" for task due dates
  "source": "event",              // "event" | "task"
  "title": "Weekly Supervision Meeting",
  "description": "Review of the database implementation...",
  "type": "Meeting",              // Deadline | Meeting | Presentation | Academic | Task
  "priority": "Medium",           // Low | Medium | High (null for tasks)
  "eventDate": "2026-09-30T07:00:00.000Z",   // tasks: the plain due date "2026-10-03"
  "endDate": "2026-09-30T08:00:00.000Z",     // or null
  "allDay": false,                // true for tasks (a due date has no time)
  "location": "Building B, Room 214",
  "groupId": 1,                   // null = shared academic calendar
  "groupName": "Team Alpha",
  "isShared": false,
  "createdBy": { "id": 2, "name": "Dr. Ahmed Alotaibi" },   // null for tasks
  "link": "/calendar?groupId=1&date=2026-09-30",           // tasks: "/tasks/5"
  "canEdit": false,               // may the current user change/delete it
  "reminderSent": false,          // events only
  "createdAt": "...", "updatedAt": null,                   // events only
  "status": "In Progress", "isMilestone": false, "taskId": 5  // tasks only
}
```

### 3.3 Endpoints

| Method and path | Who | What |
| --- | --- | --- |
| `GET /api/events?from=&to=&groupId=` | everyone | Items overlapping the range. Without `groupId`: shared calendar + all the user's groups (all groups for admins). With `groupId`: shared calendar + that group (403 if not yours). `from`/`to` are ISO date-times or `YYYY-MM-DD` (a plain date = that UTC day). Multi-day events are included on every day they overlap. |
| `GET /api/events/conflicts?eventDate=&endDate=&groupId=&excludeId=` | everyone | UC9: other events whose time overlaps on the **same** calendar, and for supervisors also on the calendars of their other groups (so they are warned about double-booking themselves; only calendars the user can already see are checked) → `{ conflicts: [{ id, title, type, eventDate, endDate, groupId, groupName }], warning }`. The warning names the calendar, e.g. `... on the Team Alpha calendar.` `warning` is null when there is no conflict. An event without an end counts as 1 hour. |
| `GET /api/events/:id` | people who can see it | One event (item shape above). |
| `POST /api/events` | see 3.1 | Body `{ title, type, priority?, eventDate, endDate?, location?, description?, groupId? }` → **201** with the event + `conflicts` + `warning`. The group's calendar row is created if it is missing. |
| `PUT /api/events/:id` | see 3.1 | Same fields; fields that are not sent keep their value. The calendar (group) cannot be changed. Once attendance was recorded, the start and the type cannot be changed (409). → event + `conflicts` + `warning`. |
| `DELETE /api/events/:id` | see 3.1 | → `{ message: "Event deleted" }`. Attendance recorded for the event is deleted with it (cascade); only the supervisor or an administrator can delete a started meeting. |

Validation messages (400 unless noted):

| Problem | Message |
| --- | --- |
| No title | `Title is required` |
| No start | `Event date is required` |
| Start not a valid date-time | `Please choose a valid date and time for the event.` |
| Start in the past (create, or when the start is moved) | `The event date cannot be in the past.` |
| End not after start | `The end time must be after the start time.` |
| Bad type / priority | `Event type must be one of: Deadline, Meeting, Presentation, Academic` |
| Title / location too long | `Title must be at most 200 characters` |
| Bad range | `Please choose a valid date range.` / `The start of the date range must be before its end.` |
| 403 | `Only administrators can add events to the shared academic calendar.`, `Students can only schedule meetings.`, `Examiners cannot add events to a group calendar.`, `You do not have permission to change this event.`, `You do not have permission to delete this event.`, `You do not have access to this group` |
| 404 | `Event not found` |
| 409 | `Attendance has already been recorded for this meeting, so its date and type cannot be changed.` |
| 409 | `This project is archived. Only the administrator can change it.` (adding an event to an archived project) |

A past event can still be corrected (title, description...) by the supervisor or an administrator,
as long as its start is not moved.

### 3.4 Notifications (FR-20, UC8)

| When | Who is notified (never the person who made the change) | Type | Email |
| --- | --- | --- | --- |
| Event created | group event: the group's students + supervisor (+ examiner for presentations); shared event: every active user | `Meeting` for Meeting/Presentation, else `Deadline` | yes for Deadline and Presentation |
| Start or end changed | same | same | same |
| Event deleted (if it had not ended yet) | same | same | same |

Titles look like `New meeting: Weekly Supervision Meeting`, `Presentation rescheduled: ...`,
`Deadline cancelled: ...`; the message says the calendar, the time (university time zone) and the
location. The link opens the calendar at that month: `/calendar?groupId=1&date=2026-10-10`.

---

## 4. Attendance — `/api/attendance` (FR-15, UC14)

A **session** is a `Meeting` or `Presentation` event on a group calendar. Attendance can only be
recorded once the session has started. Statuses: `Present`, `Absent`, `Late`, `Excused`.

**Attendance rate** = (Present + Late) ÷ (Present + Late + Absent) × 100, rounded. Excused sessions do
not count against the student. `null` when nothing counts yet.

| Method and path | Who | What |
| --- | --- | --- |
| `GET /api/attendance/sessions?groupId=` | Supervisor, Examiner, Administrator with access to the group | The group's sessions: started ones first (newest first), then upcoming ones (soonest first). Each: `{ id, title, type, eventDate, endDate, location, groupId, hasStarted, canRecord, studentCount, counts: { present, absent, late, excused, notRecorded } }` |
| `GET /api/attendance/sessions/:eventId` | same | `{ id, title, description, type, eventDate, endDate, location, groupId, groupName, hasStarted, canRecord, counts, students: [{ studentId, userId, name, email, status (null = not recorded), recordedAt, recordedBy }] }` |
| `PUT /api/attendance/sessions/:eventId` | the group's **Supervisor** or an **Administrator** | Body `{ records: [{ studentId, status }] }`. Inserts or updates each record; `status: null` removes a record. Saved in one transaction. → the session detail (as GET). |
| `GET /api/attendance/me` | Student | `{ group: { id, name } | null, records: [{ eventId, title, type, eventDate, endDate, location, status, recordedAt }], counts: { present, absent, late, excused, notRecorded }, rate, nextSession: { id, title, type, eventDate, location } | null }` — started sessions of the student's group. |
| `GET /api/attendance/summary?groupId=` | Supervisor, Examiner, Administrator with access | One row per student: `{ studentId, userId, name, email, present, absent, late, excused, notRecorded, sessions, rate }` (`sessions` = sessions that have started; the counts use the records of those same sessions only). |

Messages: `Attendance can only be recorded for meetings that have started.` (400),
`Please mark the attendance of at least one student.` (400),
`One of the students is not a member of this group.` (400),
`Attendance status must be one of: Present, Absent, Late, Excused` (400),
`Attendance is only taken for group meetings and presentations.` (400, e.g. a deadline or a shared event),
`Only the group's supervisor can record attendance.` (403), `Meeting not found` (404),
`Group is required` (400), `You do not have access to this group` (403).

Counts only include students who are **currently** in the group.

---

## 5. Dashboard — `GET /api/dashboard`

One request returns everything the dashboard shows. The shape depends on `role`.
Shared definitions:

- **Group progress** = completed tasks ÷ all tasks of the group, in % (Team Alpha: 7 / 13 = 54%).
- **Announcement visibility** (same rule as the announcements page, see [communication.md](communication.md)): visible when (`TargetRole` is `All` or the user's role,
  or the user is an Administrator) **and** (no group, or a group the user can access); the publisher
  always sees their own. The 3 newest are returned as `{ id, title, excerpt, date, editedAt, targetRole, groupId, groupName, publisherName }`.
- **upcoming** = the next 5 calendar items (item shape of section 3.2) from now on: events that
  have not ended + tasks that are not Completed. Students/supervisors/examiners: shared calendar + their
  groups. Administrators: the shared academic calendar only.
- **recentActivity** = the 6 newest of (at most 3 of each kind): feedback on submissions, submissions,
  document uploads, newly scheduled group events. Item:
  `{ id, kind: 'feedback'|'submission'|'upload'|'event', actor, text, target, date, eventDate?, link, groupId, groupName }`
  and is shown as "**actor** text target", e.g. "**Dr. Ahmed Alotaibi** approved UI Prototype in Figma".
- **unreadMessages** = unread chat messages, the same number as `GET /api/chat/unread-count` (chat notifications are collapsed, e.g. "3 new messages in ...", so this is not a row count); **unreadNotifications** = all unread notifications.

### 5.1 Student

```json
{
  "role": "Student",
  "group": { "id": 1, "name": "Team Alpha", "memberCount": 3, "supervisorName": "...", "examinerName": "..." },
  "project": { "id": 1, "title": "Smart Campus Navigation App", "status": "In Progress" },
  "proposalStatus": "Approved",
  "progress": { "percent": 54, "total": 13, "completed": 7 },
  "milestones": [{ "id": 11, "title": "...", "dueDate": "2026-10-10", "status": "To Do", "progress": 64, "link": "/tasks/11" }],
  "stats": { "tasksCompleted": 7, "pendingDeadlines": 5, "overdueTasks": 1, "myOpenTasks": 1,
             "unreadMessages": 1, "unreadNotifications": 5 },
  "nextDeadline": { "title": "...", "date": "2026-10-03", "allDay": true, "daysLeft": 5, "source": "task", "link": "/tasks/9" },
  "upcoming": [ ... ], "recentActivity": [ ... ], "announcements": [ ... ]
}
```

- **pendingDeadlines / nextDeadline**: unfinished tasks (`To Do`, `In Progress`) due today or later
  and upcoming `Deadline` events (group or shared). `daysLeft` is counted in the university time zone.
- **Milestone progress**: share of the tasks due on or before the milestone's date that are completed
  (a completed milestone is 100%).
- A student **without a group** gets `group`, `project`, `nextDeadline` = null, zero counts, empty
  `milestones` / `recentActivity`, and the shared academic calendar in `upcoming`.

### 5.2 Supervisor

```json
{
  "role": "Supervisor",
  "groups": [{ "id": 1, "name": "Team Alpha", "projectId": 1, "projectTitle": "...", "projectStatus": "In Progress",
               "proposalStatus": "Approved", "memberCount": 3, "progress": 54, "totalTasks": 13, "completedTasks": 7,
               "overdueTasks": 1, "pendingSubmissions": 1, "supervisorName": "...", "examinerName": "..." }],
  "stats": { "groups": 2, "pendingProposals": 0, "submissionsToReview": 1, "upcomingMeetings": 1,
             "unreadMessages": 1, "unreadNotifications": 3 },
  "upcoming": [ ... ], "recentActivity": [ ... ], "announcements": [ ... ]
}
```

`pendingProposals` = proposals with status `Pending Supervisor`; `submissionsToReview` (and each group's
`pendingSubmissions`) = tasks with status `Submitted`, i.e. one per task whose newest submission waits for
feedback (an older attempt the student replaced is not counted); `upcomingMeetings` = meetings and
presentations of the groups in the next 7 days.

### 5.3 Examiner

Same as the supervisor, but `stats` is
`{ groups, pendingProposals (status 'Pending Examiner'), upcomingPresentations (all future presentations of the groups), unreadMessages, unreadNotifications }`.

### 5.4 Administrator

```json
{
  "role": "Administrator",
  "stats": {
    "usersByRole": { "Student": 11, "Supervisor": 3, "Examiner": 2, "Administrator": 1 },
    "totalUsers": 17, "activeUsers": 17,
    "groups": 4, "groupsWithoutSupervisor": 1, "groupsWithoutExaminer": 1,
    "studentsWithoutGroup": 1, "availableSupervisors": 2,   // active, available and with a free place
    "projectsByStatus": { "Proposed": 1, "In Progress": 1, "Completed": 0, "Archived": 1 }, "totalProjects": 3,
    "proposalsByStatus": { "Pending Supervisor": 1, "Pending Examiner": 0, "Approved": 2, "Rejected": 0 },
    "pendingProposals": 1, "unreadMessages": 0, "unreadNotifications": 1
  },
  "attention": [{ "id": 3, "name": "Team Gamma", "memberCount": 2, "issues": ["No supervisor", "No examiner", "No project yet"] }],
  "upcoming": [ ... ],        // shared academic calendar
  "recentActivity": [ ... ],  // all groups
  "announcements": [ ... ]
}
```

`studentsWithoutGroup` counts active students only; proposals are counted per proposal row.

---

## 6. Reminders — `services/reminders.js` (FR-20)

`startReminders()` runs a check **15 seconds after the server starts and then every 10 minutes**
(unless `DISABLE_REMINDERS=1`). It never crashes the server: errors are logged.

1. **Events** starting within the next 24 hours with `ReminderSent = 0` → notification
   `Reminder: <title> is today/tomorrow at 10:00 AM` (type `Meeting` or `Deadline`, **email: true**) to
   the same people as in 3.4, then `ReminderSent = 1`. The row is marked first, so a reminder is never
   sent twice even if two checks overlap; `DeadlineUpdateDate` is kept unchanged.
   Moving an event's start (PUT) sets `ReminderSent = 0` again, so the new time gets its own reminder.
2. **Tasks** due tomorrow (university time zone) with status `To Do` or `In Progress` → the group's
   students get `Reminder: "<task>" is due tomorrow` (type `Deadline`, link `/tasks/<id>`) once per due
   date: the task row is marked first (`ReminderSentFor = DueDate`), so deleting the notification does not
   bring the reminder back, and a changed due date gets a new reminder. `Submitted` tasks are skipped
   (the students already handed them in).

Run one check by hand (from the project folder):

```bash
node --input-type=module -e "import { runReminders } from './src/server/services/reminders.js'; import { pool } from './src/server/config/db.js'; await runReminders(); await pool.end();"
```

---

## 7. Frontend pages

### CalendarPage (`/calendar`)
- Month grid (weeks start on Sunday) with colored chips by type — Deadline red, Meeting blue,
  Presentation purple, Academic green, Task amber (same colors as `StatusBadge`); "+N more" opens the
  day's list. Completed tasks are faded. Multi-day events appear on every day.
- **Agenda** view: the month's items grouped by day.
- Sidebar: **CalendarCountdown** ("Next deadline — N days left") and the upcoming list (90 days).
- Click a day to add an event (if allowed and not in the past); click an item for its details
  (edit / delete when `canEdit`, "Open task" for task items, "Attendance" for started meetings).
- The form checks for conflicts first (UC9): a yellow warning appears and the button becomes
  **Save anyway**.
- Staff filter by group (`GroupSelect` with "All my groups"); students see their group automatically.
- `?groupId=` and `?date=YYYY-MM-DD` in the address open a group / month and highlight the day
  (used by notification links). On phones the chips become dots and tapping a day opens its list.
- Refreshes when a `Meeting` or `Deadline` notification arrives over the socket.

### AttendancePage (`/attendance`)
- Supervisors / admins: `GroupSelect`, tabs **Sessions** and **Summary**. "Take attendance" opens the
  session (`?session=<id>` in the address, so Back works): Present / Absent / Late / Excused per student,
  **Mark all present**, live counts, unsaved changes highlighted, **Undo changes**, **Save attendance**,
  and a confirmation when leaving with unsaved changes.
- Students: **My Attendance** — rate ring, counts, next meeting and all records.

### DashboardPage (`/dashboard`)
- Navy greeting banner ("Good evening, Sara 👋") with the next deadline / what needs attention and a big
  tile (students: project %, staff: number of groups, admins: active users).
- Four StatCards per role, all linking to the related page.
- Students: Project Progress (project + milestones with bars), Upcoming Deadlines & Meetings, Recent
  Activity, Announcements. Supervisors/examiners: Group Progress for every group instead.
  Administrators: Platform Overview (users/projects/proposals breakdown), Needs Attention, Recent
  Activity, Quick Links (Users, Groups, Announcements, Supervisors, Proposals, Calendar), Academic
  Calendar, Announcements.
- Refreshes quietly when a new notification arrives.
