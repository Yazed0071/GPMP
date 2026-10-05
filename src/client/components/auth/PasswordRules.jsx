// PasswordRules: a live checklist under a "new password" box. Each rule turns green
// as soon as the typed password meets it.
//
// Props:
//   password  string  the password typed so far
//   id        string  id of the list, so the input can point to it with aria-describedby
import Icon from '../common/Icon.jsx';
import { PASSWORD_CHECKS } from './passwordPolicy.js';
import '../../styles/auth.css';

export default function PasswordRules({ password = '', id }) {
  return (
    <ul className="auth-rules" id={id} aria-label="Password rules">
      {PASSWORD_CHECKS.map((check) => {
        const met = check.test(password);
        return (
          <li key={check.id} className={met ? 'auth-rule auth-rule-ok' : 'auth-rule'}>
            <Icon name={met ? 'check' : 'x'} size={14} />
            {check.label}
            <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
