// AuthShell: the frame of the sign-in and password pages (UI fig 41).
// Desktop: a navy brand panel on the left and the form on the right.
// Phones: the brand panel shrinks to a small top bar with the logo.
//
// Props:
//   title     string  big heading above the form, e.g. "Sign in to GPMP"
//   subtitle  string  one line under the heading
//   children  node    the form (or message) of the page
//   footer    node    optional small text under the form
import { Link } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import '../../styles/auth.css';

const HIGHLIGHTS = [
  { icon: 'chat', text: 'Chat with your team and supervisor' },
  { icon: 'calendar', text: 'Deadlines, meetings and reminders' },
  { icon: 'trendingUp', text: 'Tasks, milestones and progress' },
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <Link to="/" className="auth-logo" aria-label="GPMP home page">
          <img src="/logo.jpeg" alt="" />
          <span>
            <strong>GPMP</strong>
            <small>Al-Yamamah University</small>
          </span>
        </Link>

        <div className="auth-brand-body">
          <h2>
            Manage your graduation project with <em>confidence</em>
          </h2>
          <p>One platform for students, supervisors, examiners and administrators.</p>
          <ul className="auth-brand-points">
            {HIGHLIGHTS.map((item) => (
              <li key={item.icon}>
                <span className="auth-glass-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand-footer">Graduation Project Management Platform</p>
      </aside>

      <main className="auth-main">
        <div className="auth-panel">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
