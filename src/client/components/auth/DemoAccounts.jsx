// DemoAccounts: a small list of the demo account emails on the login page, shown ONLY in
// development (the login page checks import.meta.env.DEV). Clicking an email fills it in.
// Passwords are never shown here; the demo password is written in the README.
//
// Props:
//   onPick  function  called with the chosen email address
import Icon from '../common/Icon.jsx';
import '../../styles/auth.css';

const DEMO_ACCOUNTS = [
  {
    role: 'Administrator',
    accounts: [{ email: 'admin@gpmp.edu', note: 'Users, groups, deadlines' }],
  },
  {
    role: 'Supervisors',
    accounts: [
      { email: 'supervisor1@gpmp.edu', note: 'Team Alpha, Team Legacy' },
      { email: 'supervisor2@gpmp.edu', note: 'Team Beta' },
      { email: 'supervisor3@gpmp.edu', note: 'Not available' },
    ],
  },
  {
    role: 'Examiners',
    accounts: [
      { email: 'examiner1@gpmp.edu', note: 'Team Alpha, Team Legacy' },
      { email: 'examiner2@gpmp.edu', note: 'Team Beta' },
    ],
  },
  {
    role: 'Students',
    accounts: [
      { email: 'student1@gpmp.edu', note: 'Team Alpha (also student2, 3)' },
      { email: 'student4@gpmp.edu', note: 'Team Beta (also student5, 6)' },
      { email: 'student8@gpmp.edu', note: 'Team Gamma, no supervisor yet' },
      { email: 'student7@gpmp.edu', note: 'Not in a group' },
      { email: 'alumni1@gpmp.edu', note: 'Team Legacy (archived)' },
    ],
  },
];

export default function DemoAccounts({ onPick }) {
  return (
    <details className="auth-demo">
      <summary>
        <Icon name="info" size={16} />
        Demo accounts
        <span className="auth-demo-tag">development only</span>
        <Icon name="chevronDown" size={16} className="auth-demo-chevron" />
      </summary>

      <div className="auth-demo-body">
        <p className="auth-demo-hint">
          Click an email to fill it in. See the README for the demo password.
        </p>
        {DEMO_ACCOUNTS.map((section) => (
          <div key={section.role}>
            <p className="auth-demo-label">{section.role}</p>
            <ul className="auth-demo-list">
              {section.accounts.map((account) => (
                <li key={account.email}>
                  <button type="button" className="auth-demo-account" onClick={() => onPick(account.email)}>
                    <span>{account.email}</span>
                    <small>{account.note}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
