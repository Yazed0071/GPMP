# Authentication, user management and profile

This part of GPMP covers how people get into GPMP and how their accounts are managed:

| Feature | Requirements | Backend | Frontend page |
| --- | --- | --- | --- |
| Home page with "Sign in" / "Learn more" | UI fig 42 | – | `/` (LandingPage) |
| Log in (with account lock after 5 wrong passwords) | FR-1, NFR-8, UC1 | `/api/auth` | `/login` (LoginPage) |
| Forgot / reset password | UC2 | `/api/auth` | `/forgot-password`, `/reset-password` |
| Log out | UC3 | – (the browser forgets the token) | user menu in the Navbar |
| Role-based access | FR-2 | `requireRole(...)` on every route | `ProtectedRoute` + `config/roles.js` |
| User management (Administrators) | FR-1, FR-2 | `/api/users` | `/users` (UsersPage) |
| My profile + change password | FR-1, NFR-10 | `/api/profile`, `/api/auth/change-password` | `/profile` (ProfilePage) |

Passwords are stored only as **bcrypt hashes** (cost 10, NFR-10). Reset links are stored only as a
**SHA-256 hash** of the token. Neither is ever returned by the API.

All demo accounts use the password **Gpmp@2026** (see [server.md](../server.md), section 11).

---

## 1. Files

| Layer | File | What it does |
| --- | --- | --- |
| Backend | `src/server/routes/auth.routes.js` | URLs for `/api/auth` (+ `loginLimiter`) |
| | `src/server/routes/users.routes.js` | URLs for `/api/users` (Administrators only) |
| | `src/server/routes/profile.routes.js` | URLs for `/api/profile` (every logged-in user) |
| | `src/server/controllers/auth.controller.js` | login, lockout, reset links, change password + shared password/email helpers |
| | `src/server/controllers/users.controller.js` | list/create/edit users and their role profile rows, status, admin password, unlock |
| | `src/server/controllers/profile.controller.js` | profile with role details, edit name + major/department |
| Frontend | `src/client/pages/LandingPage.jsx` | public home page (hero, features, how it works) |
| | `src/client/pages/LoginPage.jsx` | sign-in form, lock warnings, dev-only demo account list |
| | `src/client/pages/ForgotPasswordPage.jsx` | asks for the email, shows "check your email" (+ dev link) |
| | `src/client/pages/ResetPasswordPage.jsx` | new password + confirmation from the emailed link |
| | `src/client/pages/UsersPage.jsx` | stats, role tabs, search, status filter, user table/cards |
| | `src/client/pages/ProfilePage.jsx` | summary banner, personal details (edit), role card, change password |
| | `src/client/api/auth.js`, `users.js`, `profile.js` | API functions (login/me live in `AuthContext`) |
| | `src/client/components/auth/*` | `AuthShell`, `PasswordInput`, `PasswordRules`, `NewPasswordFields`, `ChangePasswordForm`, `DemoAccounts`, `passwordPolicy.js` |
| | `src/client/components/users/*` | `UserFormModal` (add/edit), `SetPasswordModal` |
| | `src/client/styles/auth.css`, `users.css`, `profile.css` | styles (`auth-`, `users-`, `profile-` prefixes) |

---

## 2. The rules in one place

| Rule | Where | Value |
| --- | --- | --- |
| Password rule (everywhere) | `assertValidNewPassword` (backend), `passwordPolicy.js` (frontend) | at least 8 characters, at least one letter and one number, at most 72 characters (bcrypt limit) |
| Account lock (UC1) | `auth.controller.js` | 5 wrong passwords in a row lock the account for 15 minutes; the counter starts again after the lock; a successful login, a password reset, an admin "set password" or "unlock" clears it |
| Reset link (UC2) | `auth.controller.js` | random 32-byte token (64 hex characters), valid for 30 minutes, usable once |
| Rate limit (NFR-8) | `loginLimiter` on `/login`, `/forgot-password`, `/reset-password` | 20 **failed** requests per 15 minutes per IP address → 429 |
| Reset requests (UC2) | `resetRequestLimiter` on `/forgot-password` | 10 requests per 15 minutes per IP address, **successful ones too** (so nobody can flood a mailbox with reset emails) → 429 |
| Sessions end on a password change | `TokenVersion` column, `requireAuth`, `socket.js` | changing or resetting a password (by the user or the admin) makes every older login token invalid (401) and closes the user's live connections |
| Emails | always saved in lower case without spaces | `Sara@GPMP.edu ` → `sara@gpmp.edu` |
| GPA | admin only | 0 to 5 (works for 4- and 5-point scales), 2 decimals |
| Supervisor capacity | admin only | `numberOfGroups` 1–20, never lower than the groups the supervisor already has |

The lock is checked **before** the password, so a locked account cannot sign in even with the right
password. "This account has been deactivated" is only shown **after** the right password was given.

---

## 3. `/api/auth`

### POST `/api/auth/login` (public, rate limited)

Request `{ "email": "student1@gpmp.edu", "password": "Gpmp@2026" }`

Response `200`:

```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 7, "name": "Sara Alqahtani", "email": "student1@gpmp.edu", "role": "Student",
            "studentId": 1, "supervisorId": null, "examinerId": null, "adminId": null, "groupId": 1 }
}
```

The token payload is `{ id, role, v }` (`v` = the user's `TokenVersion`), signed with `signToken()` from
`middleware/auth.js` (expires after `JWT_EXPIRES_IN`). A token whose `v` is older than the user's current
`TokenVersion` (the password was changed since) is refused with 401.

| Status | Message | When |
| --- | --- | --- |
| 400 | `Email is required` / `Password is required` | a field is missing |
| 400 | `Please enter a valid email address.` | not an email |
| 401 | `Incorrect email or password.` | unknown email or wrong password. For a known email `details.attemptsLeft` says how many tries are left (the login page warns when 2 or fewer) |
| 403 | `This account has been deactivated. Please contact the administrator.` | right password, but `IsActive = 0` |
| 423 | `Too many failed login attempts. Please try again in N minutes.` | 5th wrong password, or any attempt while locked. `details.lockedUntil` = ISO time |
| 429 | `Too many attempts. Please wait 15 minutes and try again.` | rate limit |

### GET `/api/auth/me` (logged in)

Returns the `req.user` object (same shape as `user` above). The frontend calls it on start-up.

### POST `/api/auth/forgot-password` (public, rate limited)

Request `{ "email": "student1@gpmp.edu" }`

Response `200`:

```json
{
  "message": "A password reset link has been sent to your email.",
  "devResetLink": "http://localhost:5173/reset-password?token=5f3c...(64 hex)"
}
```

- The link `CLIENT_URL/reset-password?token=...` is emailed with `sendEmail()`. Without SMTP settings the
  email is printed in the terminal (`[email preview]`).
- **`devResetLink` is only included when `APP_ENV` is not `production`, `SMTP_HOST` is empty and the
  request comes from the same computer** (the Vite dev server or the smoke test), so the demo works without
  an email server. It is never sent in production, when real emails are sent, or to another device on the
  network (anyone could otherwise reset anyone's password). The link is always printed in the backend
  terminal as part of the `[email preview]`.
- Asking again replaces the previous link (only the newest link works).

| Status | Message |
| --- | --- |
| 400 | `Email is required` / `Please enter a valid email address.` |
| 404 | `No account was found with this email address.` (UC2 exceptional flow) |
| 403 | `This account has been deactivated. Please contact the administrator.` |
| 429 | `Too many reset requests. Please wait 15 minutes and try again.` (more than 10 requests in 15 minutes) |

### POST `/api/auth/reset-password` (public, rate limited)

Request `{ "token": "<64 hex characters from the link>", "password": "NewPass2468" }` → `200 { "message": "Your password has been reset. You can now sign in with your new password." }`

Saving the password also deletes the reset token, unlocks the account and ends the user's other
sessions (older login tokens get 401, live connections are closed).

| Status | Message |
| --- | --- |
| 400 | `This reset link is invalid or has expired. Please request a new one.` (no `details`; wrong, used or expired token) |
| 400 | `New password is required` / the password rule message (`details.field = "password"`) |

### POST `/api/auth/change-password` (logged in)

Request `{ "currentPassword": "...", "newPassword": "..." }` → `200 { "message": "Your password has been changed.", "token": "eyJ..." }`

The change ends the user's other sessions (their older tokens get 401). The response carries a **new
token**, which `ChangePasswordForm` saves, so the tab that made the change stays signed in.

| Status | Message |
| --- | --- |
| 400 | `Current password is required` / `New password is required` |
| 400 | `Your current password is incorrect.` (`details.field = "currentPassword"`). **400, not 401**, so the frontend does not sign the user out |
| 400 | the password rule message |
| 400 | `Your new password must be different from your current password.` |

### Log out (UC3)

There is no logout endpoint: login tokens are stateless, so the Navbar's "Sign out" (with a confirmation
dialog) removes the token from `localStorage` and returns to `/login`. Deactivating a user (below) ends all
of that user's sessions at once, because `requireAuth` reloads the user on every request. Changing or
resetting a password also ends all older sessions (see `TokenVersion` above). A token copied before
"Sign out" stays valid until it expires (`JWT_EXPIRES_IN`), unless one of these happens.

---

## 4. `/api/users` (Administrators only)

Every route answers **403** `You do not have permission to do this.` for other roles.

### The user object

```json
{
  "id": 3, "name": "Dr. Mona Alshehri", "email": "supervisor2@gpmp.edu", "role": "Supervisor",
  "isActive": true, "isLocked": false, "lockedUntil": null, "createdAt": "2024-04-11T15:08:00.000Z",
  "department": "Computer Science",
  "major": null, "gpa": null, "groupId": null, "groupName": null,
  "numberOfGroups": 3, "isAvailable": true, "assignedGroups": 1
}
```

| Field | Filled for | Meaning |
| --- | --- | --- |
| `department` | Supervisor, Examiner, Administrator | from `supervisor/examiner/admin` table |
| `major`, `gpa`, `groupId`, `groupName` | Student | from `student` (+ group name) |
| `numberOfGroups` | Supervisor | the **maximum** number of groups they accept (FR-5) |
| `isAvailable` | Supervisor | shown to students choosing a supervisor (FR-5) |
| `assignedGroups` | Supervisor, Examiner | how many groups they have right now |
| `isLocked`, `lockedUntil` | everyone | UC1 lock (`lockedUntil` only while locked) |

Fields that do not belong to the role are `null`. Password hashes and reset tokens are never selected.

### Endpoints

| Method and URL | Body | Result |
| --- | --- | --- |
| `GET /api/users?role=&search=&active=` | – | array of users, administrators first, then supervisors, examiners, students (A–Z). `role` = one of the 4 roles, `search` = part of name or email, `active` = `true`/`false` |
| `GET /api/users/:id` | – | one user (404 `User not found`) |
| `POST /api/users` | `{ name, email, password, role, department?, major?, gpa?, numberOfGroups?, isAvailable? }` | `201` + the new user. Creates the `user` row **and** the role profile row in one transaction |
| `PUT /api/users/:id` | `{ name, email, department?, major?, gpa?, numberOfGroups?, isAvailable? }` | the updated user. Profile fields that are not sent keep their value |
| `PATCH /api/users/:id/status` | `{ isActive: true \| false }` | the updated user. Deactivating also closes the user's live socket connections |
| `POST /api/users/:id/reset-password` | `{ password }` | `{ message }`. Sets a new password, unlocks the account, ends the user's sessions and sends the user a `System` notification. When admins set their **own** password, the answer also has a new `token` (the admin's tab saves it and stays signed in) |
| `POST /api/users/:id/unlock` | – | the updated user. Removes a UC1 lock without changing the password |

Errors (besides the usual 400 "... is required"):

| Status | Message |
| --- | --- |
| 400 | `Role must be one of: Student, Supervisor, Examiner, Administrator` |
| 400 | `The role of an existing user cannot be changed. Please create a new account for the new role.` |
| 400 | `GPA must be a number between 0 and 5` |
| 400 | `Maximum number of groups must be at least 1` / `... at most 20` |
| 400 | `This supervisor already has N groups, so the maximum cannot be lower than that.` |
| 400 | `You cannot deactivate your own account.` (this also guarantees one active administrator) |
| 400 | `Active status must be true or false` |
| 409 | `A user with this email already exists.` (`details.field = "email"`) |

Users are never deleted through the API (their tasks, messages and files would lose their author);
deactivate them instead.

---

## 5. `/api/profile` (every logged-in user)

### GET `/api/profile`

The `req.user` fields + `createdAt` + the details of the role:

| Role | Extra fields |
| --- | --- |
| Student | `major`, `gpa`, `groupName`, `supervisorName`, `examinerName`, `projectTitle`, `projectStatus` |
| Supervisor | `department`, `numberOfGroups` (maximum), `isAvailable`, `groupCount`, `currentGroups` |
| Examiner | `department`, `groupCount`, `currentGroups` |
| Administrator | `department` |

`currentGroups` = `[{ id, name, projectTitle, projectStatus, memberCount }]`, ordered by name.

### PUT `/api/profile`

Body `{ name, major? }` for students, `{ name, department? }` for staff → the updated profile (same shape as GET).
An empty `major`/`department` clears it. Other fields are ignored, except:

| Status | Message |
| --- | --- |
| 400 | `Only an administrator can change your email address.` (an email different from the current one was sent) |
| 400 | `Only an administrator can change your GPA.` |
| 400 | `Name is required` / `Name must be at most 100 characters` |

Password changes use `POST /api/auth/change-password`.

---

## 6. Frontend

### Pages

- **LandingPage** (`/`): navy hero like UI fig 42 (logo, pitch, "Sign in" or "Go to dashboard" when
  signed in, "Learn more" scrolls to the features), the four roles, 8 feature cards, "How it works",
  a call-to-action band and a footer. Fully responsive.
- **LoginPage** (`/login`): UI fig 41 layout (`AuthShell`). Field checks, server errors in an alert,
  "N attempts left" warning, amber "locked" message with a reset link, loading state, show/hide
  password. After a failed attempt the password box is cleared and focused. After signing in it goes to
  `location.state.from` or `/dashboard`; already signed-in visitors are redirected the same way.
  In development only (`import.meta.env.DEV`) a collapsible **Demo accounts** list fills in a demo email
  (passwords are never shown; the page says to look in the README).
  The "Forgot password?" links pass the typed email to the next page (`location.state.email`).
- **ForgotPasswordPage**: email → "Check your email" message. In development without SMTP (on the same
  computer) the `devResetLink` is shown as a link. "I remember my password — back to sign in" covers the UC2 alternative flow.
- **ResetPasswordPage** (`/reset-password?token=`): new password + confirmation with the live rules.
  Success → toast + `/login`. A missing/expired link shows a "Request a new link" button.
- **UsersPage** (`/users`, Administrator): 4 stat cards, role tabs with counts, search and status filter
  (All / Active / Inactive / Locked), a table that turns into cards on phones, and per-row actions:
  Edit, Password, Unlock (only when locked) and Deactivate/Activate (both with confirmation; hidden on
  your own row). The list is loaded once and filtered in the browser, so filtering is instant.
- **ProfilePage** (`/profile`): navy summary banner, "Personal details" (view/edit), a role card
  (My group / Supervision capacity / Groups I examine / Administration shortcuts) and "Change password".
  Saving the profile calls `refreshUser()` so the sidebar and top bar show the new name.

### Reusable components (other pages may use them)

```jsx
import PasswordInput from '../components/auth/PasswordInput.jsx';        // password box with eye button
import NewPasswordFields from '../components/auth/NewPasswordFields.jsx'; // new + confirm + live rules (+ Generate)
import { checkNewPassword, isStrongPassword, generatePassword } from '../components/auth/passwordPolicy.js';

<label htmlFor="pw">Password</label>
<PasswordInput id="pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />

<NewPasswordFields idPrefix="reset" password={pw} confirm={confirm}
  onPasswordChange={setPw} onConfirmChange={setConfirm} errors={errors} allowGenerate />
const errors = checkNewPassword(pw, confirm); // {} when both boxes are fine
```

---

## 7. Testing

`npm run test:smoke` (see the main README) covers this area: sign in with every role and with a
wrong password, `/auth/me` with and without a valid token, creating a user (and a duplicate email),
403 for non-administrators on `/api/users`, forgot/reset password with the dev link (the link works
once and ends the older session), the account lock after 5 wrong passwords and the admin unlock,
change password (wrong current password → 400, the old token stops working), profile edits and
deactivating a user.
