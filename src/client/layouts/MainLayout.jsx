// MainLayout: the frame shared by all private pages (sidebar + top bar + page content).
// On small screens the sidebar is hidden and opens as a drawer from the Navbar's menu button.
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar.jsx';
import Navbar from '../components/layout/Navbar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';

export default function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { user, refreshUser } = useAuth();

  // Tasks, Documents and Calendar read user.groupId, so reload the student's account when the
  // administrator may have changed their group (a System notification such as "You were added
  // to Team Alpha") and when the live connection comes back
  useSocketEvent('notification:new', (notification) => {
    if (user?.role === 'Student' && notification?.type === 'System') refreshUser().catch(() => {});
  });
  useSocketEvent('connect', () => {
    if (user?.role === 'Student') refreshUser().catch(() => {});
  });

  // When the page changes: close the mobile menu and scroll back to the top
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  // The Escape key closes the mobile menu
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <div className="app-layout">
      {/* Lets keyboard users jump straight past the menu */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="app-main">
        <Navbar onMenuClick={() => setMenuOpen(true)} />
        <main id="main-content" className="app-content">
          {/* The current page (Dashboard, Tasks, ...) appears here */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
