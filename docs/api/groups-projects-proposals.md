# Groups, projects, proposals, supervisors, examiners and showcase

This part of GPMP covers **FR-3 to FR-8, FR-18, FR-19** and the use cases **UC10 Manage Groups,
UC11 Choose Supervisor, UC16 Evaluate Proposal, UC17 Proposal Feedback**.

All endpoints are under `/api`, need a logged-in user (`Authorization: Bearer <token>`) and follow
the common conventions: data is returned directly, errors are
`{ "error": { "message": "...", "details"?: ... } }`, keys are camelCase, DATETIME values are ISO
strings in UTC and DATE values are `'YYYY-MM-DD'`.

---

## 1. Business rules in one place

| Rule | Where |
| --- | --- |
| A group name is unique (case-insensitive) → 409 `A group with this name already exists` | UC10, `POST/PUT /groups` |
| A student can be in one group only → 409 `<Name> is already in the group "<Group>".` | UC10 |
| Creating a group also creates its calendar row | `POST /groups` |
| A group with a **Completed** or **Archived** project cannot be deleted (the archive is kept, FR-8/FR-19) → 409 | `DELETE /groups/:id` |
| A supervisor cannot get more groups than `NumberOfGroups` (FR-5) → 409 (admin) / 400 (student); a deactivated supervisor cannot be assigned → 400 `This supervisor account is deactivated.` | groups, supervisors |
| One project per group; only a **student of the group** creates it (FR-3) | `POST /projects` |
| Students edit their project only while **no proposal is Pending or Approved**; the group's supervisor and the admin can always edit | `PUT /projects/:id` |
| The supervisor sets **In Progress ↔ Completed** (not from Proposed, not when Archived); the admin sets any status | `PATCH /projects/:id/status` |
| Only a **Completed** project can be archived (supervisor of the group or admin, FR-8) | `PATCH /projects/:id/archive` |
| A proposal needs a supervisor → 400 `Please choose a supervisor before submitting a proposal.` | `POST /proposals` |
| Only one open proposal (Pending Supervisor / Pending Examiner / Approved) per project → 409 | `POST /proposals` |
| Review flow: `Pending Supervisor` →(supervisor approves)→ `Pending Examiner` →(examiner approves)→ `Approved` (project becomes **In Progress**). Anyone who may review can reject → `Rejected`. The admin approves directly at either pending stage (FR-6). | `PATCH /proposals/:id/review` |
| Every review decision (approve or reject) needs feedback → 400 `Please enter your feedback` (UC16/UC17 exceptional flow); feedback the reviewer saved earlier at that stage counts | review, feedback edits |
| A reviewer may only edit the stage feedback **they** wrote (not a former supervisor's, not the administrator's) → 403 `You can only edit the feedback you wrote.` | feedback edits |
| The documents, tasks, submissions, feedback and calendar of an **Archived** project can only be changed by the administrator → 409 `This project is archived. Only the administrator can change it.` (FR-8; the showcase stays editable) | tasks, files, submissions, feedback, events |
| If the supervisor approves and the group has **no examiner**, every administrator is notified to assign one | review |
| A student may change supervisor **until the supervisor approves** the proposal (no proposal at Pending Examiner / Approved) — UC11 "before final confirmation" | `POST /supervisors/choose` |
| The showcase (video + description) can be edited by the **students of the group** once the project is **Completed or Archived** (FR-18) | `PUT /showcase/:projectId` |
| Completed and Archived projects (with their final documents and video) are visible to **every logged-in user** (FR-19) | `/showcase` |

---

## 2. Groups — `/api/groups` (UC10, FR-4)

### Group summary shape
```json
{
  "id": 1, "name": "Team Alpha", "createdAt": "2026-08-04T15:08:00.000Z",
  "supervisor": { "id": 1, "userId": 2, "name": "Dr. Ahmed Alotaibi", "email": "supervisor1@gpmp.edu", "department": "Software Engineering" },
  "examiner":   { "id": 1, "userId": 5, "name": "Dr. Hessa Aldosari", "email": "examiner1@gpmp.edu", "department": "Software Engineering" },
  "members": [{ "studentId": 1, "userId": 7, "name": "Sara Alqahtani", "email": "student1@gpmp.edu", "major": "Software Engineering" }],
  "project": { "id": 1, "title": "Smart Campus Navigation App", "status": "In Progress" },
  "progress": { "total": 13, "completed": 7, "percent": 54 },
  "latestProposalStatus": "Approved"
}
```
`supervisor`, `examiner` and `project` are `null` when missing. `progress` comes from the task table.

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `GET /groups` | all | Groups the user can access (admin: all), ordered by name → `[summary]` |
| `GET /groups/available-students` | Administrator | Active students without a group → `[{ studentId, userId, name, email, major }]` |
| `GET /groups/:id` | all (group access) | Full detail (below). 404 unknown, 403 no access |
| `POST /groups` | Administrator | `{ name, supervisorId?, examinerId?, studentIds: [] }` → 201 summary |
| `PUT /groups/:id` | Administrator | Same fields; **fields left out stay unchanged**; `studentIds` replaces the member list; `supervisorId: null` / `examinerId: null` removes them → summary |
| `DELETE /groups/:id` | Administrator | → `{ message: "Group deleted" }`. Students become group-less; project, tasks, files (also removed from disk), calendar and chat are deleted |

### `GET /groups/:id` detail
The summary plus:
```json
{
  "project": { "id": 1, "groupId": 1, "groupName": "Team Alpha", "title": "...", "description": "...",
               "status": "In Progress", "academicYear": "2026-2027", "showcaseDescription": null,
               "hasVideo": false, "completedAt": null, "archivedAt": null, "createdAt": "..." },
  "proposals": [ /* proposal objects (section 4), newest first */ ],
  "recentDocuments": [{ "id": 12, "name": "Campus_Buildings_Data.csv", "category": "Document", "version": 1,
                        "size": 185, "uploadedAt": "...", "uploadedBy": "Sara Alqahtani" }],
  "upcomingEvents": [{ "id": 9, "title": "Weekly Supervision Meeting", "type": "Meeting", "priority": "Medium",
                       "eventDate": "...", "endDate": "...", "location": "Building B, Room 214", "isShared": false }],
  "permissions": {
    "canManageGroup": false, "canCreateProject": false, "canEditProject": false,
    "canSubmitProposal": false, "canChooseSupervisor": false, "canChangeStatus": false,
    "canArchive": false, "canEditShowcase": false
  }
}
```
- `recentDocuments`: the 5 newest rows of the `file` table for the group (showcase videos excluded).
  Download them with `GET /api/files/:id/download` (see [tasks-submissions-files.md](tasks-submissions-files.md)).
- `upcomingEvents`: the next 3 events of the group calendar + the shared academic calendar
  (events that have not ended yet).
- `permissions` tells the UI which buttons to show. The endpoints still check every rule.

### Notifications (type `System`) and live rooms
Students added / removed, a newly assigned or removed supervisor, and a newly assigned or removed
examiner are notified. A new examiner of a group whose proposal waits at `Pending Examiner` gets a
`Proposal` notification linking to `/proposals`. `refreshUserRooms()` is called for every affected
user so live chat rooms follow the new membership. Deleting a group notifies its students, supervisor
and examiner.

---

## 3. Projects — `/api/projects` (FR-3, FR-4, FR-8)

The project object is the `project` of the group detail (`hasVideo` instead of the stored file name).

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `GET /projects/similar?projectId=` or `?q=words` (or both) | Supervisor, Examiner, Administrator | UC16: up to 5 other projects sharing keywords (words of 4+ letters) with the title, or with the `q` words the reviewer typed in the review dialog's search box (with both, the project itself is left out) → `[{ id, title, status, academicYear, groupName, matchedWords }]` |
| `GET /projects/:id` | all (group access) | One project |
| `POST /projects` | Student | `{ title, description, academicYear? }` → 201 project (status `Proposed`; year defaults to the current academic year, e.g. `2026-2027`) |
| `PUT /projects/:id` | Student (rules above), Supervisor of the group, Administrator | `{ title, description, academicYear? }` → project |
| `PATCH /projects/:id/status` | Supervisor of the group (`In Progress`/`Completed`), Administrator (any) | `{ status }` → project. `Completed` sets `CompletedAt`; `Archived` sets `ArchivedAt`; `Proposed`/`In Progress` clear both |
| `PATCH /projects/:id/archive` | Supervisor of the group, Administrator | Completed → Archived (+ `ArchivedAt`) → project |

Errors: 400 `You are not in a group yet. The administrator must add you to a group first.`,
409 `Your group already has a project.`, 400 `Project title is required`,
400 `Academic year must look like 2026-2027`, 409 `You cannot edit the project while its proposal is being reviewed.`,
400 `Only completed projects can be archived.`, 403 `Supervisors can only mark a project as In Progress or Completed.`

Status changes notify the group's students (and the supervisor when the admin made the change).

---

## 4. Proposals — `/api/proposals` (FR-6, FR-7, UC16, UC17)

### Proposal shape
```json
{
  "id": 2, "status": "Pending Supervisor", "comments": "...", "deadline": "2026-10-05",
  "submittedAt": "2026-09-26T13:45:00.000Z",
  "supervisorFeedback": null, "examinerFeedback": null,
  "supervisorReviewedAt": null, "examinerReviewedAt": null,
  "supervisorReviewerName": null, "supervisorReviewerRole": null,
  "examinerReviewerName": null, "examinerReviewerRole": null, "decidedByName": null,
  "project": { "id": 2, "title": "AI Plant Disease Detector", "description": "...", "status": "Proposed" },
  "group": { "id": 2, "name": "Team Beta" },
  "supervisorName": "Dr. Mona Alshehri", "examinerName": "Dr. Omar Alzahrani", "hasExaminer": true,
  "canReview": false, "canEditFeedback": false, "feedbackStage": null
}
```
- `canReview`: the current user can approve/reject now (group supervisor at `Pending Supervisor`,
  group examiner at `Pending Examiner`, admin at either).
- `canEditFeedback` + `feedbackStage` (`'supervisor' | 'examiner'`): the reviewer already reviewed
  and may edit their feedback (UC16/UC17 alternative flow). Only the person who reviewed that stage
  gets it (a new supervisor after a switch, or the supervisor after the admin decided, does not).
- `supervisorReviewerName` / `examinerReviewerName` (+ `...Role`): who actually wrote each stage's
  feedback. The timeline shows this name (with "(administrator)" when the admin decided at that stage),
  and falls back to the group's current supervisor / examiner while the stage is still open.

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `GET /proposals?status=&groupId=` | all | Student: own group; Supervisor/Examiner: their groups; Admin: all. Newest first |
| `GET /proposals/:id` | all (group access) | One proposal |
| `POST /proposals` | Student of the project's group | `{ projectId, comments?, deadline? }` → 201 proposal (`Pending Supervisor`) |
| `PATCH /proposals/:id/review` | Supervisor, Examiner, Administrator | `{ decision: 'approve' \| 'reject', feedback }` → proposal (feedback is required for both decisions) |
| `PUT /proposals/:id/examiner-feedback` | Examiner of the group | `{ feedback }` → proposal (allowed at `Pending Examiner`, or after reviewing, for the examiner who reviewed) |
| `PUT /proposals/:id/supervisor-feedback` | Supervisor of the group | `{ feedback }` → proposal (allowed at `Pending Supervisor`, or after reviewing, for the supervisor who reviewed) |

Review details: the feedback is stored in `SupervisorFeedback` / `ExaminerFeedback` depending on the
stage, the stage's `...ReviewedAt` and `...ReviewedByUserID` (the reviewer) are set, and
`DecidedByUserID` is set on the final decision. The
update uses `WHERE Status = <current>` so two reviewers cannot decide at the same time (409).

Errors: 400 `Please choose a supervisor before submitting a proposal.`,
409 `Your group already has a proposal under review.` / `Your proposal has already been approved.`,
403 `You can only submit a proposal for your own group's project.`, 400 `Please enter your feedback`,
409 `This proposal has already been decided.`, 409 `You already reviewed this proposal. It is now waiting for the examiner.`,
409 `The supervisor must approve this proposal before the examiner can review it.`,
400 `Please choose a valid deadline date`.

Notifications (type `Proposal`, emails for the important ones — UC8):
submit → supervisor (+ email) and teammates; supervisor approves → students, examiner (+ email) or
all admins when there is no examiner; final approve/reject → students (+ email) and the other
reviewers; feedback edited → students (type `Feedback`).

---

## 5. Supervisors — `/api/supervisors` (FR-5, UC11) and examiners

Supervisor shape:
```json
{ "id": 1, "userId": 2, "name": "Dr. Ahmed Alotaibi", "email": "supervisor1@gpmp.edu",
  "department": "Software Engineering", "numberOfGroups": 3, "currentGroups": 2,
  "isAvailable": true, "isActive": true, "hasCapacity": true, "canBeChosen": true, "isCurrent": false }
```
`numberOfGroups` is the maximum; `isCurrent` marks a student's current supervisor.

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `GET /supervisors` | all | Active supervisors (admins also see deactivated ones), by name |
| `GET /supervisors/my-choice` | Student | `{ groupId, groupName, supervisorId, canChange, message }` |
| `POST /supervisors/choose` | Student in a group | `{ supervisorId }` → `{ message, groupId, supervisorId }` |
| `PATCH /supervisors/:id` | Administrator | `{ numberOfGroups?, isAvailable?, department? }` → supervisor. The maximum cannot go below the current number of groups |
| `GET /examiners` | Administrator, Supervisor | `[{ id, userId, name, email, department, groupCount }]` |

Choose errors: 400 not in a group, 409 `Your supervisor has already approved your proposal, so the
supervisor can no longer be changed.`, 400 `<Name> is not available at the moment...`,
400 `<Name> has no free places left...`, 400 `This supervisor is already your supervisor.`
The capacity check locks the supervisor row (`SELECT ... FOR UPDATE`) so two groups cannot take the
last place at once. The new supervisor (+ email), the old supervisor and the teammates are notified.

---

## 6. Showcase — `/api/showcase` (FR-8, FR-18, FR-19)

Showcase item: `{ id, projectId, title, description, showcaseDescription, academicYear, status,
groupId, groupName, supervisorName, members: ['Name', ...], hasVideo, documentCount, completedAt, archivedAt }`
(`id` and `projectId` are the same value).

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `GET /showcase?year=&search=` | all | Completed + Archived projects; `search` looks in title, descriptions, group and supervisor name (`%`/`_` are literal) |
| `GET /showcase/years` | all | `['2024-2025', ...]` newest first |
| `GET /showcase/:projectId` | all (non-finished projects: group access) | Item + `memberDetails [{ name, major }]`, `examinerName`, `documents [{ id, name, version, size, uploadedAt }]` (newest version of each Document file), `canEdit` |
| `PUT /showcase/:projectId` | Student of the group | multipart: `video` (optional, mp4/webm/mov, 200 MB), `showcaseDescription` (required), `academicYear?` → detail. A new video replaces the old one (row + file on disk) and is stored in the `file` table with Category `Showcase` |
| `DELETE /showcase/:projectId/video` | Student of the group, Administrator | Removes the video → `{ message }` |
| `GET /showcase/:projectId/video` | all (non-finished: group access) | Streams the video (`res.sendFile`, supports seeking) |
| `GET /showcase/:projectId/documents/:fileId/download` | all (non-finished: group access) | Downloads a final document (Category `Document` of that group) |

Errors: 400 `You can add a showcase only after your project is marked as completed.`,
403 `Only the students of this project can update its showcase.`,
400 `Please write a short description of your project.`, 400 `This file type is not allowed. Please upload an MP4, WebM or MOV video.`,
404 `This project has no showcase video.`

---

## 7. Frontend

| Page | Path | Roles | What it does |
| --- | --- | --- | --- |
| `MyProjectPage` | `/project` | Student | No group → friendly empty state. No project → create form. Otherwise `ProjectOverview`. Reloads live on Proposal/Feedback/System notifications and refreshes `useAuth().user` when the group changed |
| `GroupsPage` | `/groups` | Staff | Stat cards, search, group cards with progress. Admin: New group, Edit, Delete (confirm) |
| `GroupDetailPage` | `/groups/:id` | Staff | Quick links (`?groupId=`) to tasks, documents, calendar, chat, attendance, proposals; `ProjectOverview`; admin Edit / Delete |
| `SupervisorsPage` | `/supervisors` | Student, Admin | Student: supervisor cards with capacity, availability and "Choose" (confirm); UC11 message "No supervisors are available at the moment.". Admin: editable table (department, max groups, availability) |
| `ProposalsPage` | `/proposals` | Staff | Group filter (`?groupId=`), status tabs with counts + "Waiting for me", proposal cards with review history, Approve / Reject (review modal with feedback and similar projects), Edit feedback |
| `ShowcasePage` | `/showcase` | all | UI fig 43: navy banner, search (`?search=`), year pills (`?year=`), project cards, detail modal with video (blob URL, revoked on close), team and final documents |

API files: `src/client/api/{groups,projects,proposals,supervisors,examiners,showcase}.js`.

Components (`src/client/components/project/`): `ProjectOverview` (the shared project page body),
`ProjectHero`, `ProjectForm`, `ProposalSection`, `ProposalTimeline`, `ProposalSubmitModal`,
`ProposalCard`, `ReviewProposalModal`, `EditFeedbackModal`, `ProjectStatusCard`, `SupervisionCard`,
`TeamCard`, `RecentDocumentsCard`, `UpcomingEventsCard`, `GroupCard`, `GroupFormModal`,
`SupervisorCard`, `SupervisorRow`. Showcase (`src/client/components/showcase/`): `ShowcaseCard`,
`ShowcaseDetailModal`, `ShowcaseVideo`, `ShowcaseEditor`.

Styles: `src/client/styles/project.css` (`proj-`) and `src/client/styles/showcase.css` (`show-`). global.css is
loaded first (in main.jsx), so these files win ties; rules that change a shared class also use two class names.

Other pages can link to: `/project`, `/groups/:id`, `/proposals?groupId=`, `/supervisors`,
`/showcase?search=<title>&year=<year>`.

---

## 8. Testing

`npm run test:smoke` (see the main README) covers this area: group access rules (403/404), creating
a group (and a duplicate name → 409), the complete Team Gamma story (choose a supervisor → create the
project → submit the proposal → supervisor approves → admins notified → admin assigns examiner2 →
examiner2 approves → project In Progress), who may edit proposal feedback, deactivated supervisors,
and the showcase list, years, detail and final-document download.
