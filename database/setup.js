// One-command database setup: "npm run db:setup"
//   1. creates the gpmp database if it does not exist
//   2. runs schema.sql (WARNING: this deletes all GPMP tables and their data, then creates them again)
//      and deletes the old uploaded files in uploads/ (their database rows are gone)
//   3. inserts the demo data from seed.js (including its small demo files)
// Make sure MySQL is running (XAMPP Control Panel -> MySQL -> Start) before running it.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/server/config/env.js';
import { pool } from '../src/server/config/db.js';
import { UPLOAD_DIR } from '../src/server/utils/paths.js';
import { seed, DEMO_PASSWORD } from './seed.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(currentDir, 'schema.sql');

// Explains the most common connection problems in plain words
function explain(err) {
  if (err.code === 'ECONNREFUSED') {
    return `Cannot connect to MySQL at ${config.db.host}:${config.db.port}. Start MySQL in the XAMPP Control Panel and try again.`;
  }
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'MySQL rejected the username or password. Check DB_USER and DB_PASSWORD in .env.';
  }
  if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_SERVER_SHUTDOWN'].includes(err.code)) {
    return (
      'MySQL stopped while the tables were being rebuilt, so the database is now incomplete.\n' +
      'This is a crash of the MariaDB version that comes with XAMPP, not a GPMP error.\n' +
      'Fix: start MySQL again in the XAMPP Control Panel (it repairs itself on start), wait 10 seconds,\n' +
      'then run "npm run db:setup" again.'
    );
  }
  return err.message;
}

// MariaDB 10.4 (the XAMPP version) can crash when tables are dropped and created again while it is
// still doing background clean-up ("purge") of old changes - for example right after MySQL starts.
// So before dropping and before creating, wait (at most 30 seconds) until that clean-up is idle.
async function waitForMysqlCleanup(connection) {
  for (let second = 0; second < 30; second += 1) {
    let status;
    try {
      const [rows] = await connection.query('SHOW ENGINE INNODB STATUS');
      status = rows[0]?.Status || '';
    } catch {
      return; // no permission to read the status: just continue
    }
    const pendingChanges = Number(/History list length (\d+)/.exec(status)?.[1] ?? 0);
    const purgeIdle = /state: running but idle|state: stopped/.test(status);
    if (purgeIdle && pendingChanges < 100) return;
    if (second === 0) console.log('    Waiting for MySQL to finish its background clean-up ...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Deletes every file in uploads/ (keeps .gitkeep, so the empty folder stays in Git).
// Called right after the tables were re-created, when no row points to these files any more.
async function clearUploads() {
  let removed = 0;
  for (const name of await fs.readdir(UPLOAD_DIR)) {
    if (name === '.gitkeep') continue;
    const fullPath = path.join(UPLOAD_DIR, name);
    if ((await fs.stat(fullPath)).isFile()) {
      await fs.unlink(fullPath);
      removed += 1;
    }
  }
  return removed;
}

async function main() {
  const dbName = config.db.database;

  console.log(`1/3 Connecting to MySQL at ${config.db.host}:${config.db.port} ...`);
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true, // schema.sql contains many statements
    charset: 'utf8mb4_unicode_ci',
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(dbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE ${mysql.escapeId(dbName)}`);

    console.log(`2/3 Creating the tables in "${dbName}" from schema.sql ...`);
    const schemaSql = await fs.readFile(SCHEMA_FILE, 'utf8');
    // schema.sql first drops the old tables, then creates the new ones. Run the two parts
    // separately and let MySQL finish its clean-up in between (see waitForMysqlCleanup).
    const firstCreate = schemaSql.indexOf('CREATE TABLE');
    const dropPart = schemaSql.slice(0, firstCreate);
    const createPart = schemaSql.slice(firstCreate);

    await waitForMysqlCleanup(connection);
    await connection.query(dropPart);
    await waitForMysqlCleanup(connection);
    await connection.query(createPart);
  } finally {
    await connection.end();
  }

  const removed = await clearUploads();
  if (removed > 0) console.log(`    Removed ${removed} old uploaded file(s) from uploads/`);

  console.log('3/3 Inserting the demo data ...');
  await seed(pool);

  console.log('\nDone! The database is ready.');
  console.log(`Sign in with admin@gpmp.edu, supervisor1@gpmp.edu, student1@gpmp.edu ... (password: ${DEMO_PASSWORD})`);
}

try {
  await main();
} catch (err) {
  console.error('\nDatabase setup failed:', explain(err));
  process.exitCode = 1;
} finally {
  await pool.end();
}
