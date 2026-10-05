// Entry point: starts the HTTP server with Express (REST API) and Socket.IO (live updates),
// then starts the reminder job. Run with "npm run dev" (auto-restart) or "npm start".

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import app from './app.js';
import { config } from './config/env.js';
import { pool } from './config/db.js';
import { initSocket } from './socket.js';
import { startReminders } from './services/reminders.js';
import { PROJECT_DIR } from './utils/paths.js';

// Lists the tables that database/schema.sql creates but the database does not have.
// This catches a half-finished "npm run db:setup" (for example when MySQL stopped in the middle).
async function findMissingTables() {
  const schemaSql = await fs.readFile(path.join(PROJECT_DIR, 'database', 'schema.sql'), 'utf8');
  const expected = [...schemaSql.matchAll(/CREATE TABLE `?(\w+)`?/g)].map((match) => match[1]);
  const [rows] = await pool.query(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [config.db.database]
  );
  const existing = new Set(rows.map((row) => row.name.toLowerCase()));
  return expected.filter((name) => !existing.has(name.toLowerCase()));
}

const server = http.createServer(app);
initSocket(server);

// Friendly message when the port is taken (e.g. the server is already running)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${config.port} is already in use. Stop the other server or change PORT in .env.`);
  } else {
    console.error('[server] Could not start:', err.message);
  }
  process.exit(1);
});

server.listen(config.port, async () => {
  console.log(`[server] GPMP API running at http://localhost:${config.port}/api (${config.nodeEnv})`);

  // Check the database once so a missing MySQL is noticed immediately
  try {
    await pool.query('SELECT 1');
    console.log(`[server] Connected to MySQL database "${config.db.database}"`);
  } catch (err) {
    console.error(
      `[server] Cannot reach MySQL (${err.code || err.message}). Is XAMPP's MySQL running, ` +
        'and did you run "npm run db:setup"?'
    );
    return;
  }

  // ...and check that every table exists
  try {
    const missing = await findMissingTables();
    if (missing.length > 0) {
      console.error(
        `[server] WARNING: the database is incomplete (${missing.length} missing table(s): ${missing.join(', ')}).\n` +
          '[server] Run "npm run db:setup" to create all tables again with the demo data.'
      );
    }
  } catch (err) {
    console.error(`[server] Could not check the database tables: ${err.message}`);
  }
});

// Deadline and meeting reminders (turned off with DISABLE_REMINDERS=1, e.g. while testing)
startReminders();
