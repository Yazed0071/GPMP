// Entry point: starts React and draws the app inside <div id="root"> in index.html.
// The providers below share things with every page:
//   BrowserRouter  -> moving between pages without reloading
//   ToastProvider  -> pop-up success/error messages
//   AuthProvider   -> the logged-in user
//   SocketProvider -> the real-time connection (chat, notifications)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// The shared styles are loaded FIRST, so each page's own stylesheet (styles/<page>.css)
// comes later and wins when both set the same thing.
import './styles/global.css';
import App from './App.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
