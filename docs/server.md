# Server (GPMP API)

This document explains how the server code (`src/server/`) is organised and how to use the
shared helpers that every route and controller is built on.

- Node.js 24, Express 5, MySQL/MariaDB through `mysql2`, ES modules (`import` / `export`).
- Socket.IO for live updates (chat messages, notifications).
- JWT login tokens, bcrypt password hashes, multer for uploads.

---

## 1. Running the server

The server is the `src/server/` part of the single GPMP project. Run these in the project folder:

```bash
npm install            # once (installs the server and the client together)
cp .env.example .env   # once, then set JWT_SECRET
npm run db:setup       # DELETES all GPMP tables, re-creates them and inserts the demo data
npm run dev            # starts the API (http://localhost:5000/api) AND the website; restarts the API on every save
npm run dev:server     # only the API
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the API with nodemon (restarts when a file in `src/server/` or `.env` changes) and the website with Vite |
| `npm run dev:server` | Only the API, with nodemon |
| `npm start` | Runs `src/server/server.js` once, without auto-restart |
| `npm run db:setup` | Creates database `gpmp` if missing, runs `database/schema.sql`, then `database/seed.js` |
| `npm run test:smoke` | The end-to-end test of the whole API (section 9) |

Useful settings: `PORT` in `.env` changes the API port (default 5000); the environment variable
`DISABLE_REMINDERS=1` does not start the reminder job (e.g. while testing).

All demo accounts use the password **Gpmp@2026** (see section 11 for the list).

---

## 2. Folder structure

```
GPMP/                     (only the server parts are shown here)
  .env / .env.example     settings (never commit .env)
  database/
    schema.sql            the database tables
    setup.js              npm run db:setup
    seed.js               demo data (dates are relative to "now")
    seed-files.js         makes the small PDF/TXT/CSV files for seeded file rows
  uploads/                uploaded files (never served publicly)
  scripts/smoke-test.js   npm run test:smoke
  src/server/
    server.js             starts HTTP + Socket.IO + reminders
    app.js                Express app: security, CORS, JSON, routers, 404, error handler
    socket.js             Socket.IO rooms + emitToUser / emitToRoom / refreshUserRooms
    config/env.js         the `config` object built from .env
    config/db.js          pool, query(), withTransaction(), likePattern()
    middleware/
      auth.js             requireAuth, requireRole, signToken, verifyToken, getBearerToken
      errorHandler.js     notFound + errorHandler (turns errors into JSON)
      upload.js           uploadFile, uploadFiles, uploadVideo, getFileInfo
      rateLimit.js        loginLimiter, resetRequestLimiter
    utils/
      HttpError.js        throw new HttpError(status, message, details?)
      validate.js         requireFields, isEmail, isValidDate, oneOf, toInt, ...
      paths.js            UPLOAD_DIR, getUploadPath, storedFileExists, deleteStoredFile
    services/
      access.js           who is the user, which groups can they access
      notify.js           in-app notifications (+ optional email)
      email.js            sendEmail (prints "[email preview]" when SMTP is not set)
      reminders.js        deadline/meeting reminders
    routes/<name>.routes.js          URL + middleware -> controller function (nothing else)
    controllers/<name>.controller.js the logic and the SQL
```

Route mount points (all in `app.js`):

| URL prefix | Route file | Documented in |
| --- | --- | --- |
| `/api/health` | inside `app.js` (returns `{ status: 'ok' }`) | – |
| `/api/meta` | `meta.routes.js` | section 6.11 below |
| `/api/auth`, `/api/users`, `/api/profile` | `auth`, `users`, `profile` | [api/auth-users-profile.md](api/auth-users-profile.md) |
| `/api/groups`, `/api/projects`, `/api/proposals`, `/api/supervisors`, `/api/examiners`, `/api/showcase` | same names | [api/groups-projects-proposals.md](api/groups-projects-proposals.md) |
| `/api/tasks`, `/api/submissions`, `/api/files`, `/api/feedback` | same names | [api/tasks-submissions-files.md](api/tasks-submissions-files.md) |
| `/api/events`, `/api/attendance`, `/api/dashboard` | same names | [api/calendar-attendance-dashboard.md](api/calendar-attendance-dashboard.md) |
| `/api/chat`, `/api/announcements`, `/api/notifications`, `/api/resources` | same names | [api/communication.md](api/communication.md) |

---

## 3. API conventions (short version)

- Success: the data itself (object or array). `200`, or `201` for creates. Deletes return `200 { message }`.
- Errors: `{ "error": { "message": "...", "details": optional } }` with
  `400` validation · `401` not logged in · `403` not allowed · `404` not found · `409` duplicate ·
  `423` account locked · `429` too many requests · `500` unexpected.
- JSON keys are camelCase; DB columns are PascalCase, so use SQL aliases: `SELECT t.TaskID AS id, t.GroupID AS groupId`.
  Every primary key is returned as `id`. Convert TINYINT flags with `toBool()` (or `!!value`).
- Dates: the DB session runs in UTC. DATETIME columns come back as JS `Date` objects and are sent as
  ISO strings (`"2026-10-05T07:00:00.000Z"`). DATE columns (`DueDate`, `ProposalDeadline`,
  `SubmissionDeadline`) come back as `'YYYY-MM-DD'` strings. Clients send DATETIMEs as ISO strings —
  convert with `new Date(value)` before saving; DATEs as `'YYYY-MM-DD'`.
- Always use `?` placeholders. Never concatenate user input into SQL.
- DECIMAL values (GPA, `SUM()`) come back as numbers (`decimalNumbers: true`). `COUNT(*)` is a number.

---

## 4. Login tokens (JWT)

- Header: `Authorization: Bearer <token>`.
- **Payload: `{ id, role, v }`** — `id` is the user's `UserID`, `v` is the user's `TokenVersion`.
  Signed with `JWT_SECRET`, expires after `JWT_EXPIRES_IN` (default `1d`).
- Create tokens with `signToken(user)` from `middleware/auth.js` (the login endpoint uses it), passing the
  object from `loadUserContext` (it carries `tokenVersion`):

```js
import { signToken } from '../middleware/auth.js';
const user = await loadUserContext(userId);
const token = signToken(user);
res.json({ token, user: toPublicUser(user) }); // toPublicUser leaves out tokenVersion
```

- `requireAuth` only trusts the `id` in the token. It loads the user **fresh from the database** on
  every request, so role or group changes apply immediately and deactivated users (`IsActive = 0`)
  are rejected with 401.
- Changing or resetting a password (`savePassword`) raises the user's `TokenVersion`, so every token
  signed before the change is rejected with 401 (`requireAuth` and the socket server compare `v`).
- `verifyToken(token)` returns the payload or `null` (used by the socket server).

---

## 5. How to add a route (example)

`src/server/routes/tasks.routes.js` — only wiring:

```js
// Routes for /api/tasks: list, view, create, update and delete tasks.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listTasks, getTask, createTask, deleteTask } from '../controllers/tasks.controller.js';

const router = Router();

router.use(requireAuth); // every route below needs a logged-in user

router.get('/', listTasks);
router.get('/:id', getTask);
router.post('/', requireRole('Supervisor', 'Administrator'), createTask);
router.delete('/:id', requireRole('Supervisor', 'Administrator'), deleteTask);

export default router;
```

`src/server/controllers/tasks.controller.js` — logic and SQL. Controllers are plain `async` functions.
**Throw** an `HttpError` for problems; Express 5 sends thrown errors to the error handler automatically
(no `try/catch`, no `next(err)` needed).

```js
// Task management (FR-14, UC15).
import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, isValidDate, toInt } from '../utils/validate.js';
import { assertGroupAccess, getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';

export async function createTask(req, res) {
  requireFields(req.body, { groupId: 'Group', title: 'Task title' });
  const groupId = await assertGroupAccess(req.user, req.body.groupId);
  if (req.body.dueDate && !isValidDate(req.body.dueDate)) {
    throw new HttpError(400, 'Please choose a valid due date');
  }

  const result = await query(
    'INSERT INTO task (GroupID, Title, DueDate, CreatedByUserID) VALUES (?, ?, ?, ?)',
    [groupId, req.body.title.trim(), req.body.dueDate || null, req.user.id]
  );

  const studentIds = await getGroupUserIds(groupId, { supervisor: false });
  await notify(studentIds, { type: 'Task', title: `New task: ${req.body.title}`, link: `/tasks/${result.insertId}` });

  res.status(201).json({ id: result.insertId });
}

export async function deleteTask(req, res) {
  const id = toInt(req.params.id, 'Task id');
  const rows = await query('SELECT GroupID FROM task WHERE TaskID = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Task not found');
  await assertGroupAccess(req.user, rows[0].GroupID);

  await query('DELETE FROM task WHERE TaskID = ?', [id]);
  res.json({ message: 'Task deleted' });
}
```

---

## 6. Helper reference

### 6.1 `middleware/auth.js`

| Export | Use |
| --- | --- |
| `requireAuth` | 401 unless a valid token of an active user is sent. Sets `req.user`. |
| `requireRole(...roles)` | 403 unless `req.user.role` is one of the roles. Put it **after** `requireAuth`. |
| `signToken(user)` | `jwt.sign({ id, role, v: tokenVersion }, JWT_SECRET, { expiresIn })` |
| `verifyToken(token)` | payload or `null` |
| `getBearerToken(req)` | the token from the `Authorization` header, or `null` |

`req.user` shape:

```js
{
  id: 7, name: 'Sara Alqahtani', email: 'student1@gpmp.edu', role: 'Student',
  studentId: 1,       // null unless role is Student
  supervisorId: null, // null unless role is Supervisor
  examinerId: null,   // null unless role is Examiner
  adminId: null,      // null unless role is Administrator
  groupId: 1,         // the student's group, or null (always null for non-students)
  tokenVersion: 0,    // only for checking login tokens; toPublicUser(user) removes it before sending
}
```

Role strings are exactly `'Student'`, `'Supervisor'`, `'Examiner'`, `'Administrator'`.

### 6.2 `services/access.js`

```js
import {
  getAccessibleGroupIds, canAccessGroup, assertGroupAccess,
  getGroupUserIds, isGroupSupervisor, loadUserContext,
} from '../services/access.js';
```

| Function | Returns |
| --- | --- |
| `getAccessibleGroupIds(user)` | `null` = all groups (Administrator); Student → `[groupId]` or `[]`; Supervisor → groups where they are `SupervisorID`; Examiner → groups where they are `ExaminerID` |
| `canAccessGroup(user, groupId)` | `true/false` (accepts `'3'` or `3`) |
| `assertGroupAccess(user, groupId)` | the group id as a **number**; throws 400 `Group is required` (missing), 404 `Group not found`, 403 `You do not have access to this group` |
| `getGroupUserIds(groupId, { students = true, supervisor = true, examiner = false })` | array of `UserID`s of **active** users, e.g. to notify them |
| `isGroupSupervisor(user, groupId)` | `true/false` |
| `loadUserContext(userId)` | the `req.user` shape, or `null` if missing/inactive |
| `toPublicUser(user)` | the user without `tokenVersion` (what is sent to the browser) |
| `isGroupArchived(groupId)` | `true` when the group's project is `Archived` |
| `assertGroupNotArchived(user, groupId)` | FR-8: throws 409 `This project is archived. Only the administrator can change it.` for everyone except administrators |

Filtering a list by the user's groups (common pattern):

```js
const groupIds = await getAccessibleGroupIds(req.user);
if (groupIds !== null && groupIds.length === 0) return res.json([]); // IN () would be invalid SQL

const where = groupIds === null ? '' : 'WHERE t.GroupID IN (?)';
const rows = await query(`SELECT t.TaskID AS id, t.Title AS title FROM task t ${where}`,
  groupIds === null ? [] : [groupIds]); // an array fills "IN (?)" automatically
```

When a page sends `?groupId=`, simply use `const groupId = await assertGroupAccess(req.user, req.query.groupId);`.

### 6.3 `services/notify.js`

```js
import { notify } from '../services/notify.js';

await notify(userIds, {
  type: 'Feedback',                 // Announcement | Deadline | Meeting | Message | Feedback | Task | Proposal | System
  title: 'New feedback on "Chapter 3"', // max 200 chars (longer is cut)
  message: 'Dr. Ahmed approved your submission.', // optional, max 500
  link: `/tasks/${taskId}`,         // optional page to open, max 255
  email: false,                     // true = also email each user (UC8)
});
```

- One row per **distinct** user (duplicates, `null` and `0` are ignored; a single id is fine too).
- Emits `'notification:new'` to room `user:<id>` with `{ id, type, title, message, link, isRead: false, createdAt }`.
- Emails are sent in the background (not awaited) so the response is not delayed.
- **Never throws**; errors are logged. An unknown `type` is logged and saved as `'System'`.
- Returns the created notifications (API shape). Usually you can ignore the return value.
- Tip: do not notify the person who did the action (filter out `req.user.id`).

### 6.4 `services/email.js`

```js
import { sendEmail, isEmailConfigured, escapeHtml } from '../services/email.js';

const result = await sendEmail({ to: 'student1@gpmp.edu', subject: 'Reset your password', text, html });
// { sent: true, messageId } | { sent: false, preview: true } | { sent: false, error }
```

- If `SMTP_HOST` is empty, the email is printed to the terminal with the prefix `[email preview]`.
- **Never throws.** `isEmailConfigured()` tells you if real emails are sent (forgot-password returns
  `devResetLink` only when it is `false`, outside production, and to a request from the same computer).
- Put user text into an `html` body only through `escapeHtml(text)` (escapes `& < > "`).

### 6.5 Uploads — `middleware/upload.js` and `utils/paths.js`

| Middleware | Form field | Limit | Result |
| --- | --- | --- | --- |
| `uploadFile` | `file` (one) | 20 MB | `req.file` |
| `uploadFiles` | `files` (up to 5) | 20 MB each | `req.files` (array) |
| `uploadVideo` | `video` (one) | 200 MB, `.mp4 .webm .mov` | `req.file` |

Allowed document types: `pdf doc docx ppt pptx xls xlsx txt csv zip rar png jpg jpeg gif`.
Rejections are 400 with `"This file type is not allowed."`, `"The file is too large (maximum 20 MB)."`,
`"The file is empty or damaged. Please choose it again."` (a 0-byte file), etc.

A multer file object looks like:

```js
req.file = {
  fieldname: 'file',
  originalname: 'تقرير المشروع.pdf', // real name from the user's computer (UTF-8 works)
  filename: '1790608268363-63b4c3df1c435f91.pdf', // stored name inside uploads/
  path: 'C:\\...\\gpmp\\uploads\\1790608268363-63b4c3df1c435f91.pdf',
  size: 52311, mimetype: 'application/pdf',
}
```

Other form fields arrive as **strings** in `req.body` (e.g. `req.body.groupId === '3'`), so convert
them with `toInt()`. `req.file` is `undefined` when no file was chosen — check it:

```js
router.post('/', requireAuth, uploadFile, uploadDocument);

export async function uploadDocument(req, res) {
  if (!req.file) throw new HttpError(400, 'Please choose a file to upload.');
  const groupId = await assertGroupAccess(req.user, req.body.groupId);

  const info = getFileInfo(req.file); // { fileName, filePath, fileSize, mimeType }
  const result = await query(
    `INSERT INTO \`file\` (GroupID, UploadedByUserID, FileName, FilePath, FileSize, MimeType, Category)
     VALUES (?, ?, ?, ?, ?, ?, 'Document')`,
    [groupId, req.user.id, info.fileName, info.filePath, info.fileSize, info.mimeType]
  );
  res.status(201).json({ id: result.insertId, name: info.fileName });
}
```

- **If the request fails after multer saved the file** (any thrown error: validation, 403, DB error),
  the error handler deletes the uploaded file(s) automatically. So always *throw* errors.
- Files are **never** served statically. Download through an endpoint that checks access:

```js
import { getUploadPath, storedFileExists } from '../utils/paths.js';

export async function downloadFile(req, res) {
  const id = toInt(req.params.id, 'File id');
  const rows = await query('SELECT GroupID, FileName, FilePath FROM `file` WHERE FileID = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'File not found');
  await assertGroupAccess(req.user, rows[0].GroupID);
  if (!storedFileExists(rows[0].FilePath)) throw new HttpError(404, 'The file could not be found on the server.');

  res.download(getUploadPath(rows[0].FilePath), rows[0].FileName); // sets Content-Disposition (UTF-8 safe)
}
// For a video to play in the page: res.sendFile(getUploadPath(storedName)) (supports range requests).
```

- `getUploadPath(storedName)` → absolute path inside `uploads/` (it strips folders, so
  `../../.env` cannot escape). `UPLOAD_DIR` is the absolute folder path.
- `deleteStoredFile(storedName)` → deletes a stored file after you delete its row; never throws.
- The frontend downloads with `fetch` + Bearer token (`api.download`) and makes a `blob:` URL; the
  Content-Security-Policy allows `blob:` for images, media and frames. A `<video src="/api/...">`
  cannot send the token, so fetch the video as a blob first.

### 6.6 `utils/HttpError.js`

```js
import { HttpError } from '../utils/HttpError.js';
throw new HttpError(404, 'Task not found');
throw new HttpError(409, 'A group with this name already exists');
throw new HttpError(400, 'Please enter your feedback', { field: 'comments' }); // details are optional
```

### 6.7 `utils/validate.js`

| Helper | Behaviour |
| --- | --- |
| `requireFields(obj, ['title', 'dueDate'])` | throws 400 `"Due date is required"` (label made from the name) |
| `requireFields(obj, { comments: 'Feedback' })` | custom labels → `"Feedback is required"` |
| `isBlank(value)` | `undefined`, `null` or whitespace-only text |
| `isEmail(value)` | `true/false` |
| `isValidDate('2026-10-05')` | real calendar date in `YYYY-MM-DD` |
| `isValidDateTime('2026-10-05T07:00:00.000Z')` | ISO-like date-time that `new Date()` understands |
| `oneOf(value, list, 'Status')` | returns value or throws 400 `"Status must be one of: ..."` |
| `toInt(value, 'Group id', { min, max })` | returns a whole number or throws 400 |
| `toOptionalInt(value, label)` | `null` for empty values, otherwise like `toInt` |
| `isStrongPassword(pw)` | ≥ 8 characters with a letter and a number |
| `PASSWORD_RULE_MESSAGE` | the message to show when the rule fails |
| `trimOrNull(value)` | trimmed text, or `null` when empty |
| `checkMaxLength(value, 200, 'Title')` | throws 400 when too long |
| `toBool(value)` | `1`, `'1'`, `'true'`, `true` → `true` |

Use the exact messages from the use cases where they exist (e.g. `"Please enter your feedback"`).

### 6.8 Database — `config/db.js`

```js
import { query, withTransaction, likePattern, pool } from '../config/db.js';

const rows = await query('SELECT TaskID AS id, Title AS title FROM task WHERE GroupID = ?', [groupId]); // array
const result = await query('UPDATE task SET Status = ? WHERE TaskID = ?', [status, id]);            // { affectedRows, insertId }

// Several writes that must succeed together:
const submissionId = await withTransaction(async (conn) => {
  const [inserted] = await conn.query('INSERT INTO submission (TaskID, GroupID) VALUES (?, ?)', [taskId, groupId]);
  await conn.query("UPDATE task SET Status = 'Submitted' WHERE TaskID = ?", [taskId]);
  return inserted.insertId; // if anything throws, both changes are undone
});
```

Notes: inside a transaction `conn.query` returns `[rows, fields]` (destructure the first item).
`IN (?)` with an array works, but an **empty array produces invalid SQL** — return early instead.
Table names `user` and `file` are reserved-ish words: write them with backticks (`` `user` ``, `` `file` ``).
For search boxes use `likePattern(text)` with `LIKE ?`: it wraps the text in `%...%` and escapes `%`, `_` and `\`
(e.g. `query('SELECT ... WHERE Title LIKE ?', [likePattern(search)])`).

Database errors are translated automatically by the error handler: duplicate → 409
`"This record already exists."`, missing foreign key → 400 `"A related record was not found."`,
CHECK constraint → 400 `"One of the values is not allowed."`, too long → 400, bad date format → 400.
Still check the important cases yourself with the use-case message (e.g. duplicate group name).

### 6.9 Socket.IO — `socket.js`

Rooms joined automatically when a client connects (`io({ path: '/socket.io', auth: { token } })`):

| Room | Who is in it |
| --- | --- |
| `user:<userId>` | every open tab of that user |
| `group:<groupId>` | the group's students and its supervisor (group chat, FR-9) |
| `staff:<groupId>` | the group's supervisor and examiner (staff channel, FR-10) |

Administrators only join their `user:` room.

```js
import { emitToUser, emitToRoom, refreshUserRooms, disconnectUser } from '../socket.js';

emitToRoom(`group:${groupId}`, 'chat:message', message);   // everyone in the group chat
emitToRoom(`staff:${groupId}`, 'chat:message', message);   // supervisor + examiner channel
emitToUser(userId, 'notification:new', notification);      // notify() already does this for you
await refreshUserRooms(userId); // after changing group membership / supervisor / examiner
await disconnectUser(userId);   // closes the user's live connections (savePassword does this)
```

Every event the server sends (all of them are sent AFTER the data was saved through REST):

| Event | Room | Data | Sent when |
| --- | --- | --- | --- |
| `notification:new` | `user:<id>` | `{ id, type, title, message, link, isRead, createdAt }` | `notify()` created a notification |
| `notification:updated` | `user:<id>` | the same notification object | an unread chat notification was collapsed ("3 new messages in ..."); do not add 1 to an unread count |
| `notification:sync` | `user:<id>` | `{ unreadCount }` | notifications were read, read-all, deleted or a chat channel was opened (maybe in another tab) |
| `chat:message` | `group:<gid>` or `staff:<gid>` | `{ id, groupId, channel, text, date, sender }` | a chat message was sent |
| `chat:deleted` | `group:<gid>` or `staff:<gid>` | `{ id, groupId, channel }` | a sender deleted their message |

- Emit helpers never throw and do nothing before the server starts.
- Save data through REST endpoints first, then emit (the socket is only for live updates).
- Connection errors are sent to the client as `err.message` (`"Please sign in to continue."`).

### 6.10 Rate limiting — `middleware/rateLimit.js`

```js
import { loginLimiter, resetRequestLimiter } from '../middleware/rateLimit.js';
router.post('/login', loginLimiter, login);
router.post('/forgot-password', loginLimiter, resetRequestLimiter, forgotPassword);
```

`loginLimiter`: 20 **failed** requests per 15 minutes per IP → 429 `"Too many attempts. Please wait 15 minutes and try again."`.
Successful requests are not counted, so switching demo accounts during a presentation is never blocked.

`resetRequestLimiter`: 10 forgot-password requests per 15 minutes per IP, **successful ones included** →
429 `"Too many reset requests. Please wait 15 minutes and try again."` (nobody can flood a mailbox with reset emails).

### 6.11 `GET /api/meta/my-groups`

Returns the groups the user can access (all for admins), ordered by name:

```json
[{ "id": 1, "name": "Team Alpha", "projectId": 1, "projectTitle": "Smart Campus Navigation App",
   "projectStatus": "In Progress", "supervisorName": "Dr. Ahmed Alotaibi",
   "examinerName": "Dr. Hessa Aldosari", "memberCount": 3 }]
```

A student without a group (student7) gets `[]`. Groups without a project have `projectId: null`.

---

## 7. Error handling summary

- Unknown `/api/...` URL → 404 `{ error: { message: "API route not found: GET /api/..." } }`.
- Broken JSON body → 400 `"The request body is not valid JSON."`; body over 1 MB → 413.
- Anything unexpected → 500 `"Something went wrong. Please try again."` and the full error is printed
  on the server console (never sent to the client).
- `req.body` is always an object (`{}` when nothing was sent).

---

## 8. Security notes

- helmet sets secure headers (CSP allows `blob:`/`data:`/`https:` images, `blob:` media/frames, `ws:`/`wss:` connections).
- CORS allows only `CLIENT_URL` (the Vite dev server). In development the frontend calls `/api`
  through the Vite proxy, so it is same-origin anyway.
- Passwords are bcrypt hashes (`bcryptjs`, cost 10). Uploaded files are private.
- In production (`APP_ENV=production`) the backend also serves `dist/` with an SPA fallback.

---

## 9. Testing

The whole API has an end-to-end smoke test (about 210 checks, see `scripts/smoke-test.js`):

```bash
npm run db:setup      # fresh demo data first (needed before every run)
npm run test:smoke    # the server must be running (npm run dev); API_URL=... for another address
```

To try a single endpoint by hand while `npm run dev` is running, sign in with a demo account and
send its token (Git Bash):

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"supervisor1@gpmp.edu","password":"Gpmp@2026"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/meta/my-groups
```

---

## 10. Gotchas

1. Express 5 route syntax: wildcards need a name (`/*splat`), optional parts use braces (`/files{/:id}`).
   `req.query` is read-only (do not assign to it).
2. Form fields sent with a file upload are strings — convert numbers with `toInt()`.
3. Check `if (!req.file)` yourself; multer does not require a file.
4. Always `throw` errors (do not `res.status(400).json(...)` by hand) so the format stays the same
   and uploaded files are cleaned up.
5. `IN (?)` with an empty array is a SQL error — handle `[]` first.
6. Send DATETIMEs to MySQL as JS `Date` objects (`new Date(req.body.eventDate)`); DATE columns as `'YYYY-MM-DD'`.
7. The shared academic calendar is the `calendar` row with `GroupID IS NULL`. The UNIQUE key does not stop
   several NULL rows, so always pick `ORDER BY CalendarID LIMIT 1` (the seed creates exactly one).
8. `notify()` and `sendEmail()` never throw — you do not need `try/catch` around them.

---

## 11. Demo data (after `npm run db:setup`)

Password for every account: **Gpmp@2026**. Ids are stable because setup re-creates the tables.

| UserID | Email | Name | Role | Extra |
| --- | --- | --- | --- | --- |
| 1 | admin@gpmp.edu | Nora Alsaleh | Administrator | AdminID 1 |
| 2 | supervisor1@gpmp.edu | Dr. Ahmed Alotaibi | Supervisor | SupervisorID 1 (Alpha, Legacy) |
| 3 | supervisor2@gpmp.edu | Dr. Mona Alshehri | Supervisor | SupervisorID 2 (Beta) |
| 4 | supervisor3@gpmp.edu | Dr. Faisal Alghamdi | Supervisor | SupervisorID 3, **IsAvailable = 0**, no groups |
| 5 | examiner1@gpmp.edu | Dr. Hessa Aldosari | Examiner | ExaminerID 1 (Alpha, Legacy) |
| 6 | examiner2@gpmp.edu | Dr. Omar Alzahrani | Examiner | ExaminerID 2 (Beta) |
| 7–9 | student1–3@gpmp.edu | Sara Alqahtani, Abdullah Alrashid, Reem Almutairi | Student | StudentID 1–3, Team Alpha |
| 10–12 | student4–6@gpmp.edu | Yousef Alshammari, Lama Alanazi, Turki Aldossary | Student | StudentID 4–6, Team Beta |
| 13 | student7@gpmp.edu | Maha Alsubaie | Student | StudentID 7, **no group** |
| 14–15 | student8–9@gpmp.edu | Nawaf Alenezi, Jana Alharthi | Student | StudentID 8–9, Team Gamma |
| 16–17 | alumni1–2@gpmp.edu | Hamad Alkhaldi, Dana Alomari | Student | StudentID 10–11, Team Legacy |

| GroupID | Group | Supervisor / Examiner | Project (ProjectID) | Status | Proposal |
| --- | --- | --- | --- | --- | --- |
| 1 | Team Alpha | supervisor1 / examiner1 | Smart Campus Navigation App (1) | In Progress | Approved |
| 2 | Team Beta | supervisor2 / examiner2 | AI Plant Disease Detector (2) | Proposed | Pending Supervisor |
| 3 | Team Gamma | none / none | none | – | – |
| 4 | Team Legacy | supervisor1 / examiner1 | Library Seat Booking System (3) | Archived, 2024-2025, showcase text, no video | Approved |

Other seeded data:

- **Tasks**: Team Alpha has 13 tasks (TaskID 1–13): 7 Completed, 1 Submitted (TaskID 8 "Database
  Implementation", its submission 7 waits for review), 2 In Progress (TaskID 10 is overdue), 3 To Do;
  milestones are TaskID 1, 11, 13 → about 54% progress. Team Beta: TaskID 14–16. Team Legacy: 17–20 (all Completed).
- **Submissions** 1–7 (Alpha). Task 4 (Chapter 2) has a "Needs Revision" submission (2) and an
  "Approved" resubmission (3). Feedback rows exist for submissions 1–6.
- **Files** (FileID 1–15): 7 submission attachments, Alpha documents (proposal v1 + v2, template,
  minutes, CSV), a Beta proposal, Legacy final report + slides. Real small files exist in `uploads/`
  (`seed-*.pdf/txt/csv`), so downloads work.
- **Calendars**: CalendarID 1 = shared academic calendar (GroupID NULL, 6 'Academic' events), 2 = Alpha,
  3 = Beta, 4 = Gamma, 5 = Legacy. Alpha has two past meetings with attendance (DeadlineID 7, 8), a
  meeting in 2 days (9) and the mid-term presentation in 12 days (10). Past events have `ReminderSent = 1`.
- **Chat**: Alpha group chat (11 messages, the newest about an hour ago) and Alpha staff channel (4), Beta
  group (4) and staff (1), Legacy group (2). Group messages have `ReceiverUserID = NULL`.
- **Announcements**: admin → All, admin → Student (edited), admin → Supervisor, supervisor1 → Team Alpha (TargetRole 'All', GroupID 1).
- **Notifications**: student1 has 5 unread, supervisor1 3 unread; a few for others.
- **Resources**: 8, covering all categories (Tutorial, Tool, Framework, Library, Guide).
