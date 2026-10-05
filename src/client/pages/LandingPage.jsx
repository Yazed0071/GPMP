// LandingPage: the public home page (UI fig 42). It introduces GPMP with the logo, a short
// pitch and two main options: "Sign in" (or "Go to dashboard" when already signed in) and
// "Learn more", which scrolls down to the features.
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/common/Icon.jsx';
import '../styles/auth.css';

// Who uses GPMP (shown under the hero)
const ROLES = [
  { icon: 'project', title: 'Students', text: 'Plan tasks, submit work and track progress' },
  { icon: 'supervisor', title: 'Supervisors', text: 'Guide groups, give feedback, take attendance' },
  { icon: 'proposal', title: 'Examiners', text: 'Review proposals and presentations' },
  { icon: 'shield', title: 'Administrators', text: 'Manage users, groups and academic dates' },
];

// The main features (the "Learn more" section)
const FEATURES = [
  {
    icon: 'project',
    color: 'teal',
    title: 'Project management',
    text: 'Create your project, choose a supervisor and follow your proposal from submission to approval.',
  },
  {
    icon: 'chat',
    color: 'blue',
    title: 'Group chat',
    text: 'Talk with your team and supervisor in real time, plus a private supervisor–examiner channel.',
  },
  {
    icon: 'calendar',
    color: 'purple',
    title: 'Calendar & deadlines',
    text: 'Meetings, presentations and academic dates in one calendar, with automatic reminders.',
  },
  {
    icon: 'megaphone',
    color: 'amber',
    title: 'Announcements',
    text: 'Stay up to date with news from the administration and from your supervisor.',
  },
  {
    icon: 'document',
    color: 'orange',
    title: 'Documents',
    text: 'Upload, version and download project documents safely in one shared place.',
  },
  {
    icon: 'trendingUp',
    color: 'green',
    title: 'Progress tracking',
    text: 'Tasks, milestones and structured feedback show exactly how far the project has come.',
  },
  {
    icon: 'trophy',
    color: 'navy',
    title: 'Projects showcase',
    text: 'Explore archived projects and showcase videos from previous years for inspiration.',
  },
  {
    icon: 'lock',
    color: 'red',
    title: 'Secure by role',
    text: 'Everyone signs in securely and only sees what their role and their groups allow.',
  },
];

const STEPS = [
  {
    title: 'Sign in',
    text: 'Use the university account your administrator created for you.',
  },
  {
    title: 'Set up your project',
    text: 'Join your group, choose an available supervisor and submit your proposal.',
  },
  {
    title: 'Work, submit, improve',
    text: 'Complete tasks, upload deliverables and get feedback until the final presentation.',
  },
];

// Example progress in the decorative dashboard preview
const PREVIEW_ROWS = [
  { label: 'Proposal approved', value: 100 },
  { label: 'Chapter 2 — Literature Review', value: 100 },
  { label: 'Chapter 3 — System Design', value: 52 },
  { label: 'Overall project progress', value: 67 },
];

// The current academic year, e.g. "2026–2027" (a new year starts in August)
function academicYear() {
  const today = new Date();
  const year = today.getFullYear();
  return today.getMonth() >= 7 ? `${year}–${year + 1}` : `${year - 1}–${year}`;
}

// Smoothly scrolls to a section (instantly for people who prefer less motion)
function scrollToSection(id) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}

export default function LandingPage() {
  const { user } = useAuth();

  // "Sign in" for visitors, "Go to dashboard" for people who are already signed in
  const mainAction = user ? (
    <Link to="/dashboard" className="btn btn-primary btn-large auth-cta">
      Go to dashboard <Icon name="arrowRight" size={18} />
    </Link>
  ) : (
    <Link to="/login" className="btn btn-primary btn-large auth-cta">
      Sign in <Icon name="arrowRight" size={18} />
    </Link>
  );

  return (
    <div className="auth-landing">
      <header className="auth-topbar">
        <div className="auth-container auth-topbar-inner">
          <Link to="/" className="auth-logo" aria-label="GPMP home page">
            <img src="/logo.jpeg" alt="" />
            <span>
              <strong>GPMP</strong>
              <small>Al-Yamamah University</small>
            </span>
          </Link>
          <nav className="auth-topnav" aria-label="Home page sections">
            <button type="button" className="auth-topnav-link" onClick={() => scrollToSection('features')}>
              Features
            </button>
            <button type="button" className="auth-topnav-link" onClick={() => scrollToSection('how-it-works')}>
              How it works
            </button>
            <Link to={user ? '/dashboard' : '/login'} className="btn btn-primary btn-small">
              {user ? 'My workspace' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="auth-hero">
          <div className="auth-container auth-hero-inner">
            <div>
              <span className="auth-pill">
                <span className="auth-pill-dot" aria-hidden="true" />
                Al-Yamamah University · {academicYear()}
              </span>
              <h1>
                Manage Your <span>Graduation Project</span> with Confidence
              </h1>
              <p className="auth-hero-lead">
                One platform for students, supervisors, examiners and administrators. Communication,
                scheduling, document management and progress tracking — all in one organized space.
              </p>
              <div className="auth-hero-actions">
                {mainAction}
                <button
                  type="button"
                  className="btn btn-large auth-btn-outline"
                  onClick={() => scrollToSection('features')}
                >
                  Learn more <Icon name="chevronDown" size={18} />
                </button>
              </div>
              {user && (
                <p className="auth-hero-signed">
                  <Icon name="check" size={16} /> Signed in as <strong>{user.name}</strong>
                </p>
              )}
            </div>

            {/* Decorative preview of a project dashboard (hidden from screen readers) */}
            <div className="auth-preview" aria-hidden="true">
              <div className="auth-preview-head">
                <img src="/logo.jpeg" alt="" />
                <div>
                  <strong>Your Project Dashboard</strong>
                  <span>Student · Graduation Project 2</span>
                </div>
              </div>
              {PREVIEW_ROWS.map((row) => (
                <div key={row.label} className="auth-preview-row">
                  <div className="auth-preview-label">
                    <span>{row.label}</span>
                    <b>{row.value}%</b>
                  </div>
                  <div className="auth-preview-bar">
                    <span style={{ width: `${row.value}%` }} />
                  </div>
                </div>
              ))}
              <div className="auth-preview-chips">
                <span>
                  <Icon name="chat" size={14} /> Group Chat
                </span>
                <span>
                  <Icon name="calendar" size={14} /> Calendar
                </span>
                <span>
                  <Icon name="folder" size={14} /> Docs
                </span>
              </div>
            </div>
          </div>

          <div className="auth-container">
            <ul className="auth-roles">
              {ROLES.map((role) => (
                <li key={role.title}>
                  <span className="auth-glass-icon">
                    <Icon name={role.icon} size={20} />
                  </span>
                  <div className="auth-roles-text">
                    <strong>{role.title}</strong>
                    <span>{role.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" className="auth-section" aria-labelledby="features-title">
          <div className="auth-container">
            <div className="auth-section-head">
              <p className="auth-eyebrow">Features</p>
              <h2 id="features-title">Everything your graduation project needs</h2>
              <p>
                From the first proposal to the final presentation, GPMP keeps your team, your
                supervisor and your examiner on the same page.
              </p>
            </div>
            <div className="auth-features">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="auth-feature">
                  <span className={`icon-tile tile-${feature.color}`}>
                    <Icon name={feature.icon} size={22} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="auth-section auth-section-alt" aria-labelledby="steps-title">
          <div className="auth-container">
            <div className="auth-section-head">
              <p className="auth-eyebrow">How it works</p>
              <h2 id="steps-title">Three steps to a well-organized project</h2>
            </div>
            <ol className="auth-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="auth-step">
                  <span className="auth-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="auth-cta-band">
          <div className="auth-container">
            <h2>Ready to work on your graduation project?</h2>
            <p>Sign in with your university account to open your personal workspace.</p>
            {mainAction}
          </div>
        </section>
      </main>

      <footer className="auth-landing-footer">
        <div className="auth-container auth-landing-footer-inner">
          <span className="auth-landing-footer-brand">
            <img src="/logo.jpeg" alt="" />
            GPMP — Graduation Project Management Platform
          </span>
          <span>Al-Yamamah University · {academicYear()}</span>
        </div>
      </footer>
    </div>
  );
}
