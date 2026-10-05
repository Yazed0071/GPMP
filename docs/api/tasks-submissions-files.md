# Tasks, submissions, feedback and documents

This part of GPMP covers:

- **FR-14 / UC15**: tasks and milestones, and the progress summary ("Tasks & Progress", UI fig 46)
- **UC5**: students submit work for a task (files and/or a link)
- **FR-11 / UC13**: the supervisor gives structured feedback on a submission
- **FR-16 / UC4 / FR-4**: group documents: upload, versions, download, delete

All endpoints need a login (`Authorization: Bearer <token>`) and follow the shared API conventions
(camelCase JSON, `id` for primary keys, DATE values as `'YYYY-MM-DD'`, DATETIME values as ISO strings in UTC,
errors as `{ "error": { "message", "details?" } }`).

---

## 1. Files

| Layer | File | What it does |
| --- | --- | --- |
| Backend | `src/server/routes/tasks.routes.js` | URLs for `/api/tasks` |
| | `src/server/routes/submissions.routes.js` | URLs for `/api/submissions` (upload field `files`) |
| | `src/server/routes/feedback.routes.js` | URLs for `/api/feedback` |
| | `src/server/routes/files.routes.js` | URLs for `/api/files` (upload field `file`) |
| | `src/server/controllers/tasks.controller.js` | task rules, progress, permissions |
| | `src/server/controllers/submissions.controller.js` | submissions, late check, task status after a submission |
| | `src/server/controllers/feedback.controller.js` | feedback + task status after a decision |
| | `src/server/controllers/files.controller.js` | documents, versions, downloads + shared helpers (`groupCondition`, `nextFileVersion`) |
| Frontend | `src/client/pages/TasksPage.jsx` | progress ring, milestone timeline, filter tabs, 4-column board, "New task" |
| | `src/client/pages/TaskDetailPage.jsx` | task details, status buttons, edit/delete, submit work, submissions + feedback |
| | `src/client/pages/DocumentsPage.jsx` | upload card, file table with category tabs and search |
| | `src/client/api/{tasks,submissions,feedback,files}.js` | one API helper file per backend resource |
| | `src/client/components/tasks/*` | `TaskBoard`, `TaskCard`, `ProgressSummary`, `MilestoneTimeline`, `TaskFormModal`, `TaskStatusControl`, `SubmitWorkForm`, `SubmissionCard`, `FeedbackCard`, `FeedbackForm`, `taskHelpers.js` |
| | `src/client/components/documents/*` | `UploadDocumentCard`, `FilesTable` |
| | `src/client/styles/tasks.css`, `documents.css` | styles (`task-` and `doc-` prefixes) |

---

## 2. Who may do what

"Manager" = the **group's supervisor** or an **Administrator**. "Member" = a **student of the group**.

| Action | Manager | Member (student) | Examiner of the group |
| --- | --- | --- | --- |
| View tasks, progress, submissions, feedback, files | yes | yes (own group only) | yes (read only) |
| Add a task (UC15) | yes | yes, for their own team | no |
| Edit a task | yes | only tasks they created | no |
| Delete a task | yes | only tasks they created **and** that have no submissions | no |
| Status "To Do" / "In Progress" | yes | yes, only while the task is To Do / In Progress | no |
| Status "Completed" | yes (or automatic by an Approved feedback) | no (403) | no |
| Status "Submitted" | automatic when work is submitted | automatic | no |
| Submit work (UC5) | no | yes (not when the task is Completed) | no |
| Give feedback (UC13) | yes | no | no |
| Edit feedback | only the feedback's author | no | no |
| Upload a document | yes | yes | no (403) |
| Download a file | yes | yes | yes |
| Delete a document | yes (supervisor or admin) | only files they uploaded | no |
| Delete a submission file | admin only | no | no |

The backend always checks these rules. `GET /api/tasks/:id` sends a `permissions` object so the page
only shows the buttons the user can use.

**Archived projects (FR-8).** The tasks, submissions, feedback and documents of a project with status
`Archived` are kept exactly as they were archived: only an **administrator** can still change them.
Everyone else gets **409** `This project is archived. Only the administrator can change it.` (add, edit,
delete or move a task, submit work, give or edit feedback, upload or delete a document). For those users
the task `permissions` are all `false`, the file `canDelete` is `false`, and the Tasks and Documents pages
hide "New task" and the upload card. Viewing and downloading keep working. The showcase (FR-18) stays
editable. To correct an archived project, the administrator can also set its status back first.

---

## 3. Tasks — `/api/tasks`

### Task object

```json
{
  "id": 8, "groupId": 1, "groupName": "Team Alpha",
  "title": "Database Implementation", "description": "Create the MySQL schema ...",
  "dueDate": "2026-09-29", "status": "Submitted", "isMilestone": false,
  "assignedTo": { "studentId": 2, "name": "Abdullah Alrashid" },
  "createdBy": { "id": 2, "name": "Dr. Ahmed Alotaibi" },
  "submissionCount": 1, "latestSubmissionStatus": "Submitted",
  "isOverdue": false,
  "createdAt": "2026-09-19T15:15:00.000Z", "updatedAt": "2026-09-27T07:45:00.000Z"
}
```

- `status`: `To Do` | `In Progress` | `Submitted` | `Completed`.
- `assignedTo` is `null` for a whole-team task; `createdBy` is `null` if the creator was deleted.
- `isOverdue` = the due date has passed **and** the status is still To Do / In Progress
  ("today" is the date in the university time zone, `APP_TIME_ZONE`, default Asia/Riyadh — the same rule as the calendar and reminders).

| Method and URL | Who | Body / query | Result |
| --- | --- | --- | --- |
| `GET /api/tasks?groupId=&status=&milestone=` | anyone (own groups) | all optional; `milestone=true/false` | `Task[]` ordered by due date (no date last). No `groupId` = every accessible group (a student gets their group; a student without a group gets `[]`) |
| `GET /api/tasks/progress?groupId=` | anyone | `groupId` required for staff; students default to their group | see below |
| `GET /api/tasks/assignees?groupId=` | anyone | same as progress | `[{ studentId, userId, name }]` active students of the group (for the "Assign to" list) |
| `GET /api/tasks/:id` | anyone with access | – | `Task` + `submissions` + `permissions` (see below) |
| `POST /api/tasks` | manager, member | `{ groupId, title, description?, dueDate?, isMilestone?, assignedToStudentId? }` | `201 Task` |
| `PUT /api/tasks/:id` | manager, creator | any of `title, description, dueDate, isMilestone, assignedToStudentId` (missing = unchanged) | `Task` |
| `PATCH /api/tasks/:id/status` | manager, member | `{ status }` | `Task` |
| `DELETE /api/tasks/:id` | manager, creator (no submissions) | – | `{ message: "Task deleted" }` |

Progress:

```json
{ "groupId": 1, "total": 13, "toDo": 3, "inProgress": 2, "submitted": 1, "completed": 7,
  "overdue": 1, "percent": 54,
  "milestones": [{ "id": 1, "title": "Milestone: Project Proposal Approved", "dueDate": "2026-08-15",
                   "status": "Completed", "isOverdue": false }] }
```

`percent` = completed ÷ total, rounded (0 when there are no tasks).

Task detail extras:

```json
{
  "...task fields": "...",
  "submissions": [ "Submission objects with files and feedback, newest first (section 4)" ],
  "permissions": { "canEdit": true, "canDelete": true, "canSubmit": false, "canGiveFeedback": true,
                   "canChangeStatus": true, "allowedStatuses": ["To Do", "In Progress", "Completed"] }
}
```

Rules and messages:

| Case | Status | Message |
| --- | --- | --- |
| Title missing (UC15 exceptional flow) | 400 | `Task title is required` |
| Bad date | 400 | `Please choose a valid due date.` |
| Due date before today (create, or a **changed** date on edit) | 400 | `The due date cannot be in the past.` |
| Assignee not in the group | 400 | `The assigned student must be a member of this group.` |
| Examiner / other group's supervisor adds a task | 403 | `You do not have permission to do this.` / `Only the group's supervisor or its students can add tasks.` |
| Student edits someone else's task | 403 | `You can only edit tasks you created.` |
| Anyone sets `Submitted` | 400 | `A task becomes "Submitted" automatically when work is submitted.` |
| Student sets `Completed` | 403 | `Only the supervisor can mark a task as completed.` |
| Any change to a task of an archived project (not admin) | 409 | `This project is archived. Only the administrator can change it.` |
| Student changes a Submitted / Completed task | 400 | `This task is waiting for your supervisor's review.` / `This task is completed. Only the supervisor can reopen it.` |
| Student deletes their task that has submissions | 403 | `This task already has submissions, so only the supervisor can delete it.` |
| Staff calls progress without `groupId` | 400 | `Group is required` |
| Student without a group calls progress | 400 | `You are not in a group yet.` |

Side effects:

- Create: `SupervisorID` = the group's supervisor; status `To Do`; the group's students and supervisor
  (except the creator) get a `Task` notification linking to `/tasks/<id>`.
- Edit: when the due date changes, the group is notified (`Due date changed: ...`).
- Status `Completed` set by hand: the group is notified (`Task completed: ...`).
- Delete: submissions, their feedback and file rows are removed by the database cascade, and the
  stored files are deleted from `uploads/`.

---

## 4. Submissions — `/api/submissions` (UC5)

### Submission object

```json
{
  "id": 7, "taskId": 8, "task": { "id": 8, "title": "Database Implementation", "status": "Submitted" },
  "groupId": 1, "groupName": "Team Alpha",
  "submittedBy": { "studentId": 2, "userId": 8, "name": "Abdullah Alrashid" },
  "submissionDate": "2026-09-27T07:45:00.000Z", "deadline": "2026-09-29",
  "source": null, "status": "Submitted", "notes": "The schema and seed scripts ...",
  "fileCount": 1, "feedbackCount": 0, "isLate": false,
  "files": [{ "id": 7, "fileName": "Database_Schema_Notes.txt", "fileSize": 406, "mimeType": "text/plain", "version": 1 }],
  "feedback": []
}
```

`status`: `Submitted` (waiting) | `Approved` | `Needs Revision`. `isLate` = submitted after the day of `deadline`
(the task's due date copied at submission time). `files` and `feedback` are included by `GET /:id`,
`POST` and inside `GET /api/tasks/:id`, not in the list.

| Method and URL | Who | Body / query | Result |
| --- | --- | --- | --- |
| `GET /api/submissions?groupId=&status=` | anyone (own groups) | optional; e.g. `status=Submitted` = review queue (only the newest submission of each task that still waits for review; an older attempt the student replaced is not listed) | list (newest first, without `files`/`feedback`) |
| `GET /api/submissions/:id` | anyone with access | – | one submission with `files` and `feedback` |
| `POST /api/submissions` | **students** of the task's group | multipart: `taskId`, `files` (0–5 files, 20 MB each), `source?` (link), `notes?` | `201` submission |

Frontend: `createSubmission({ taskId, files, source, notes })` in `src/client/api/submissions.js` builds the FormData.

Rules and messages:

| Case | Status | Message |
| --- | --- | --- |
| No file and no link | 400 | `Please attach a file or add a link.` |
| Link not starting with http(s):// | 400 | `The link must start with http:// or https://` |
| Task is Completed | 400 | `This task is already completed, so it cannot receive new submissions.` |
| Wrong file type / too big / more than 5 | 400 | `This file type is not allowed.` / `The file is too large (maximum 20 MB).` / `You can upload up to 5 files at a time ...` |
| Supervisor/examiner/admin tries to submit | 403 | `You do not have permission to do this.` (checked before the upload is saved) |

Side effects: every file is saved as a `file` row (`Category 'Submission'`, `SubmissionID`, `GroupID`, size,
MIME type, version = next version of that file name in the group); the task becomes `Submitted`; the
group's supervisor gets `New submission: <task title>` (type `Task`, link `/tasks/<id>`).

**Late work (UC5 "may reject"):** late submissions are accepted and marked `isLate: true` (red "Late"
badge), so the supervisor decides. **Drafts (UC5 alternative flow)** are not stored on the server; the
chosen files stay in the form until the student submits.

---

## 5. Feedback — `/api/feedback` (FR-11, UC13)

### Feedback object

```json
{
  "id": 1, "submissionId": 1, "taskId": 3, "taskTitle": "Chapter 1 — Introduction & Problem Statement",
  "groupId": 1, "groupName": "Team Alpha",
  "decision": "Approved", "strengths": "Clear problem statement", "improvements": "Add references",
  "comments": "Good work. Approved ...",
  "givenBy": { "id": 2, "name": "Dr. Ahmed Alotaibi" },
  "createdAt": "2026-08-24T10:00:00.000Z", "updatedAt": "2026-08-24T10:00:00.000Z", "isEdited": false
}
```

| Method and URL | Who | Body / query | Result |
| --- | --- | --- | --- |
| `GET /api/feedback?groupId=&limit=` | anyone (own groups) | optional; `limit` 1–100 (default 10) | recent feedback, newest first (e.g. for a dashboard "Recent activity") |
| `POST /api/feedback` | group supervisor, admin | `{ submissionId, decision, strengths?, improvements?, comments }` | `201` feedback |
| `PUT /api/feedback/:id` | the author only | any of `decision, strengths, improvements, comments` | feedback |

Rules and messages:

| Case | Status | Message |
| --- | --- | --- |
| Empty comments (UC13 exceptional flow) | 400 | `Please enter your feedback comments.` |
| Missing / wrong decision | 400 | `Please choose a decision: Approved or Needs Revision.` |
| Not the group's supervisor | 403 | `Only the group's supervisor can give feedback on this submission.` |
| Same reviewer gives feedback twice on one submission | 409 | `You have already given feedback on this submission. Please edit it instead.` (checked inside the transaction after locking the submission, plus a UNIQUE key, so a double click cannot save two) |
| Someone else edits the feedback | 403 | `You can only edit your own feedback.` |

Side effects:

- The submission's `Status` becomes the decision.
- If it is the task's **newest** submission: `Approved` → task `Completed`, `Needs Revision` → task `In Progress`
  (feedback on an older attempt never changes the task).
- The group's students get a `Feedback` notification (link `/tasks/<taskId>`); new feedback is also
  **emailed** (UC8). Edits send an in-app notification only.

---

## 6. Files and documents — `/api/files` (FR-16, UC4)

### File object

```json
{
  "id": 9, "groupId": 1, "groupName": "Team Alpha",
  "fileName": "Smart_Campus_Proposal.pdf", "fileSize": 1423, "mimeType": "application/pdf",
  "category": "Document", "version": 2,
  "uploadedBy": { "id": 7, "name": "Sara Alqahtani" }, "uploadDate": "2026-08-10T09:00:00.000Z",
  "submissionId": null, "taskId": null, "taskTitle": null,
  "canDelete": true
}
```

`category`: `Document` (Documents page) | `Submission` (attached to a submission; `taskId`/`taskTitle` set) |
`Showcase`. `canDelete` tells the page whether to show the delete button.

| Method and URL | Who | Body / query | Result |
| --- | --- | --- | --- |
| `GET /api/files?groupId=&category=&search=` | anyone (own groups) | all optional; `search` = part of the file name | `File[]`, newest first |
| `POST /api/files` | students, supervisors, admins with access (**not examiners**) | multipart: `file` + `groupId` | `201 File` |
| `GET /api/files/:id/download` | anyone with access to the file's group | – | the file, with its original name (`Content-Disposition`) |
| `DELETE /api/files/:id` | see section 2 | – | `{ message: "File deleted" }` |

Frontend: `uploadDocument(groupId, file)`, `downloadGroupFile({ id, fileName })` (uses `downloadFile`
from `api/client.js`), `deleteFile(id)` in `src/client/api/files.js`. Never put `/api/files/...` in an `href`.

Rules and messages:

| Case | Status | Message |
| --- | --- | --- |
| No file chosen | 400 | `Please choose a file to upload.` |
| Unsupported type (UC4 exceptional flow) | 400 | `This file type is not allowed.` |
| Examiner uploads | 403 | `You do not have permission to do this.` (checked before the file is saved) |
| No access to the group | 403 | `You do not have access to this group` |
| Stored file missing on disk | 404 | `The file could not be found on the server.` |
| Delete someone else's document (student) | 403 | `You can only delete files you uploaded.` |
| Delete a submission file (not admin) | 403 | `Submission files can only be deleted by an administrator.` |
| Empty (0-byte) file (UC5 exceptional flow) | 400 | `The file is empty or damaged. Please choose it again.` |
| Upload to / delete from an archived project (not admin) | 409 | `This project is archived. Only the administrator can change it.` |

Versions: `Version` = 1 + the highest version of a file with the **same name and category in the same
group** (names are compared case-insensitively). Old versions are kept, so the table shows `v1`, `v2`, ...
The version is worked out and saved in one transaction that first locks the group row (`lockGroupRow`),
so two uploads at the same moment never get the same version.
When a student uploads a document, the group's supervisor gets a `System` notification linking to
`/documents?groupId=<id>`.

---

## 7. Frontend pages

- **TasksPage (`/tasks`)**: students always see their own group; staff pick a group with `GroupSelect`
  (kept in `?groupId=`). Shows the "Overall Progress" ring with counts, the milestone timeline (done =
  green check, next = teal ring, overdue = red), filter tabs (All / Assigned to me (students) / Milestones /
  Overdue) and the board (To Do / In Progress / Submitted / Completed; 2 columns on tablets, 1 on phones).
  "New task" opens `TaskFormModal` (hidden for examiners). The page reloads quietly when a `Task` or
  `Feedback` notification arrives over the socket.
- **TaskDetailPage (`/tasks/:id`)**: description, details (status, due date with "Due in 3 days" /
  "2 days overdue", assignee, creator), `TaskStatusControl` (only the allowed statuses), Edit/Delete per
  `permissions`, `SubmitWorkForm` (drag-and-drop up to 5 files, link, notes; warns when late), and the
  submission history (`SubmissionCard`) with downloads, `FeedbackCard`s and the supervisor's `FeedbackForm`
  (open automatically on the newest submission that waits for review). A deleted task shows "Task not found".
- **DocumentsPage (`/documents`)**: category tabs with counts, search by name, the files table (name with
  version badge and task link, category, uploader + date, size, download, delete with confirmation), an
  upload card (FileDrop, client-side type/size checks, "Uploading..." state) and a summary card. Examiners
  see an info message instead of the upload card. On phones the extra columns are hidden and shown under
  the file name.

Links other pages can use: `/tasks?groupId=<id>`, `/tasks/<taskId>`, `/documents?groupId=<id>`.

---

## 8. Testing

`npm run test:smoke` (see the main README) covers this area: creating a task (a past due date → 400,
an examiner → 403), moving it to In Progress, submitting work with a file and then a link-only
resubmission (counted once in "submissions to review"), downloading the submitted file, feedback
(empty comments → 400, a student → 403, twice → 409) that completes the task, document versions
(v1 → v2, two uploads at the same moment get different versions), blocked and empty files, download
access per group, deleting documents, and the read-only archived project (FR-8).

To try an upload by hand with curl (see [server.md](../server.md), section 9, for getting `$TOKEN`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" -F groupId=1 -F file=@notes.txt http://localhost:5000/api/files
```
