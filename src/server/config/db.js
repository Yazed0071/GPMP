// MySQL connection pool and small helpers used by the controllers:
//   query(sql, params)      -> runs one parameterized query and returns the rows
//   withTransaction(fn)     -> runs several queries that must all succeed or all fail
//   likePattern(text)       -> a LIKE pattern that searches for the text exactly as typed

import mysql from 'mysql2/promise';
import { config } from './env.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci', // full Unicode support (Arabic names, emoji)
  timezone: 'Z', // read/write DATETIME values as UTC
  dateStrings: ['DATE'], // DATE columns come back as 'YYYY-MM-DD' text, DATETIME as JS Date objects
  decimalNumbers: true, // DECIMAL values (e.g. GPA, SUM()) come back as numbers, not text
});

// Make MySQL itself work in UTC too, so NOW() / CURRENT_TIMESTAMP match the values we send.
// This runs once for every new connection the pool opens, before any other query on it.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

/**
 * Runs one SQL statement with "?" placeholders and returns the result.
 * - SELECT returns an array of row objects.
 * - INSERT/UPDATE/DELETE return an object with insertId and affectedRows.
 * Example: const rows = await query('SELECT * FROM task WHERE GroupID = ?', [groupId]);
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Runs fn(conn) inside a database transaction. If fn throws, every change is undone.
 * Inside fn use conn.query(sql, params), which returns [rows, fields].
 * Example:
 *   const id = await withTransaction(async (conn) => {
 *     const [result] = await conn.query('INSERT INTO ...', [...]);
 *     await conn.query('UPDATE ...', [...]);
 *     return result.insertId;
 *   });
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('[db] Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Turns search text into a "contains" pattern for LIKE ? (the text is still passed as a parameter).
 * % and _ are LIKE wildcards, so they are escaped: a search for "50%" finds the text "50%",
 * not "50<anything>". Example: likePattern('50%') -> '%50\%%'
 */
export function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
