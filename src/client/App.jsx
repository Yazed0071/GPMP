// App: decides which page to show for each web address (URL).
// Public pages are shown on their own; private pages are shown inside MainLayout
// (sidebar + top bar) and only to logged-in users whose role is allowed (config/roles.js).
import { Routes, Route } from 'react-router-dom';

import MainLayout from './layouts/MainLayout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import { rolesFor } from './config/roles.js';

// Public pages
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

// Private pages
import DashboardPage from './pages/DashboardPage.jsx';
import MyProjectPage from './pages/MyProjectPage.jsx';
import GroupsPage from './pages/GroupsPage.jsx';
import GroupDetailPage from './pages/GroupDetailPage.jsx';
import SupervisorsPage from './pages/SupervisorsPage.jsx';
import ProposalsPage from './pages/ProposalsPage.jsx';
import ShowcasePage from './pages/ShowcasePage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import TaskDetailPage from './pages/TaskDetailPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import AnnouncementsPage from './pages/AnnouncementsPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import ResourcesPage from './pages/ResourcesPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';

// Every private page and its address. The allowed roles come from ROUTE_ROLES in config/roles.js
const privatePages = [
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/project', element: <MyProjectPage /> },
  { path: '/groups', element: <GroupsPage /> },
  { path: '/groups/:id', element: <GroupDetailPage /> },
  { path: '/supervisors', element: <SupervisorsPage /> },
  { path: '/proposals', element: <ProposalsPage /> },
  { path: '/showcase', element: <ShowcasePage /> },
  { path: '/tasks', element: <TasksPage /> },
  { path: '/tasks/:id', element: <TaskDetailPage /> },
  { path: '/documents', element: <DocumentsPage /> },
  { path: '/calendar', element: <CalendarPage /> },
  { path: '/attendance', element: <AttendancePage /> },
  { path: '/chat', element: <ChatPage /> },
  { path: '/announcements', element: <AnnouncementsPage /> },
  { path: '/notifications', element: <NotificationsPage /> },
  { path: '/resources', element: <ResourcesPage /> },
  { path: '/users', element: <UsersPage /> },
  { path: '/profile', element: <ProfilePage /> },
];

export default function App() {
  return (
    <Routes>
      {/* Public pages: anyone can open them */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Private pages: only logged-in users, shown inside the main layout */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {privatePages.map((page) => (
          <Route
            key={page.path}
            path={page.path}
            element={<ProtectedRoute roles={rolesFor(page.path)}>{page.element}</ProtectedRoute>}
          />
        ))}
      </Route>

      {/* Any unknown address */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
