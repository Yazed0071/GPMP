// AuthContext: remembers who is logged in and shares it with every page (FR-1, FR-2).
// The login token (JWT) is saved in localStorage under 'gpmp_token'. When the app starts
// with a saved token, it asks the backend "who am I?" (GET /api/auth/me).
//
// Usage:
//   const { user, loading, login, logout, refreshUser, hasRole } = useAuth();
//   (signedOut is also available: true right after the user pressed "Sign out")
//   if (hasRole('Supervisor', 'Administrator')) { ...show a button... }
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api/client.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const toast = useToast();
  // user = { id, name, email, role, studentId, supervisorId, examinerId, adminId, groupId }
  const [user, setUser] = useState(null);
  // While we check a saved token, pages wait instead of redirecting to the login page
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  // True after the user pressed "Sign out", so the next person who signs in on this
  // browser starts at the dashboard instead of the page the previous user was on
  const [signedOut, setSignedOut] = useState(false);

  // On start: if a token was saved earlier, load the user it belongs to
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api
      .get('/auth/me')
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // Invalid/expired tokens are already removed by the API client (401)
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API client fires this event when the server says our token is no longer valid
  useEffect(() => {
    function handleUnauthorized() {
      if (user) toast.info('Your session has ended. Please sign in again.');
      setUser(null);
    }
    window.addEventListener('gpmp:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('gpmp:unauthorized', handleUnauthorized);
  }, [toast, user]);

  // Logs in and returns the user. Throws ApiError (e.g. wrong password) for the page to show.
  const login = useCallback(async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    setToken(result.token);
    setUser(result.user);
    setSignedOut(false);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setSignedOut(true);
    setUser(null);
  }, []);

  // Reloads the user from the server (e.g. after editing the profile or joining a group)
  const refreshUser = useCallback(async () => {
    const me = await api.get('/auth/me');
    setUser(me);
    return me;
  }, []);

  // hasRole('Student') or hasRole('Supervisor', 'Administrator') -> true / false
  const hasRole = useCallback(
    (...roles) => Boolean(user) && roles.flat().includes(user.role),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, signedOut, login, logout, refreshUser, hasRole }),
    [user, loading, signedOut, login, logout, refreshUser, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Returns { user, loading, signedOut, login, logout, refreshUser, hasRole }
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
