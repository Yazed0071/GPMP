// Navbar: the white bar at the top of every private page. Like the UI prototype it shows the
// current page name with today's date, the notification bell and the user menu
// (Profile, Notifications, Sign out - UC3).
// On small screens it also shows the menu button that opens the Sidebar drawer.
//
// Props:
//   onMenuClick  function  opens the sidebar drawer (small screens)
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLongDate } from '../../utils/format.js';
import { pageTitleFor } from '../../config/roles.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import Modal from '../common/Modal.jsx';
import StatusBadge from '../common/StatusBadge.jsx';

export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the user menu when clicking outside it or pressing Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  function handleLogout() {
    setConfirmOpen(false);
    logout();
    toast.success('You have been signed out.');
    navigate('/login', { replace: true });
  }

  return (
    <header className="navbar">
      <button
        type="button"
        className="btn btn-ghost btn-icon navbar-menu-button"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Icon name="menu" size={22} />
      </button>

      <div className="navbar-title">
        <strong>{pageTitleFor(pathname)}</strong>
        <span>{formatLongDate()}</span>
      </div>

      <div className="navbar-actions">
        <NotificationBell />

        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className="user-menu-button"
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            <Avatar name={user.name} size="small" />
            <span className="user-menu-name">{user.name}</span>
            <Icon name="chevronDown" size={16} />
          </button>

          {menuOpen && (
            <div className="user-menu-dropdown" role="menu">
              <div className="user-menu-header">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <StatusBadge status={user.role} />
              </div>
              <Link to="/profile" role="menuitem" onClick={() => setMenuOpen(false)}>
                <Icon name="user" size={16} /> My profile
              </Link>
              <Link to="/notifications" role="menuitem" onClick={() => setMenuOpen(false)}>
                <Icon name="bell" size={16} /> Notifications
              </Link>
              <button
                type="button"
                role="menuitem"
                className="user-menu-logout"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                <Icon name="logout" size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* UC3: the user confirms (or cancels) signing out */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sign out"
        size="small"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleLogout}>
              Sign out
            </button>
          </>
        }
      >
        <p className="confirm-message">Are you sure you want to sign out of GPMP?</p>
      </Modal>
    </header>
  );
}
