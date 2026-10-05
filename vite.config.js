// Vite settings for the GPMP client (dev server, proxy to the Node.js server, React support).
// Vite serves index.html from this folder, which loads src/client/main.jsx.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read .env files so the backend address can be changed without editing this file
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:5000';

  return {
    // Lets Vite understand React (JSX) code
    plugins: [react()],

    server: {
      // The website runs at http://localhost:5173
      port: 5173,
      // Forward API calls and the real-time (Socket.IO) connection to the Node.js backend,
      // so the frontend can simply call "/api/..." without worrying about ports.
      proxy: {
        '/api': { target: backendUrl, changeOrigin: true },
        '/socket.io': { target: backendUrl, changeOrigin: true, ws: true },
      },
      // The server code, database scripts and uploaded files live in the same project folder.
      // Never let the dev server hand them out: uploads must only be downloaded through the
      // API, which checks who is allowed to see them.
      fs: {
        deny: ['.env', '.env.*', '**/src/server/**', '**/database/**', '**/scripts/**', '**/uploads/**'],
      },
      // Uploading files and editing server code should not make the browser page reload
      watch: {
        ignored: ['**/uploads/**', '**/src/server/**', '**/database/**', '**/scripts/**'],
      },
    },

    build: {
      rollupOptions: {
        output: {
          // Put the libraries (React, the router, Socket.IO) in their own file. They rarely
          // change, so browsers can keep them cached, and no single file gets too large.
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'socket.io-client'],
          },
        },
      },
    },
  };
});
