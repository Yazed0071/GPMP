# GPMP documentation

Start with the main [README](../README.md) (what GPMP is and how to run it). The documents below
explain how the code is organised and what every API endpoint does.

## How the code is built

| Document | What it explains |
| --- | --- |
| [server.md](server.md) | The server part (`src/server/`): API conventions, login tokens, shared helpers (access rules, notifications, uploads, Socket.IO events), error handling, testing and the demo data |
| [client.md](client.md) | The website part (`src/client/`): routing and roles, the API client, hooks, common components and CSS conventions |

## API reference (one document per feature area)

| Document | Features | Requirements |
| --- | --- | --- |
| [api/auth-users-profile.md](api/auth-users-profile.md) | Sign in, forgot/reset/change password, account lock, user management, profile | FR-1, FR-2, UC1, UC2, UC3 |
| [api/groups-projects-proposals.md](api/groups-projects-proposals.md) | Groups, projects, proposal review, choosing a supervisor, examiners, showcase and archive | FR-3 – FR-8, FR-18, FR-19, UC10, UC11, UC16, UC17 |
| [api/tasks-submissions-files.md](api/tasks-submissions-files.md) | Tasks and milestones, progress, submissions, structured feedback, documents | FR-4, FR-11, FR-14, FR-16, UC4, UC5, UC13, UC15 |
| [api/calendar-attendance-dashboard.md](api/calendar-attendance-dashboard.md) | Calendar events, attendance, dashboards, reminders | FR-13, FR-15, FR-20, UC8, UC9, UC14 |
| [api/communication.md](api/communication.md) | Group and staff chat, announcements, notifications, resources | FR-9, FR-10, FR-12, FR-17, FR-20, UC6, UC7, UC8, UC12 |

## Quick facts

- Every endpoint is under `/api` and (except sign in / password reset) needs `Authorization: Bearer <token>`.
- Success: the data itself (201 for creates). Errors: `{ "error": { "message": "...", "details": ... } }`.
- JSON keys are camelCase; every primary key is returned as `id`; DATETIME values are ISO strings in UTC;
  DATE values are `'YYYY-MM-DD'`.
- The database design is in `database/schema.sql`. The main README lists what was added to the
  report's design and why.
