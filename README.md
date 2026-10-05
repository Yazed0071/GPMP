# GPMP - Graduation Project Management Platform

GPMP is a web application for **Al-Yamamah University** that brings the whole graduation project
into one place. Students, supervisors, examiners and administrators use it from the first group
meeting to the final showcase.

It is built with **React** (website), **Node.js + Express** (REST API and live updates with
Socket.IO) and **MySQL/MariaDB** (XAMPP).

---

## Contents

1. [Features](#1-features)
2. [Tech stack](#2-tech-stack)
3. [Folder structure](#3-folder-structure)
4. [Getting started (Windows)](#4-getting-started-windows)
5. [Demo accounts](#5-demo-accounts)
6. [Running the smoke test](#6-running-the-smoke-test)
7. [Requirements map](#7-requirements-map)
8. [Differences from the report's database design](#8-differences-from-the-reports-database-design)
9. [Known limitations](#9-known-limitations)
10. [More documentation](#10-more-documentation)

---

## 1. Features

- **Accounts and roles** - four roles (Student, Supervisor, Examiner, Administrator), secure sign-in
  with an account lock after wrong passwords, password reset by email and user management.
- **Groups and projects** - groups choose an available supervisor, create their project and submit
  a proposal that is reviewed by the supervisor and then the examiner.
- **Tasks and milestones** - plan tasks, follow the progress, submit work (files or a link) and
  receive structured feedback.
- **Documents** - upload group documents with versions; files are private and can only be
  downloaded by the people who are allowed to see them.
- **Calendar and attendance** - meetings, deadlines, presentations and academic dates with conflict
  warnings and reminders, and attendance for every meeting.
- **Communication** - live group chat, a private supervisor–examiner channel, announcements and
  notifications (in the app and by email).
- **Archive and showcase** - finished projects are archived (read-only) and shown in a projects
  showcase with a description and a video.
- **Dashboards and resources** - a start page for every role and a page of tutorials and tools.
- **Responsive** - every page works from phone width to desktop.

---

## 2. Tech stack

The system follows the three-layer architecture from the report:

| Layer | Technology | What it does |
| --- | --- | --- |
| Presentation | **React 19** + **Vite 6** + React Router 7 | The website (pages, forms, the live chat) |
| Application | **Node.js 24** + **Express 5** | The REST API under `/api` |
| Real-time | **Socket.IO** | Live chat messages and notifications without refreshing the page |
| Data | **MySQL / MariaDB** (from **XAMPP**) through `mysql2` | Stores all the data |
| Security | **JWT** login tokens, **bcrypt** password hashes, Helmet, rate limiting | Sign in, roles and protection (NFR-8, NFR-9, NFR-10) |
| Files & email | multer (uploads), nodemailer (email) | Documents, submissions, showcase videos, email notifications |

No UI library is used: the design (navy sidebar, teal accents, white cards) is plain CSS that follows the
UI prototype in the report.

---

## 3. Folder structure

The server (backend) and the website (frontend) live in **one project** with one `package.json`,
one `npm install` and one `npm run dev`. All the code is in `src/`:

```
GPMP/
├── README.md               <- this file
├── package.json            <- ONE file for everything: scripts dev, build, start, db:setup, test:smoke
├── .env.example            <- settings template (copy to .env)
├── index.html              <- the single HTML page; it loads src/client/main.jsx
├── vite.config.js          <- dev server on port 5173, forwards /api and /socket.io to the server
├── public/logo.jpeg
├── database/
│   ├── schema.sql          <- all tables (the database design)
│   ├── setup.js            <- "npm run db:setup": creates the tables + demo data
│   ├── seed.js             <- the demo data
│   └── seed-files.js       <- small demo PDF/TXT/CSV files
├── scripts/
│   └── smoke-test.js       <- "npm run test:smoke": end-to-end test of the whole API
├── uploads/                <- uploaded files (never public; downloaded only through checked endpoints)
├── docs/                   <- technical documentation (start at docs/README.md)
└── src/
    ├── server/             <- BACKEND: Node.js + Express API (runs on port 5000)
    │   ├── server.js       <- starts the HTTP server, Socket.IO and the reminder job
    │   ├── app.js          <- the Express app: security, routes, error handling
    │   ├── socket.js       <- Socket.IO (live chat + notifications)
    │   ├── config/         <- settings (env.js) and the database connection (db.js)
    │   ├── middleware/     <- login check, roles, uploads, rate limiting, error handler
    │   ├── routes/         <- one file per feature: which URL calls which function
    │   ├── controllers/    <- one file per feature: the logic and the SQL
    │   ├── services/       <- shared logic: access rules, notifications, email, reminders
    │   └── utils/          <- small helpers (validation, errors, file paths)
    └── client/             <- FRONTEND: React website (runs on port 5173 while developing)
        ├── main.jsx        <- starts React
        ├── App.jsx         <- every page address (route)
        ├── api/            <- one file per server resource (tasks.js, groups.js, ...)
        ├── components/     <- reusable pieces, one folder per feature + common/
        ├── config/roles.js <- which role sees which page and menu item
        ├── context/        <- logged-in user, live connection, pop-up messages
        ├── hooks/          <- useApi, useMyGroups, useGroupParam, useBlobUrl
        ├── layouts/        <- the page frame (sidebar + top bar)
        ├── pages/          <- one file per page
        ├── routes/         <- ProtectedRoute (sign-in and role check)
        ├── styles/         <- global.css + one stylesheet per feature
        └── utils/          <- date, file and form helpers
```

The two halves never import each other's code: the client talks to the server only through the
`/api` addresses and the live Socket.IO connection. The Vite dev server is also set up to **refuse**
to hand out `src/server/`, `database/`, `scripts/`, `uploads/` and `.env`.

---

## 4. Getting started (Windows)

### What you need (install once)

- **XAMPP** (for MySQL/MariaDB): <https://www.apachefriends.org>
- **Node.js** 20 or newer (24 recommended): <https://nodejs.org>
- **Git**: <https://git-scm.com>
- A terminal: *Command Prompt*, *PowerShell* or *Git Bash* all work.

### Step 1 - Get the code

```bash
git clone https://github.com/Yazed0071/GPMP.git
cd GPMP
```

All the commands below are run in this `GPMP` folder (the one that contains `package.json`).

### Step 2 - Install and configure (first time only)

Install everything (server and website together) and create your settings file:

```bash
npm install
copy .env.example .env
```

(`copy` is for Command Prompt/PowerShell; in Git Bash use `cp .env.example .env`.)

Open `.env` in an editor and replace the value of `JWT_SECRET` with a long random text
(at least 32 characters). This command prints one you can paste:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The other settings already match a default XAMPP installation (user `root`, empty password,
database `gpmp`).

### Step 3 - Start MySQL

Open the **XAMPP Control Panel** and click **Start** next to **MySQL**. It must stay green while you
use GPMP. (Apache is not needed.)

### Step 4 - Create the database (first time only)

```bash
npm run db:setup
```

This creates the `gpmp` database with all tables and the demo data.

> `npm run db:setup` **deletes all GPMP data** (and uploaded files) and creates fresh demo data.
> Run it again whenever you want to reset the demo, and after updating the code when
> `database/schema.sql` changed. Take a backup first if you want to keep your data (see below).

### Step 5 - Start GPMP (every time)

```bash
npm run dev
```

This **one command starts both parts** in the same terminal. Lines starting with `[server]` come from
the Node.js server, lines starting with `[client]` from the website. You should see
`GPMP API running at http://localhost:5000/api`, `Connected to MySQL database "gpmp"` and
`Local: http://localhost:5173/`. Leave the terminal open; press `Ctrl + C` to stop both.

### Step 6 - Open GPMP

Go to **<http://localhost:5173>** in your browser, click **Sign in** and use one of the
[demo accounts](#5-demo-accounts).

### Backing up the data (NFR-5)

GPMP keeps its data in two places: the MySQL database **and** the uploaded files in `uploads/`
(files are stored outside the database). A backup therefore needs both steps. In Git Bash, from the
`GPMP` folder (MySQL must be running):

```bash
mkdir -p backups
/c/xampp/mysql/bin/mysqldump.exe -u root gpmp > backups/gpmp-$(date +%F).sql
cp -r uploads/ backups/uploads-$(date +%F)
```

To restore a backup (replace `YYYY-MM-DD` with the date of the backup):

```bash
/c/xampp/mysql/bin/mysql.exe -u root gpmp < backups/gpmp-YYYY-MM-DD.sql
cp -r backups/uploads-YYYY-MM-DD/. uploads/
```

Take a backup regularly (for example once a week during the semester) and **always before
`npm run db:setup`**, which deletes everything. The `backups/` folder is ignored by Git.

### Emails

While `SMTP_HOST` in `.env` is empty, emails (for example the password-reset link, new
announcements and proposal decisions) are **not sent**; they are printed in the terminal as
`[email preview]`. While `SMTP_HOST` is empty, the forgot-password page **on this computer** also shows
the reset link directly (never on another device of the network, never in production, and never once
real emails are sent). To send real emails, fill in the `SMTP_*` settings in `.env`.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the server **and** the website; restarts the server when you save a server file |
| `npm run dev:server` | Starts only the server (port 5000) |
| `npm run dev:client` | Starts only the website (port 5173) |
| `npm run db:setup` | Resets the database and uploads to the demo data |
| `npm run test:smoke` | Runs the end-to-end test (see [section 6](#6-running-the-smoke-test)) |
| `npm run build` | Builds the website into `dist/` |
| `npm start` | Starts the server without auto-restart (serves `dist/` in production mode) |

**Single-server demo (optional):** run `npm run build`, set `APP_ENV=production` in `.env` and run
`npm start`; the server then serves the website itself at <http://localhost:5000>. In production mode
the reset link is only sent by email, so configure SMTP. Set `APP_ENV` back to `development` afterwards.

> The mode is called `APP_ENV` (not `NODE_ENV`) on purpose: the website build reads the same `.env`
> file, and a `NODE_ENV=development` line there would make `npm run build` produce a slow debug build.

### Common problems

| Problem | Solution |
| --- | --- |
| `Cannot connect to MySQL` (setup) or `Cannot reach MySQL` (server) | Start MySQL in the XAMPP Control Panel. |
| XAMPP says **"MySQL shutdown unexpectedly"**, or the website says **"The database is not set up completely"** (the terminal lists missing tables) | MySQL (the MariaDB 10.4 that comes with XAMPP) can crash while `npm run db:setup` rebuilds the tables, leaving only some of them. Click **Start** next to MySQL in XAMPP (it repairs itself), wait about 10 seconds, then run `npm run db:setup` again. You do not need to stop `npm run dev`. |
| `JWT_SECRET is missing or still the example value` | You did not create `.env` in the `GPMP` folder or did not replace `JWT_SECRET` with a long random text (step 2). |
| `APP_TIME_ZONE "..." is not a valid time zone` | Fix the `APP_TIME_ZONE` line in `.env` (for example `Asia/Riyadh`), or remove it. |
| `Port 5000 is already in use` or `Port 5173 is in use` | GPMP is already running in another terminal. Close it first (`Ctrl + C`). |
| The website says "Cannot reach the server" | The server part is not running: start GPMP with `npm run dev` (step 5) and check the `[server]` lines for errors. |
| "Too many attempts" when signing in | 20 wrong sign-ins from one computer in 15 minutes. Wait, or restart GPMP. |

---

## 5. Demo accounts

Every demo account uses the same password: **`Gpmp@2026`**

| Email | Role | Name | What to try |
| --- | --- | --- | --- |
| admin@gpmp.edu | Administrator | Nora Alsaleh | Users, groups, supervisors, all proposals, platform dashboard |
| supervisor1@gpmp.edu | Supervisor | Dr. Ahmed Alotaibi | Supervises Team Alpha and Team Legacy: feedback, attendance, chat |
| supervisor2@gpmp.edu | Supervisor | Dr. Mona Alshehri | Supervises Team Beta, whose proposal waits for review |
| supervisor3@gpmp.edu | Supervisor | Dr. Faisal Alghamdi | Marked **not available** (students cannot choose him) |
| examiner1@gpmp.edu | Examiner | Dr. Hessa Aldosari | Examines Team Alpha and Team Legacy, staff chat |
| examiner2@gpmp.edu | Examiner | Dr. Omar Alzahrani | Examines Team Beta |
| student1@gpmp.edu, student2@gpmp.edu, student3@gpmp.edu | Student | Sara, Abdullah, Reem | **Team Alpha** - "Smart Campus Navigation App", In Progress, tasks in every status, chat, documents |
| student4@gpmp.edu, student5@gpmp.edu, student6@gpmp.edu | Student | Yousef, Lama, Turki | **Team Beta** - "AI Plant Disease Detector", proposal pending |
| student8@gpmp.edu, student9@gpmp.edu | Student | Nawaf, Jana | **Team Gamma** - no supervisor and no project yet (try choosing a supervisor and creating a project) |
| student7@gpmp.edu | Student | Maha | Not in any group yet |
| alumni1@gpmp.edu, alumni2@gpmp.edu | Student | Hamad, Dana | **Team Legacy** - archived 2024-2025 project, shown in the Projects Showcase |

All dates in the demo data are relative to the day you run `npm run db:setup`, so the demo always looks current.

---

## 6. Running the smoke test

`scripts/smoke-test.js` checks the whole API from start to end (about 210 checks): signing in
with every role, access rules, a temporary group, the complete Team Gamma story (choose a supervisor →
create the project → submit the proposal → supervisor approves → admin assigns an examiner → examiner
approves → project In Progress), who may edit proposal feedback, deactivated supervisors, tasks with a
file submission, a resubmission and feedback, documents (versions, empty files), calendar events (conflicts,
meetings that already started), the read-only archived project, attendance, live chat over Socket.IO,
announcements visible to the right people, notifications, resources, profile, showcase, all four
dashboards, forgot/reset password (the old session ends), account lock, change password and
deactivation. Each check prints `PASS` or `FAIL`, followed by a summary.

With GPMP running (`npm run dev` in one terminal), open a second terminal in the `GPMP` folder:

```bash
npm run db:setup
npm run test:smoke
```

- It needs **fresh demo data**: run `npm run db:setup` before every run. (The Team Gamma story can
  only happen once; the test stops at the start with a clear message if the data is not fresh.)
- Everything else it creates is removed at the end. Its temporary student and supervisor accounts are
  deactivated, because accounts cannot be deleted.
- To test a server on another address: `API_URL=http://localhost:5001/api npm run test:smoke` (Git Bash).
- It exits with code 1 when a check fails.
- If you run it many times within 15 minutes, the sign-in rate limit (20 failed sign-ins per 15
  minutes) or the reset-request limit (10 forgot-password requests per 15 minutes; the test sends 2)
  may answer 429; restart GPMP and try again.

---

## 7. Requirements map

Where each functional requirement of the report is implemented
(backend files are in `src/server/`, pages in `src/client/pages/`):

| Requirement | Backend | Frontend |
| --- | --- | --- |
| **FR-1** Secure log in | `controllers/auth.controller.js` (bcrypt, JWT, lock after 5 wrong passwords, password reset) | `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage` |
| **FR-2** Role-based permissions | `middleware/auth.js` (`requireAuth`, `requireRole`), `services/access.js`, `controllers/users.controller.js` | `config/roles.js`, `routes/ProtectedRoute.jsx`, `UsersPage` |
| **FR-3** Create and manage projects | `controllers/projects.controller.js`, `controllers/groups.controller.js` | `MyProjectPage`, `GroupsPage`, `GroupDetailPage` |
| **FR-4** View project information | `controllers/groups.controller.js` (`GET /api/groups/:id`) | `MyProjectPage`, `GroupDetailPage` (`components/project/ProjectOverview.jsx`) |
| **FR-5** Select an available supervisor | `controllers/supervisors.controller.js` | `SupervisorsPage` (students choose, admin manages availability and capacity) |
| **FR-6** Supervisor/admin approve or reject proposals | `controllers/proposals.controller.js` | `ProposalsPage`, proposal section of `MyProjectPage` |
| **FR-7** Examiner reviews proposals | `controllers/proposals.controller.js` (second review stage, editable examiner feedback) | `ProposalsPage` |
| **FR-8** Archive completed projects | `controllers/projects.controller.js` (status + archive), `controllers/showcase.controller.js` (final documents); an archived project's documents, tasks, submissions, feedback and calendar are read-only for everyone except the administrator (`assertGroupNotArchived` in `services/access.js`) | `GroupDetailPage` (status card), `ShowcasePage` |
| **FR-9** Group chat | `controllers/chat.controller.js` (Group channel), `socket.js` | `ChatPage` |
| **FR-10** Supervisor–examiner channel | `controllers/chat.controller.js` (Staff channel) | `ChatPage` |
| **FR-11** Structured feedback | `controllers/feedback.controller.js` | `TaskDetailPage` (`components/tasks/FeedbackForm.jsx`) |
| **FR-12** Announcements | `controllers/announcements.controller.js` | `AnnouncementsPage` |
| **FR-13** Calendar | `controllers/events.controller.js` | `CalendarPage` |
| **FR-14** Tasks and milestones | `controllers/tasks.controller.js`, `controllers/submissions.controller.js` | `TasksPage`, `TaskDetailPage` |
| **FR-15** Attendance | `controllers/attendance.controller.js` | `AttendancePage` |
| **FR-16** Upload/download documents | `controllers/files.controller.js`, `middleware/upload.js` | `DocumentsPage` |
| **FR-17** Resources page | `controllers/resources.controller.js` | `ResourcesPage` |
| **FR-18** Showcase video and description | `controllers/showcase.controller.js` (`PUT /api/showcase/:projectId`) | showcase editor on `MyProjectPage` |
| **FR-19** Browse archived projects | `controllers/showcase.controller.js` | `ShowcasePage` |
| **FR-20** Notifications | `services/notify.js`, `services/reminders.js`, `services/email.js`, `controllers/notifications.controller.js` | bell in the top bar (`components/notifications/NotificationBell.jsx`), `NotificationsPage` |

The use cases' error messages (for example "A group with this name already exists",
"Please enter your feedback", "No account was found with this email address.") are returned by the
API and shown on the pages. The home page (`LandingPage`) and the role-specific dashboard
(`DashboardPage`, `controllers/dashboard.controller.js`) follow UI figures 42 and 47.

Some non-functional requirements and how they are met:

| NFR | How |
| --- | --- |
| NFR-5 | Database dump with `mysqldump` plus a copy of `uploads/` (see "Backing up the data"); take one before every `db:setup` |
| NFR-8, NFR-9 | Every endpoint checks the login token and the user's role and group; files are only downloaded through checked endpoints; login and reset-request rate limiting and account lock; changing or resetting a password ends the user's other sessions |
| NFR-10 | Passwords are stored as bcrypt hashes; reset links are stored only as SHA-256 hashes |
| NFR-3, NFR-4 | Multi-step changes run in database transactions; foreign keys and CHECK constraints keep the data consistent |
| NFR-13 | Every page works from phone width (375 px) to desktop; the sidebar becomes a slide-in menu |
| NFR-14, NFR-15 | Each feature has its own route, controller, API file, page and stylesheet |

---

## 8. Differences from the report's database design

The tables and column names of the report's schema (Figure 39) are kept. `database/schema.sql`
marks every addition with the comment `-- added` and the requirement it supports.

**New tables**

| Table | Why |
| --- | --- |
| `feedback` | Structured feedback on a submission: decision, strengths, improvements, comments (FR-11, UC13) |
| `attendance` | One row per student per meeting or presentation (FR-15, UC14) |
| `notification` | In-app notifications with a link to the related page (FR-20) |
| `resource` | Tutorials, tools, frameworks, libraries and guides (FR-17) |

**Added or changed columns**

| Table | Change | Why |
| --- | --- | --- |
| `user` | `IsActive`, `FailedLoginAttempts`, `LockedUntil`, `ResetTokenHash`, `ResetTokenExpires`, `TokenVersion`, `CreatedAt` | Deactivating accounts, locking after wrong passwords (UC1), password reset (UC2); `TokenVersion` goes up on every password change so older login tokens stop working |
| `supervisor` | `IsAvailable` | The administrator manages the list of available supervisors (FR-5); `NumberOfGroups` is used as the maximum number of groups |
| `project_group` | `CreatedAt` | Record keeping |
| `graduation_project` | `Status`, `AcademicYear`, `ShowcaseDescription`, `ShowcaseVideoPath`, `CompletedAt`, `ArchivedAt`, `CreatedAt` | Project status (FR-4), archive and showcase (FR-8, FR-18, FR-19) |
| `proposal` | `SupervisorFeedback`, `ExaminerFeedback`, `SupervisorReviewedAt`, `ExaminerReviewedAt`, `SupervisorReviewedByUserID`, `ExaminerReviewedByUserID`, `DecidedByUserID` | Two-stage review by the supervisor and the examiner (FR-6, FR-7, UC16, UC17); the `...ReviewedByUserID` columns keep who wrote each stage's feedback, so only that person can edit it |
| `task` | `Description`, `IsMilestone`, `AssignedToStudentID`, `CreatedByUserID`, `CreatedAt`, `UpdatedAt`, `ReminderSentFor` | Milestones and task assignment (FR-14, UC15); `ReminderSentFor` = the due date a "due tomorrow" reminder was already sent for (FR-20) |
| `submission` | `Notes` | The student's message with the submitted work (UC5) |
| `file` | `GroupID`, `FileSize`, `MimeType`, `Category`, `Version` | Group documents with versions (FR-16, UC4), submission attachments and showcase videos in one table |
| `calendar` | `CalendarCountdown` removed; `GroupID` may be NULL | The countdown is calculated from the events when the page loads; the calendar with no group is the shared academic calendar |
| `important_date` | `Title`, `Description`, `EventDate`, `EndDate`, `Location`, `CreatedByUserID`, `ReminderSent` | Real calendar events (FR-13, UC9) and reminders sent only once (FR-20) |
| `chat_message` | `MsgDate` is DATETIME instead of DATE; `MsgType` is `Group` or `Staff` | Messages need the time; one table holds both the group chat (FR-9) and the supervisor–examiner channel (FR-10) |
| `announcement` | `PublishedByAdminID` became `PublishedByUserID`; added `TargetRole`, `GroupID` | Supervisors can post too (FR-12); an announcement can target a role or a single group |

Other changes: every table uses `utf8mb4` (Arabic names and emoji), CHECK constraints limit
status, role and type columns to the allowed values, and `feedback` has a UNIQUE key on
(`SubmissionID`, `GivenByUserID`) so a reviewer gives one feedback per submission (UC13).

---

## 9. Known limitations

- **Drafts** (UC5 "save submission as draft", UC15 "save task as draft", UC7 "save announcement as draft"):
  the schema has no draft status, so submissions and tasks are saved only when sent. Announcement drafts
  are kept in the browser that wrote them.
- **Chat**: messages can be deleted by their sender but not edited, and files cannot be attached
  (UC6/UC12 alternative flows). Share files through the Documents page instead.
- **Late submissions** (UC5 says the system *may* reject them) are accepted and marked "Late", so the
  supervisor decides.
- **Supervisor capacity** counts every group a supervisor is assigned to, including archived ones.
- All times are shown in the browser's time zone; "today" on the server (overdue tasks, reminders) uses
  `APP_TIME_ZONE` in `.env` (default `Asia/Riyadh`).
- **Sessions** (UC3): login tokens (JWT) are stateless. "Sign out" removes the token from the browser.
  Deactivating a user and changing or resetting a password end the user's sessions at once, but a token
  copied before "Sign out" stays valid until it expires (`JWT_EXPIRES_IN`, default 1 day).
- **Email notifications** (UC8): every notification is always saved in the app (bell and Notifications
  page). The email copy is sent once. Its delivery status is not stored, and a failed email (for example
  when the SMTP server is down) is logged in the terminal but not sent again later.
- **Archived projects** (FR-8) are read-only for students, supervisors and examiners. Only the showcase
  text and video stay editable (FR-18). The administrator can still correct an archived project.

---

## 10. More documentation

See [docs/README.md](docs/README.md) for the server and client guides ([docs/server.md](docs/server.md),
[docs/client.md](docs/client.md)) and the full API reference for every feature area.
