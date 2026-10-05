// SocketContext: keeps ONE real-time connection (Socket.IO) to the backend while the user is
// logged in. The backend pushes events such as new chat messages and notifications.
//
// Usage:
//   const socket = useSocket();                    // the socket, or null when not connected
//   useSocketEvent('notification:new', (n) => { ... });   // listen to an event
//   const connected = useSocketStatus();           // true / false (e.g. to show "offline")
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const userId = user?.id;

  // Connect when a user logs in; disconnect on logout or when another user logs in
  useEffect(() => {
    const token = getToken();
    if (!userId || !token) return;

    // Same address as the website; Vite forwards /socket.io to the backend in development.
    // `auth` is a function so every reconnect sends the newest saved token.
    const newSocket = io({ path: '/socket.io', auth: (send) => send({ token: getToken() }) });
    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));
    newSocket.on('connect_error', (err) => {
      console.warn('Real-time connection failed:', err.message);
    });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>
  );
}

// Returns the Socket.IO socket, or null while logged out / not yet created
export function useSocket() {
  return useContext(SocketContext).socket;
}

// Returns true while the real-time connection is up
export function useSocketStatus() {
  return useContext(SocketContext).connected;
}

// Runs `handler(data)` every time the server sends `event`.
// The listener is removed automatically when the component unmounts.
// The handler always sees the latest props/state (no need to list dependencies).
export function useSocketEvent(event, handler) {
  const socket = useSocket();
  const handlerRef = useRef(handler);

  // Always remember the newest handler function
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket || !event) return;
    const listener = (...args) => handlerRef.current?.(...args);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
