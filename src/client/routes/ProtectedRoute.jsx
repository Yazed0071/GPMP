// ProtectedRoute: guards private pages (FR-1, FR-2, NFR-8).
// - While the saved login is being checked, it shows a loading screen.
// - Visitors who are not logged in go to /login. The page they wanted is remembered in
//   location.state.from, so the login page can send them back there afterwards.
// - Logged-in users whose role may not open the page go to /dashboard.
//
// Props:
//   roles     string[]  roles allowed to open the page (leave out = any logged-in user)
//   children  node      the page to show; when missing, the nested routes (<Outlet />) are shown
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Loading from '../components/common/Loading.jsx';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading, signedOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading fullPage text="Loading GPMP..." />;
  }

  if (!user) {
    // After a deliberate "Sign out" the page is not remembered, so the next person
    // who signs in starts at the dashboard
    if (signedOut) return <Navigate to="/login" replace />;
    const from = { pathname: location.pathname, search: location.search, hash: location.hash };
    return <Navigate to="/login" replace state={{ from }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ?? <Outlet />;
}
