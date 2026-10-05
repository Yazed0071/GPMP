// Builds the Express application: security headers, CORS, JSON parsing,
// every /api router, the JSON 404 and the error handler.
// In production it also serves the built React app (dist/).

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { config } from './config/env.js';
import { PROJECT_DIR } from './utils/paths.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// Shared lookups (e.g. the group picker)
import metaRoutes from './routes/meta.routes.js';
// Accounts: authentication, users, profile
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import profileRoutes from './routes/profile.routes.js';
// Groups and projects: groups, projects, proposals, supervisors, examiners, showcase
import groupsRoutes from './routes/groups.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import proposalsRoutes from './routes/proposals.routes.js';
import supervisorsRoutes from './routes/supervisors.routes.js';
import examinersRoutes from './routes/examiners.routes.js';
import showcaseRoutes from './routes/showcase.routes.js';
// Project work: tasks, submissions, files, feedback
import tasksRoutes from './routes/tasks.routes.js';
import submissionsRoutes from './routes/submissions.routes.js';
import filesRoutes from './routes/files.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
// Calendar: events, attendance, dashboard
import eventsRoutes from './routes/events.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
// Communication: chat, announcements, notifications, resources
import chatRoutes from './routes/chat.routes.js';
import announcementsRoutes from './routes/announcements.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import resourcesRoutes from './routes/resources.routes.js';

const app = express();

// Security headers. Downloads and videos are fetched by the page as "blob:" URLs,
// so those are allowed for images, media and embedded previews.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        upgradeInsecureRequests: null, // allow running on plain http (e.g. a demo server without HTTPS)
      },
    },
  })
);

// Allow the React dev server (CLIENT_URL) to call the API
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
    exposedHeaders: ['Content-Disposition'], // lets the browser read download file names
  })
);

app.use(express.json({ limit: '1mb' }));

// Express 5 leaves req.body undefined when no JSON was sent; use {} so
// "const { title } = req.body" never crashes (file uploads replace it with the form fields)
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Quick check that the API is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/meta', metaRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/profile', profileRoutes);

app.use('/api/groups', groupsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/supervisors', supervisorsRoutes);
app.use('/api/examiners', examinersRoutes);
app.use('/api/showcase', showcaseRoutes);

app.use('/api/tasks', tasksRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/feedback', feedbackRoutes);

app.use('/api/events', eventsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/chat', chatRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/resources', resourcesRoutes);

// Any other /api address is an unknown route -> JSON 404
app.use('/api', notFound);

// Production: serve the built React app and send index.html for its client-side routes
const frontendDist = path.join(PROJECT_DIR, 'dist'); // created by "npm run build"
if (config.isProduction && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Must be the last middleware
app.use(errorHandler);

export default app;
