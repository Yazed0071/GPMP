// ToastContext: small pop-up messages ("toasts") in the corner of the screen.
// Usage in any component:
//   const toast = useToast();
//   toast.success('Task created');
//   toast.error(err.message);   // or toast.error(err) - an Error object also works
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Icon from '../components/common/Icon.jsx';

const ToastContext = createContext(null);

// How long each kind of toast stays visible (milliseconds)
const DURATION = { success: 3500, info: 4000, error: 6000 };
const ICONS = { success: 'check', info: 'info', error: 'alert' };

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type, message) => {
      // Accept a plain string or an Error/ApiError object
      const text =
        typeof message === 'string' ? message : message?.message || 'Something went wrong.';
      const id = nextId++;
      // Keep at most 4 toasts on screen
      setToasts((list) => [...list.slice(-3), { id, type, text }]);
      setTimeout(() => dismiss(id), DURATION[type]);
    },
    [dismiss]
  );

  // useMemo keeps the same object between renders, so pages can safely use it in effects
  const value = useMemo(
    () => ({
      success: (msg) => show('success', msg),
      error: (msg) => show('error', msg),
      info: (msg) => show('info', msg),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">
              <Icon name={ICONS[t.type]} size={18} />
            </span>
            <span className="toast-text">{t.text}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Close message"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Returns { success(msg), error(msg), info(msg) }
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
