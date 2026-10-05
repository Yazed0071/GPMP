// The last middlewares in app.js:
//   notFound     -> JSON 404 for unknown /api routes
//   errorHandler -> turns ANY thrown error into { error: { message, details? } }
// Known problems (validation, duplicates, bad uploads...) get a friendly message and
// the right status. Unexpected errors return a generic 500 and are logged on the server only.

import multer from 'multer';
import { HttpError } from '../utils/HttpError.js';
import { deleteStoredFile } from '../utils/paths.js';

export function notFound(req, res) {
  res.status(404).json({ error: { message: `API route not found: ${req.method} ${req.originalUrl}` } });
}

// If a request uploaded files and then failed, delete those files so they don't pile up
function removeUploadedFiles(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === 'object') Object.values(req.files).forEach((list) => files.push(...list));

  for (const file of files) {
    if (file && file.filename) deleteStoredFile(file.filename);
  }
}

// Returns a plain-words message when an error means "the database is not ready", otherwise null
function databaseSetupHint(err) {
  switch (err.code) {
    case 'ER_NO_SUCH_TABLE': // a table is missing
    case 'ER_BAD_FIELD_ERROR': // a column is missing (the database is older than schema.sql)
    case 'ER_BAD_DB_ERROR': // the gpmp database does not exist
      return 'The database is not set up completely. Run "npm run db:setup" and try again.';
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ECONNRESET':
      return 'The database is not available. Start MySQL in the XAMPP Control Panel and try again.';
    default:
      return null;
  }
}

// Works out the status code and message for an error
function describeError(err) {
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message, details: err.details };
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large (maximum 20 MB).' : 'The upload could not be processed.';
    return { status: 400, message };
  }

  // MySQL / MariaDB errors
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return { status: 409, message: 'This record already exists.' };
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return { status: 400, message: 'A related record was not found.' };
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return { status: 409, message: 'This record is still in use and cannot be deleted.' };
    case 'ER_CHECK_CONSTRAINT_VIOLATED': // MySQL
    case 'ER_CONSTRAINT_FAILED': // MariaDB
      return { status: 400, message: 'One of the values is not allowed.' };
    case 'ER_DATA_TOO_LONG':
      return { status: 400, message: 'One of the values is too long.' };
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
      return { status: 400, message: 'One of the values has an invalid format.' };
    default:
      break;
  }
  // The database itself is not ready: MySQL is stopped, or tables are missing/outdated
  // (for example after "npm run db:setup" was interrupted). One clear line instead of a stack trace.
  const setupHint = databaseSetupHint(err);
  if (setupHint) {
    return { status: 503, message: setupHint, isSetupProblem: true };
  }

  // Check constraint errors by number too (MariaDB 4025, MySQL 3819)
  if (err.errno === 4025 || err.errno === 3819) {
    return { status: 400, message: 'One of the values is not allowed.' };
  }

  // Errors from express.json() when the request body is broken
  if (err.type === 'entity.parse.failed') {
    return { status: 400, message: 'The request body is not valid JSON.' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'The request is too large.' };
  }

  // Other client errors that already carry a status (e.g. a download of a missing file)
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const message = status === 404 ? 'The requested file or page was not found.' : 'The request could not be processed.';
    return { status, message };
  }

  return { status: 500, message: 'Something went wrong. Please try again.' };
}

// Express knows this is an error handler because it has 4 parameters
export function errorHandler(err, req, res, next) {
  removeUploadedFiles(req);

  const { status, message, details, isSetupProblem } = describeError(err);

  if (isSetupProblem) {
    console.error(`[error] ${req.method} ${req.originalUrl}: ${err.sqlMessage || err.code}. ${message}`);
  } else if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}\n`, err);
  }

  // If part of the response was already sent (e.g. a download broke halfway),
  // let Express close the connection instead of sending a second response
  if (res.headersSent) {
    next(err);
    return;
  }

  const body = { message };
  if (details !== undefined) body.details = details;
  res.status(status).json({ error: body });
}
