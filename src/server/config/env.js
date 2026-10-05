// Loads the settings from .env and exposes them as one "config" object.
// Every other file imports settings from here instead of reading process.env directly.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Always load .env, no matter which folder the app is started from
const currentDir = path.dirname(fileURLToPath(import.meta.url));
// This file is in src/server/config/, and .env is in the project folder (three levels up)
dotenv.config({ path: path.join(currentDir, '../../../.env'), quiet: true });

// Turns a text value into a number, or uses the fallback when it is empty/invalid
function toNumber(value, fallback) {
  const number = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(number) ? number : fallback;
}

// The mode is set with APP_ENV in .env (not NODE_ENV): the React client reads the same .env
// file, and Vite would turn a NODE_ENV=development line into a slow, unoptimised build.
// NODE_ENV still works when it is set outside .env (e.g. by a hosting service).
const nodeEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
process.env.NODE_ENV = nodeEnv; // Express reads NODE_ENV itself

export const config = {
  port: toNumber(process.env.PORT, 5000),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  timeZone: process.env.APP_TIME_ZONE || 'Asia/Riyadh', // the university's time zone ("today", reminders)

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gpmp',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  smtp: {
    host: process.env.SMTP_HOST || '', // empty = print emails to the console instead of sending
    port: toNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'GPMP <no-reply@gpmp.edu>',
  },
};

// The app cannot create secure login tokens without a real secret, so stop early with a clear
// message. The example value from .env.example is public, so it is refused too.
const secret = config.jwt.secret;
if (!secret || secret.startsWith('change-me') || secret.length < 32) {
  console.error(
    '\n[config] JWT_SECRET is missing or still the example value.\n' +
      'Copy .env.example to .env (in the project folder) and set JWT_SECRET to a long random text\n' +
      '(at least 32 characters), e.g. the output of:\n' +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
  );
  process.exit(1);
}

// A wrong time zone name would make every "today" calculation fail later, so check it now
try {
  new Intl.DateTimeFormat('en', { timeZone: config.timeZone });
} catch {
  console.error(`\n[config] APP_TIME_ZONE "${config.timeZone}" is not a valid time zone (example: Asia/Riyadh).\n`);
  process.exit(1);
}
