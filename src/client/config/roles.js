// Roles and permissions (FR-2): which role sees which sidebar link and can open which page.
// Buttons inside pages mostly follow the `permissions` object (or canEdit / canDelete flags)
// sent by the server; the small helpers at the bottom cover the simple role checks.
// The backend checks every rule again, so these rules only decide what the interface shows.

export const ROLES = {
  STUDENT: 'Student',
  SUPERVISOR: 'Supervisor',
  EXAMINER: 'Examiner',
  ADMIN: 'Administrator',
};

export const ALL_ROLES = Object.values(ROLES);

const { STUDENT, SUPERVISOR, EXAMINER, ADMIN } = ROLES;
const STAFF_ROLES = [SUPERVISOR, EXAMINER, ADMIN];

// Sidebar menu, split into sections like the UI prototype.
// `icon` is a name from components/common/Icon.jsx.
export const NAV = [
  {
    section: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ALL_ROLES },
      { to: '/project', label: 'My Project', icon: 'project', roles: [STUDENT] },
      { to: '/groups', label: 'Groups', icon: 'users', roles: STAFF_ROLES },
      { to: '/chat', label: 'Chat', icon: 'chat', roles: [STUDENT, SUPERVISOR, EXAMINER] },
      { to: '/calendar', label: 'Calendar', icon: 'calendar', roles: ALL_ROLES },
      { to: '/announcements', label: 'Announcements', icon: 'megaphone', roles: ALL_ROLES },
    ],
  },
  {
    section: 'Project',
    items: [
      { to: '/tasks', label: 'Tasks & Progress', icon: 'tasks', roles: ALL_ROLES },
      { to: '/documents', label: 'Documents', icon: 'document', roles: ALL_ROLES },
      { to: '/proposals', label: 'Proposals', icon: 'proposal', roles: STAFF_ROLES },
      { to: '/supervisors', label: 'Supervisors', icon: 'supervisor', roles: [STUDENT, ADMIN] },
      { to: '/attendance', label: 'Attendance', icon: 'attendance', roles: [STUDENT, SUPERVISOR, ADMIN] },
      { to: '/resources', label: 'Resources', icon: 'book', roles: ALL_ROLES },
      { to: '/showcase', label: 'Projects Showcase', icon: 'trophy', roles: ALL_ROLES },
    ],
  },
  {
    section: 'Admin',
    items: [{ to: '/users', label: 'Users', icon: 'shield', roles: [ADMIN] }],
  },
  {
    section: 'Account',
    items: [
      { to: '/notifications', label: 'Notifications', icon: 'bell', roles: ALL_ROLES },
      { to: '/profile', label: 'Profile', icon: 'user', roles: ALL_ROLES },
    ],
  },
];

// Roles allowed to open each private page (the paths match the routes in App.jsx)
export const ROUTE_ROLES = {
  '/dashboard': ALL_ROLES,
  '/project': [STUDENT],
  '/groups': STAFF_ROLES,
  '/groups/:id': STAFF_ROLES,
  '/supervisors': [STUDENT, ADMIN],
  '/proposals': STAFF_ROLES,
  '/showcase': ALL_ROLES,
  '/tasks': ALL_ROLES,
  '/tasks/:id': ALL_ROLES,
  '/documents': ALL_ROLES,
  '/calendar': ALL_ROLES,
  '/attendance': [STUDENT, SUPERVISOR, ADMIN],
  '/chat': [STUDENT, SUPERVISOR, EXAMINER],
  '/announcements': ALL_ROLES,
  '/notifications': ALL_ROLES,
  '/resources': ALL_ROLES,
  '/users': [ADMIN],
  '/profile': ALL_ROLES,
};

// Roles allowed to open a page, e.g. rolesFor('/users') -> ['Administrator']
export function rolesFor(path) {
  return ROUTE_ROLES[path] || ALL_ROLES;
}

// The sidebar sections for one role (sections with no visible links are removed)
export function navFor(role) {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

// The sidebar label of the page at `pathname`, e.g. '/tasks/12' -> 'Tasks & Progress'
// (used as the title in the top bar)
export function pageTitleFor(pathname) {
  for (const section of NAV) {
    for (const item of section.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return item.label;
    }
  }
  return 'GPMP';
}

// ----- Small permission helpers (used to show or hide buttons) -----

export const isStudent = (role) => role === STUDENT;
export const isExaminer = (role) => role === EXAMINER;
export const isAdmin = (role) => role === ADMIN;

// FR-12 / UC7: supervisors and administrators post announcements
export const canPostAnnouncements = (role) => role === SUPERVISOR || role === ADMIN;

// FR-15 / UC14: supervisors record attendance (administrators may correct records)
export const canTakeAttendance = (role) => role === SUPERVISOR || role === ADMIN;

// FR-9 / FR-10: group chat (students + supervisor) and staff chat (supervisor + examiner)
export const canUseChat = (role) => role === STUDENT || role === SUPERVISOR || role === EXAMINER;
