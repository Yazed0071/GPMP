// DashboardPage: the first page after signing in (UI fig 47).
// One request (GET /api/dashboard) returns everything for the user's role, and the matching
// component draws it: students, supervisors/examiners and administrators each get their own view.
// The page refreshes quietly when a new notification arrives, so the counts stay current.
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import StudentDashboard from '../components/dashboard/StudentDashboard.jsx';
import StaffDashboard from '../components/dashboard/StaffDashboard.jsx';
import AdminDashboard from '../components/dashboard/AdminDashboard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getDashboard } from '../api/dashboard.js';
import '../styles/dashboard.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(getDashboard, [user.id]);

  // New notification (message, deadline, feedback...) -> refresh the numbers
  useSocketEvent('notification:new', () => reload());

  if (loading) return <Loading text="Loading your dashboard..." />;
  if (error) return <ErrorMessage error={error} onRetry={reload} title="Could not load the dashboard" />;

  if (data.role === 'Student') return <StudentDashboard data={data} user={user} />;
  if (data.role === 'Administrator') return <AdminDashboard data={data} user={user} />;
  return <StaffDashboard data={data} user={user} />;
}
