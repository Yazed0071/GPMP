// Sidebar: the dark menu on the left. It shows only the pages the user's role can open,
// grouped in sections (Main / Project / Admin / Account) like the UI prototype.
// On phones and tablets it becomes a slide-in drawer opened by the Navbar's menu button.
//
// Props:
//   open     boolean   true = drawer is visible (small screens only)
//   onClose  function  closes the drawer
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import { canUseChat, navFor } from '../../config/roles.js';
import { getChatUnreadCount } from '../../api/chat.js';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';

// Number of unread chat messages, kept up to date by the live (socket) events
function useChatUnreadCount(enabled) {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    if (!enabled) return;
    getChatUnreadCount()
      .then((result) => setCount(result.count))
      .catch(() => {}); // the badge is only a hint, so errors are ignored
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent('notification:new', (notification) => {
    if (notification.type === 'Message') load();
  });
  useSocketEvent('notification:updated', load); // a collapsed chat notification changed
  useSocketEvent('notification:sync', load); // something was read or deleted
  useSocketEvent('connect', load); // re-check after a reconnect

  return count;
}

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const sections = navFor(user.role);
  const closeButtonRef = useRef(null);
  const chatUnread = useChatUnreadCount(canUseChat(user.role));

  // When the drawer opens, move keyboard focus into it
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* Dark layer behind the drawer on small screens; clicking it closes the menu */}
      <div className={open ? 'sidebar-overlay show' : 'sidebar-overlay'} onClick={onClose} />

      <aside className={open ? 'sidebar open' : 'sidebar'} aria-label="Main menu">
        <div className="sidebar-brand">
          <img src="/logo.jpeg" alt="GPMP logo" className="sidebar-logo" />
          <div className="sidebar-brand-text">
            <strong>GPMP</strong>
            <span>Al-Yamamah University</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <Link to="/profile" className="sidebar-user" onClick={onClose}>
          <Avatar name={user.name} />
          <div className="sidebar-user-text">
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
        </Link>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.section} className="sidebar-section">
              <p className="sidebar-section-label">{section.section}</p>
              {section.items.map((item) => (
                // NavLink adds the "active" class when this link matches the current page
                <NavLink key={item.to} to={item.to} className="sidebar-link" onClick={onClose}>
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {item.to === '/chat' && chatUnread > 0 && (
                    <span className="sidebar-badge" aria-label={`${chatUnread} unread messages`}>
                      {chatUnread > 99 ? '99+' : chatUnread}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
