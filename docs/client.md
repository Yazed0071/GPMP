# Client (GPMP website)

This document explains the shared building blocks of the GPMP client (React 19 + Vite 6 +
react-router-dom 7 + socket.io-client 4). Every page is built on top of these pieces, so read
this before writing a page.

- The client is the `src/client/` part of the single GPMP project. Run it from the project folder:
  `npm install` (once), then `npm run dev` (starts the website AND the API), then open http://localhost:5173.
  Vite forwards `/api` and `/socket.io` to the API on http://localhost:5000.
- Change the server address: edit `VITE_BACKEND_URL` in the shared `.env` file.
- Production build: `npm run build` (output in `dist/`).

---

## 1. Folder structure

```
GPMP/                          (only the client parts are shown here)
├── index.html                 page shell (title, favicon = /logo.jpeg, Google Fonts)
├── vite.config.js             dev server on 5173 + proxy /api and /socket.io -> server
├── .env.example               shared settings; VITE_BACKEND_URL is the client one
├── public/logo.jpeg           GPMP logo (use it as src="/logo.jpeg")
└── src/client/
    ├── main.jsx               starts React: BrowserRouter > ToastProvider > AuthProvider > SocketProvider > App
    ├── App.jsx                every route (public + private)
    ├── config/roles.js        ROLES, sidebar NAV, ROUTE_ROLES, permission helpers
    ├── api/
    │   ├── client.js          api.get/post/put/patch/del/upload/download + downloadFile
    │   └── <resource>.js      one file per server resource (e.g. tasks.js)
    ├── context/
    │   ├── AuthContext.jsx    useAuth()
    │   ├── SocketContext.jsx  useSocket(), useSocketEvent(), useSocketStatus()
    │   └── ToastContext.jsx   useToast()
    ├── hooks/
    │   ├── useApi.js          load data with loading/error state
    │   ├── useMyGroups.js     groups the user can open
    │   ├── useGroupParam.js   selected group kept in the URL (?groupId=)
    │   └── useBlobUrl.js      show a protected image/video/PDF
    ├── utils/
    │   ├── format.js          dates, times, file sizes, initials, plural
    │   ├── files.js           upload rules (allowed types, max sizes, empty files)
    │   └── validation.js      shared form checks (EMAIL_PATTERN, isWebLink)
    ├── routes/ProtectedRoute.jsx
    ├── layouts/MainLayout.jsx sidebar + navbar + page area
    ├── components/
    │   ├── layout/            Sidebar.jsx, Navbar.jsx
    │   ├── common/            shared components (section 6)
    │   ├── notifications/     NotificationBell.jsx (in the Navbar)
    │   └── <feature>/         the components of one feature (tasks/, chat/, ...)
    ├── pages/                 one file per route (section 2)
    └── styles/
        ├── global.css         design tokens + shared classes
        └── <feature>.css      the styles of one feature, imported by its pages
```

---

## 2. Routing and roles

`src/client/App.jsx` lists every route. Public routes are shown on their own; private routes are shown
inside `MainLayout` and wrapped twice by `ProtectedRoute` (once for "logged in", once for the
page's roles).

| Path | Page file | Roles |
|---|---|---|
| `/` | LandingPage | public |
| `/login` | LoginPage | public |
| `/forgot-password` | ForgotPasswordPage | public |
| `/reset-password` | ResetPasswordPage | public (`?token=`) |
| `/dashboard` | DashboardPage | all |
| `/project` | MyProjectPage | Student |
| `/groups`, `/groups/:id` | GroupsPage, GroupDetailPage | Supervisor, Examiner, Administrator |
| `/supervisors` | SupervisorsPage | Student, Administrator |
| `/proposals` | ProposalsPage | Supervisor, Examiner, Administrator |
| `/showcase` | ShowcasePage | all |
| `/tasks`, `/tasks/:id` | TasksPage, TaskDetailPage | all |
| `/documents` | DocumentsPage | all |
| `/calendar` | CalendarPage | all |
| `/attendance` | AttendancePage | Student, Supervisor, Administrator |
| `/chat` | ChatPage | Student, Supervisor, Examiner |
| `/announcements` | AnnouncementsPage | all |
| `/notifications` | NotificationsPage | all |
| `/resources` | ResourcesPage | all |
| `/users` | UsersPage | Administrator |
| `/profile` | ProfilePage | all |
| `*` | NotFoundPage | anyone |

### How ProtectedRoute works
- While `useAuth().loading` is true (checking a saved token) it shows a full-page `<Loading />`.
- Not logged in -> redirects to `/login` with `location.state.from = { pathname, search, hash }`
  of the page the user wanted. After login, the login page should do:
  ```js
  const from = location.state?.from;           // may be undefined
  navigate(from || '/dashboard', { replace: true });
  ```
- Logged in but the role is not allowed -> redirects to `/dashboard`.
- After a deliberate "Sign out" (`useAuth().signedOut` is true) the page is NOT remembered, so the next
  person who signs in on the same browser starts at `/dashboard`. An expired session still remembers it.

### config/roles.js
```js
import { ROLES, ALL_ROLES, NAV, ROUTE_ROLES, rolesFor, navFor, pageTitleFor,
  isStudent, isExaminer, isAdmin,
  canPostAnnouncements, canTakeAttendance, canUseChat } from '../config/roles.js';

ROLES.STUDENT === 'Student'; ROLES.ADMIN === 'Administrator';
canPostAnnouncements(user.role)  // Supervisor or Administrator (FR-12)
```
- `NAV` = sidebar sections (Main, Project, Admin, Account) with `{ to, label, icon, roles }`.
- `ROUTE_ROLES` = allowed roles per private path. To change who can open a page, edit it here.
- Buttons inside pages mostly follow the `permissions` object (or `canEdit` / `canDelete` flags) that the
  server sends with the data, because many rules depend on more than the role (the group, the creator,
  an archived project...). The helpers above cover the simple role checks.
- The helpers only decide what the interface SHOWS. The backend always checks permissions again.

---

## 3. Calling the API (`src/client/api/client.js`)

All paths are relative to `/api`. The token from `localStorage['gpmp_token']` is added
automatically. JSON is converted for you. Empty query values (`undefined`, `null`, `''`) are skipped.

```js
import { api, downloadFile, ApiError } from '../api/client.js';

const tasks  = await api.get('/tasks', { groupId: 3, status: 'To Do' }); // GET /api/tasks?groupId=3&status=To%20Do
const task   = await api.post('/tasks', { groupId: 3, title: 'Write chapter 1' });
const saved  = await api.put(`/tasks/${id}`, { title: 'New title' });
const status = await api.patch(`/tasks/${id}/status`, { status: 'Completed' });
const result = await api.del(`/tasks/${id}`);               // -> { message }

// Upload files (FormData). Field names must match the backend: 'file', 'files' or 'video'
const form = new FormData();
form.append('file', file);
form.append('groupId', 3);
const uploaded = await api.upload('/files', form);           // POST (default)
await api.upload(`/files/${id}`, form, 'PUT');               // other method

// Download a protected file to the user's computer
await downloadFile(`/files/${id}/download`, 'report.pdf');  // name optional (server name used)

// Get a protected file as a Blob (e.g. to preview) - or use the useBlobUrl hook
const blob = await api.download(`/showcase/${projectId}/video`);
```

### Put API functions in `src/client/api/<resource>.js`
One file per server resource, e.g. `src/client/api/tasks.js`:
```js
// API functions for tasks (FR-14)
import { api } from './client.js';

export const getTasks = (params) => api.get('/tasks', params);
export const createTask = (data) => api.post('/tasks', data);
export const deleteTask = (id) => api.del(`/tasks/${id}`);
```

### Error handling
Every failed call throws an `ApiError` with:
- `err.message` — the server's `error.message`, ready to show to the user
- `err.status` — HTTP status (0 = server unreachable, e.g. "Cannot reach the server...")
- `err.details` — optional extra data from the server

```js
try {
  await createTask(values);
  toast.success('Task created');
} catch (err) {
  toast.error(err.message);        // or: setFormError(err.message) to show it inside the form
}
```
If a request that carried a token gets **401**, the client deletes the token and fires the
window event `gpmp:unauthorized`; `AuthContext` then logs the user out and shows
"Your session has ended. Please sign in again." (see Gotchas).

---

## 4. Hooks

### useAuth()
```js
import { useAuth } from '../context/AuthContext.jsx';
const { user, loading, login, logout, refreshUser, hasRole } = useAuth();
// user = { id, name, email, role, studentId, supervisorId, examinerId, adminId, groupId } or null
await login(email, password);  // returns user; throws ApiError (show err.message)
logout();                      // clears token + user (then navigate('/login')); sets signedOut = true
await refreshUser();           // re-reads GET /auth/me (after profile change, joining a group...)
hasRole('Supervisor', 'Administrator');   // true / false
```

### useApi(fetcher, deps)
```js
import { useApi } from '../hooks/useApi.js';

const { data: tasks, loading, error, reload, setData } =
  useApi(() => (groupId ? getTasks({ groupId }) : Promise.resolve([])), [groupId]);

if (loading) return <Loading />;
if (error) return <ErrorMessage error={error} onRetry={reload} />;
if (tasks.length === 0) return <EmptyState icon="tasks" title="No tasks yet" />;
```
- Runs the fetcher on first render and whenever a value in `deps` changes (loading = true).
- `reload()` fetches again. If data is already on screen it refreshes quietly (no spinner, no
  flashing). Call it after create/update/delete. It returns a promise.
- `setData(newValue)` or `setData((old) => ...)` updates the shown data yourself (e.g. append a
  chat message that arrived over the socket).
- Only the newest request updates the state, so fast group switching is safe.

### useMyGroups()
```js
const { groups, loading, error, reload } = useMyGroups();
// groups = [{ id, name, projectId, projectTitle, projectStatus, supervisorName, examinerName, memberCount }]
```
Students get their own group (or `[]`), supervisors/examiners their assigned groups,
administrators all groups. Call `reload()` after creating/joining a group.

### useGroupParam()
Keeps the selected group in the URL (`?groupId=3`) so pages can link to each other.
```js
const [groupId, setGroupId] = useGroupParam();   // number or null
<GroupSelect value={groupId} onChange={setGroupId} />
// Link from another page: <Link to={`/tasks?groupId=${group.id}`}>Tasks</Link>
```

### useToast()
```js
const toast = useToast();
toast.success('Announcement posted');
toast.error(err);          // an Error/ApiError object or a string
toast.info('Saved as draft');
```

### useSocket(), useSocketEvent(event, handler), useSocketStatus()
The socket connects automatically after login (`auth: { token }`) and disconnects on logout.
```js
import { useSocket, useSocketEvent, useSocketStatus } from '../context/SocketContext.jsx';

// Listen to a server event (removed automatically on unmount; handler always sees fresh state)
useSocketEvent('notification:new', (notification) => {
  setData((list) => [notification, ...(list || [])]);
});

// Send an event (check for null: the socket exists only while logged in)
const socket = useSocket();
socket?.emit('some:event', payload);

// Re-load missed data after a reconnect
useSocketEvent('connect', () => reload());

const connected = useSocketStatus();   // true/false, e.g. to show "Offline"
```

Events sent by the server (details in [server.md](server.md), section 6.9):
`notification:new` (a new notification), `notification:updated` (a collapsed chat notification changed —
do not add 1 to an unread count), `notification:sync` (`{ unreadCount }` after something was read or deleted),
`chat:message` and `chat:deleted`. The Navbar bell, the Notifications page, the Chat page and the Sidebar's
unread-chat badge all listen to them.

### useBlobUrl(path)
Protected files cannot be used directly in `<img src>` / `<video src>` (no token is sent), so load
them as a blob first:
```js
const { url, loading, error } = useBlobUrl(project.hasVideo ? `/showcase/${project.id}/video` : null);
{url && <video src={url} controls className="show-video" />}
```

---

## 5. Formatting and file helpers

`src/client/utils/format.js`:

| Function | Example |
|---|---|
| `formatDate(value)` | `'2026-05-22'` or ISO -> `"May 22, 2026"` (DATE strings read as local dates) |
| `formatLongDate(value?)` | `"Sunday, May 10, 2026"` (default: today) |
| `formatDateTime(iso)` | `"May 22, 2026, 10:00 AM"` |
| `formatTime(iso)` | `"10:00 AM"` |
| `timeAgo(iso)` | `"just now"`, `"5 minutes ago"`, `"yesterday"`, `"in 3 days"`, else a date |
| `formatFileSize(bytes)` | `1536` -> `"1.5 KB"` |
| `toISO(localInput)` | `<input type="datetime-local">` value -> ISO UTC string (or `null` when empty) |
| `toLocalInput(iso)` | ISO -> value for `<input type="datetime-local">` |
| `todayISO()` | today as `'YYYY-MM-DD'` (e.g. `min` of a date input) |
| `daysUntil(value)` | whole days from today (0 = today, negative = past) |
| `isOverdue(value)` | `true` when the date has passed (a DATE is overdue only after that day) |
| `initials(name)` | `"Dr. Kamal Ali"` -> `"KA"` |
| `plural(n, word)` | `plural(3, 'task')` -> `"3 tasks"` |
| `toDate(value)` | parses any of the above into a `Date` (or `null`) |

Invalid/empty values return `"—"`.

Sending dates: DATE columns go as `'YYYY-MM-DD'` (the value of `<input type="date">` as-is);
DATETIME columns go as ISO strings: `toISO(form.startLocal)`.

`src/client/utils/files.js`: `MAX_FILE_MB` (20), `MAX_VIDEO_MB` (200), `MAX_FILES_PER_UPLOAD` (5),
`DOCUMENT_EXTENSIONS`, `VIDEO_EXTENSIONS`, `ACCEPT_DOCUMENTS`, `ACCEPT_VIDEOS` (for `accept=`),
`fileExtension(name)`, `checkFile(file, 'document' | 'video')` -> error message or `null`,
`fileIconName(name)` -> an Icon name (`image`, `video`, `archive`, `document`, `file`).
`checkFile` also refuses empty (0-byte) files: `The file is empty or damaged. Please choose it again.`

`src/client/utils/validation.js`: `EMAIL_PATTERN` (the simple email check used by the login, forgot-password
and user forms) and `isWebLink(text)` (a link must start with `http://` or `https://`, like on the backend;
used by the resource and submit-work forms).

---

## 6. Common components (`src/client/components/common/`)

All are default exports: `import Card from '../components/common/Card.jsx';`

| Component | Props |
|---|---|
| **Card** | `title`, `subtitle`, `icon` (Icon name), `iconColor` (teal\|blue\|green\|amber\|orange\|red\|purple\|navy\|gray), `actions` (node, right side of header), `flush` (no body padding - for tables/lists), `className`, `children`, other props go to `<section>` |
| **PageHeader** | `title` (required), `subtitle`, `actions` (node), `backTo` (path for a "Back" link above the title), `backLabel` (default "Back") |
| **Modal** | `open`, `onClose`, `title`, `children`, `footer` (node), `size` ("small"\|"medium"\|"large"), `closeOnBackdrop` (default true; use `false` for dialogs with a form so typed text is not lost). Escape / X / backdrop close it; focus moves inside (to the element with `data-autofocus`, else the first field or footer button) and returns afterwards; Tab stays inside; page scroll is locked. Modals can be stacked (e.g. a `ConfirmButton` inside a dialog): only the top one reacts to Escape/Tab, and scrolling comes back when the last one closes. |
| **ConfirmButton** | `onConfirm` (async, required; errors are shown as a toast automatically), `children` (default "Delete"), `title`, `message`, `confirmLabel` (default "Delete"), `cancelLabel`, `danger` (default true), `className` (default "btn btn-danger"), `disabled`, `ariaLabel` (for icon-only buttons) |
| **Loading** | `text` (default "Loading..."), `fullPage`, `inline` |
| **ErrorMessage** | `error` (Error\|string), `message` (override), `title` (default "Something went wrong"), `onRetry` (shows "Try again") |
| **EmptyState** | `icon` (default "folder"), `title`, `message`, `action` (node), `compact` |
| **StatusBadge** | `status` (required), `children` (label override), `dot`, `className`. Also `statusColor(status)` named export -> color name. |
| **GroupSelect** | `value` (number\|null), `onChange(idOrNull)`, `label` ("Group"), `id` ("group-select"), `includeAll`, `allLabel` ("All groups"), `autoSelect` (default true: picks the first group when empty; ignored with includeAll), `hideLabel`, `disabled` |
| **Tabs** | `tabs` (array of strings or `{ value, label, count?, icon? }`), `active`, `onChange(value)`, `ariaLabel` |
| **FormField** | `id` (required), `label` (required), `required`, `hint`, `error`, `as` ("input"\|"textarea"), `children` (your own control with the same id), `className`, other props go to the built-in input |
| **StatCard** | `icon`, `color` (tile color, default teal), `value`, `label`, `tag` (small pill), `tagColor` (badge color, default green), `to` (makes the card a link) |
| **ProgressBar** | `value` (0-100), `label`, `showValue`, `color` (teal\|green\|blue\|amber\|red\|purple), `size` ("medium"\|"small") |
| **ProgressRing** | `value` (0-100), `size` (px, 140), `stroke` (px, 12), `label` |
| **Avatar** | `name` (required), `size` ("small" 28px\|"medium" 36px\|"large" 56px), `className`. Color is stable per name. |
| **FileDrop** | `onFiles(validFiles)` (required), `files` (File[] to list), `onRemove(index)`, `multiple` (max 5), `kind` ("document"\|"video"), `id` ("file-input"), `label` ("Attach file"), `hint`, `disabled`. Checks type/size before upload and shows the backend's messages ("This file type is not allowed.", "The file is too large (maximum 20 MB)."). |
| **Icon** | `name` (required), `size` (20), `strokeWidth` (2), `className`, `title` (makes it announced by screen readers). Uses `currentColor`. `ICON_NAMES` named export. |

Icon names: `dashboard project users user chat calendar megaphone tasks document file folder
proposal supervisor attendance book trophy bell logout menu plus edit trash download upload send
check x search clock link externalLink video image paperclip flag archive shield lock mail home
mapPin trendingUp star info alert eye eyeOff filter refresh more arrowRight arrowLeft chevronDown
chevronUp chevronLeft chevronRight`.

### Typical page skeleton
```jsx
// TasksPage: tasks, milestones and progress of a group (FR-14, UI fig 46)
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import GroupSelect from '../components/common/GroupSelect.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import FormField from '../components/common/FormField.jsx';
import Icon from '../components/common/Icon.jsx';
import { useApi } from '../hooks/useApi.js';
import { useGroupParam } from '../hooks/useGroupParam.js';
import { useToast } from '../context/ToastContext.jsx';
import { getTasks, createTask } from '../api/tasks.js';
import '../styles/tasks.css';

export default function TasksPage() {
  const toast = useToast();
  const [groupId, setGroupId] = useGroupParam();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: tasks, loading, error, reload } =
    useApi(() => (groupId ? getTasks({ groupId }) : Promise.resolve([])), [groupId]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return setFormError('Please enter a task title');
    setSaving(true);
    try {
      await createTask({ groupId, title: title.trim() });
      toast.success('Task created');
      setShowForm(false);
      setTitle('');
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tasks & Progress"
        subtitle="Track your team's tasks, deadlines and overall progress."
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={18} /> Add Task
          </button>
        }
      />
      <GroupSelect value={groupId} onChange={setGroupId} />

      {loading ? <Loading /> : error ? <ErrorMessage error={error} onRetry={reload} />
        : tasks.length === 0 ? <EmptyState icon="tasks" title="No tasks yet" />
        : <ul className="list">{tasks.map((t) => <li key={t.id}>{t.title}</li>)}</ul>}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Task">
        <form className="form" onSubmit={handleSubmit} noValidate>
          {formError && <div className="alert alert-error">{formError}</div>}
          <FormField id="task-title" label="Title" required value={title}
                     onChange={(e) => setTitle(e.target.value)} />
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
```

---

## 7. CSS conventions (`src/client/styles/global.css`)

### Design tokens (CSS variables on `:root`)
- Brand: `--navy-950/900/800/700/100`, `--teal-700/600/500/400/300/100/50`
- Meaning: `--color-primary` (teal), `--color-primary-hover`, `--color-primary-soft`, `--color-navy`,
  `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, `--color-purple`,
  `--color-orange` (+ `-soft` background versions of each)
- Grays: `--gray-50` ... `--gray-800`
- Surfaces/text: `--color-bg`, `--color-surface`, `--color-text`, `--color-heading`, `--color-muted`, `--color-border`
- Type: `--font-sans` (DM Sans), `--font-display` (Playfair Display, for hero titles)
- Shape: `--radius-sm` 8, `--radius` 12, `--radius-lg` 16, `--radius-xl` 20, `--radius-full`;
  `--shadow-sm`, `--shadow`, `--shadow-lg`
- Spacing: `--space-1` (4px) ... `--space-8` (32px); layout: `--sidebar-width`, `--navbar-height`, `--transition`

Always use tokens instead of raw colors, e.g. `color: var(--color-muted)`.

### Shared classes
- **Buttons:** `.btn` + `.btn-primary` (teal) / `.btn-secondary` (white, bordered) / `.btn-danger` /
  `.btn-dark` (navy) / `.btn-ghost`; sizes `.btn-small`, `.btn-large`; `.btn-icon` (square, icon only -
  add `aria-label`), `.btn-block` (full width); `.link-button` (button that looks like a link);
  `.actions` (row of buttons).
- **Forms:** `.form` (vertical, 1rem gaps), `.form-row` (2 columns, 1 on phones), `.form-field`,
  `.field-hint`, `.field-error`, `.required`, `.form-actions` (buttons aligned right),
  `.checkbox` (label wrapping a checkbox), `.input-with-icon` (icon + input, e.g. search).
  Inputs/selects/textareas are styled globally.
- **Alerts:** `.alert` + `.alert-error` / `.alert-success` / `.alert-info` / `.alert-warning`.
- **Cards and layout:** `.card` (+ `.card-header`, `.card-title`, `.card-body` - prefer the Card
  component), `.grid` (auto columns >= 280px), `.grid-2`, `.grid-3`, `.grid-4`, `.stats-grid`
  (row of StatCards), `.split` (2/3 + 1/3 columns like the dashboard), `.hero` (navy banner with
  serif title), `.section-title`, `.icon-tile` + `.tile-<color>`.
  Cards have a bottom margin; inside `.grid*`, `.stats-grid`, `.split`, `.stack`, `.row` the margin is removed.
- **Tables:** `<div className="table-wrap"><table className="table">...</table></div>`;
  `.actions-cell` for the right-aligned buttons column. Put tables in `<Card flush>`.
- **Lists:** `.list` (divided rows), `.meta` (small grey details line).
- **Badges:** `.badge` + `.badge-gray|blue|teal|green|amber|orange|red|purple|navy`, `.badge-dot`
  (prefer `<StatusBadge>`).
- **Other components:** `.tabs`/`.tab`, `.empty-state`, `.page-header`, `.stat-card`, `.progress`,
  `.progress-ring`, `.avatar` (+ `.avatar-stack` for overlapping avatars), `.modal`, `.toast`,
  `.spinner`, `.file-drop`, `.file-list`.
- **Public pages:** `.public-page` (centered full-screen background) and `.public-card` (white
  460px card), used by the 404 page.
- **Utilities:** `.muted`, `.small`, `.tiny`, `.bold`, `.text-danger`, `.text-success`,
  `.text-warning`, `.text-center`, `.text-right`, `.font-display`, `.stack` / `.stack-sm` /
  `.stack-lg` (vertical gaps), `.row` (horizontal, wraps), `.row-between`, `.row-nowrap`, `.spacer`,
  `.truncate`, `.nowrap`, `.w-full`, `.mt-0..3`, `.mb-0..3`, `.sr-only`, `.hide-mobile`, `.show-mobile`.

### Feature stylesheets
Put the styles of a feature in `src/client/styles/<feature>.css` and import it from its pages
(`import '../styles/tasks.css';`). Every class MUST start with the feature's prefix:

| Prefix | Area | Prefix | Area |
|---|---|---|---|
| `auth-` | landing, login, password pages | `cal-` | calendar |
| `users-` | user management | `att-` | attendance |
| `profile-` | profile | `dash-` | dashboard |
| `proj-` | projects, groups, proposals, supervisors | `chat-` | chat |
| `show-` | showcase | `ann-` | announcements |
| `task-` | tasks, submissions, feedback | `notif-` | notifications |
| `doc-` | documents/files | `res-` | resources |

Load order: `main.jsx` imports `global.css` BEFORE `App.jsx`, so every feature stylesheet comes later and
wins when a feature rule and a global rule have the same specificity. Vite puts all CSS into one file,
so feature rules apply on every page — that is why every feature class needs its prefix.

### Responsive rules (NFR-13)
- `> 1024px`: fixed sidebar. `<= 1024px`: the sidebar is a drawer opened by the menu button.
- `<= 1200px`: `.grid-4`/`.stats-grid`/`.grid-3` become 2 columns, `.split` becomes 1 column.
- `<= 640px`: `.grid-2/3/4` and `.form-row` become 1 column, modals slide up from the bottom,
  inputs use 16px text (no zoom on phones). Test your page at 375px width: nothing may scroll
  sideways (wrap wide tables in `.table-wrap`).

---

## 8. Gotchas

1. **401 logs the user out.** A 401 on any request that carries a token clears the session. The
   backend must use **400** (not 401) for "current password is incorrect" on change-password, and
   403 for "not allowed".
2. **Check `groupId` before loading group data.** `useGroupParam()` returns `null` until
   `GroupSelect` auto-selects the first group, so write
   `useApi(() => (groupId ? getX({ groupId }) : Promise.resolve([])), [groupId])`.
   A student with no group gets `groups = []` - show an EmptyState (e.g. "You are not in a group yet").
3. **Files are protected.** Never put `/api/...` URLs in `<a href>`, `<img src>` or `<video src>`:
   use `downloadFile(path, name)` for downloads and `useBlobUrl(path)` for previews.
4. **FormData field names** must match the backend multer fields: `file` (single), `files`
   (up to 5), `video` (showcase).
5. **Dates:** DATE columns are `'YYYY-MM-DD'` strings (use them directly in `<input type="date">`);
   DATETIME values are ISO UTC strings (convert with `toLocalInput` / `toISO`). Never do
   `new Date('2026-05-22')` yourself for display - use `formatDate`, which avoids the "one day
   earlier" timezone bug.
6. **useSocket() can be null** (before login or while connecting): always write `socket?.emit(...)`.
   `useSocketEvent` handles this for you.
7. **Hide buttons by role** with `useAuth().hasRole(...)` or the helpers in `config/roles.js`; the
   backend enforces permissions anyway, so still handle 403 errors with a toast.
8. **Every input needs a label** (`FormField`, or `<label htmlFor>`; use `.sr-only` for a hidden
   label). Icon-only buttons need `aria-label`.
9. **Confirm destructive actions** with `ConfirmButton` (it shows errors itself; on success show a
   toast inside your `onConfirm`).
10. **No icon or UI libraries** - use `Icon` and the shared classes.
11. The **Navbar title** comes from the sidebar label of the current path (`pageTitleFor`), so pages
    do not need to set it.
