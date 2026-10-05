// NotFoundPage: shown when the user opens an address that does not exist (404).
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/common/Icon.jsx';

export default function NotFoundPage() {
  const { user } = useAuth();
  // Logged-in users go back to their dashboard, visitors to the home page
  const homePath = user ? '/dashboard' : '/';

  return (
    <div className="public-page">
      <div className="public-card not-found">
        <img src="/logo.jpeg" alt="GPMP logo" className="not-found-logo" />
        <p className="not-found-code">404</p>
        <h1>Page not found</h1>
        <p className="muted">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link className="btn btn-primary" to={homePath}>
          <Icon name="home" size={18} /> {user ? 'Back to dashboard' : 'Back to home'}
        </Link>
      </div>
    </div>
  );
}
