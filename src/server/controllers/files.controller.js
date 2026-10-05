// Group documents and uploaded files (FR-16, UC4 Upload Files, FR-4 "submitted documents").
// Files are stored in uploads/ with a random name; the `file` table keeps the
// original name, size, category and version. Files are only downloaded through
// GET /api/files/:id/download, which checks that the user may access the file's group.
//
// Categories: 'Document'   = uploaded on the Documents page
//             'Submission' = attached to a task submission (UC5)
//             'Showcase'   = showcase material (managed by the showcase pages)

import { query, withTransaction, likePattern } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { toInt, oneOf, isBlank } from '../utils/validate.js';
import {
  assertGroupAccess,
  getAccessibleGroupIds,
  getGroupUserIds,
  assertGroupNotArchived,
} from '../services/access.js';
import { notify } from '../services/notify.js';
import { getFileInfo } from '../middleware/upload.js';
import { getUploadPath, storedFileExists, deleteStoredFile } from '../utils/paths.js';

export const FILE_CATEGORIES = ['Document', 'Submission', 'Showcase'];

// Columns shared by every file query (joined with the uploader, group and related task)
const FILE_SELECT = `
  SELECT f.FileID AS id, f.GroupID AS groupId, g.GroupName AS groupName,
         f.FileName AS fileName, f.FileSize AS fileSize, f.MimeType AS mimeType,
         f.Category AS category, f.Version AS version, f.UploadDate AS uploadDate,
         f.FilePath AS storedName,
         f.UploadedByUserID AS uploaderId, u.Name AS uploaderName,
         f.SubmissionID AS submissionId, s.TaskID AS taskId, t.Title AS taskTitle,
         gp.Status AS projectStatus
    FROM \`file\` f
    LEFT JOIN project_group g ON g.GroupID = f.GroupID
    LEFT JOIN graduation_project gp ON gp.GroupID = f.GroupID
    LEFT JOIN \`user\` u      ON u.UserID = f.UploadedByUserID
    LEFT JOIN submission s    ON s.SubmissionID = f.SubmissionID
    LEFT JOIN task t          ON t.TaskID = s.TaskID`;

// ---------------------------------------------------------------------------
// Helpers (also used by the tasks, submissions and feedback controllers)
// ---------------------------------------------------------------------------

/**
 * Builds the "which groups" part of a WHERE clause for the list endpoints.
 *   groupId given -> checks access (400/403/404) and returns "<column> = ?"
 *   no groupId    -> every group the user can access ("<column> IN (?)"),
 *                    or no limit at all for administrators ("1 = 1")
 * Returns null when the user has no groups (the list is then simply empty).
 * Example: const scope = await groupCondition(req.user, req.query.groupId, 't.GroupID');
 */
export async function groupCondition(user, groupIdParam, column) {
  if (!isBlank(groupIdParam)) {
    const groupId = await assertGroupAccess(user, groupIdParam);
    return { sql: `${column} = ?`, params: [groupId] };
  }
  const groupIds = await getAccessibleGroupIds(user);
  if (groupIds === null) return { sql: '1 = 1', params: [] };
  if (groupIds.length === 0) return null;
  return { sql: `${column} IN (?)`, params: [groupIds] };
}

/**
 * Works out the next version number for a file name in a group.
 * Uploading "Proposal.pdf" again makes version 2, then 3, ... (per category).
 * `db` is a transaction connection that has locked the group row first
 * (see lockGroupRow), so two uploads at the same moment cannot get the same version.
 */
export async function nextFileVersion(db, groupId, fileName, category) {
  const [rows] = await db.query(
    `SELECT COALESCE(MAX(Version), 0) AS highest FROM \`file\`
      WHERE GroupID = ? AND FileName = ? AND Category = ?`,
    [groupId, fileName, category]
  );
  return Number(rows[0].highest) + 1;
}

/**
 * Locks the group's row until the transaction ends. Uploads of the same group then wait for
 * each other, so their version numbers never clash (a double click cannot make two "v1").
 * Example (inside withTransaction): await lockGroupRow(conn, groupId);
 */
export async function lockGroupRow(conn, groupId) {
  await conn.query('SELECT GroupID FROM project_group WHERE GroupID = ? FOR UPDATE', [groupId]);
}

/**
 * The attachments of several submissions, grouped by submission id:
 *   { 7: [{ id, fileName, fileSize, mimeType, version }], ... }
 */
export async function getFilesBySubmission(submissionIds) {
  const result = {};
  if (submissionIds.length === 0) return result; // "IN ()" would be invalid SQL

  const rows = await query(
    `SELECT FileID AS id, SubmissionID AS submissionId, FileName AS fileName,
            FileSize AS fileSize, MimeType AS mimeType, Version AS version
       FROM \`file\`
      WHERE SubmissionID IN (?)
      ORDER BY FileID`,
    [submissionIds]
  );
  for (const row of rows) {
    const { submissionId, ...file } = row;
    if (!result[submissionId]) result[submissionId] = [];
    result[submissionId].push(file);
  }
  return result;
}

// Deletes stored files from the uploads folder (after their rows were deleted)
export async function removeStoredFiles(storedNames) {
  for (const name of storedNames) {
    await deleteStoredFile(name);
  }
}

// Who may delete a file: Documents -> the uploader, the group's supervisor or an admin.
// Submission and showcase files are part of the project record -> only an admin.
// Files of an archived project are kept as they are (FR-8) -> only an admin.
// (A supervisor only ever sees the groups they supervise, so the role check is enough here.)
function canDeleteFile(user, file) {
  if (user.role === 'Administrator') return true;
  if (file.projectStatus === 'Archived') return false;
  if (file.category !== 'Document') return false;
  return file.uploaderId === user.id || user.role === 'Supervisor';
}

// Turns a database row into the JSON shape the frontend uses
// (the stored name on disk is never sent to the browser)
function shapeFile(row, user) {
  return {
    id: row.id,
    groupId: row.groupId,
    groupName: row.groupName,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    category: row.category,
    version: row.version,
    uploadedBy: row.uploaderId ? { id: row.uploaderId, name: row.uploaderName } : null,
    uploadDate: row.uploadDate,
    submissionId: row.submissionId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    canDelete: canDeleteFile(user, row),
  };
}

// Loads one file row (with the joined details) or throws 404
async function findFile(fileId) {
  const rows = await query(`${FILE_SELECT} WHERE f.FileID = ?`, [fileId]);
  if (rows.length === 0) throw new HttpError(404, 'File not found');
  return rows[0];
}

// Checks that the user may see this file (it belongs to a group they can access)
async function assertFileAccess(user, file) {
  if (file.groupId) {
    await assertGroupAccess(user, file.groupId);
    return;
  }
  // A file without a group: only an admin or the person who uploaded it
  if (user.role !== 'Administrator' && file.uploaderId !== user.id) {
    throw new HttpError(404, 'File not found');
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/files?groupId=&category=&search=
 * Files of one group (or of every group the user can access when groupId is empty).
 */
export async function listFiles(req, res) {
  const scope = await groupCondition(req.user, req.query.groupId, 'f.GroupID');
  if (!scope) return res.json([]);
  const conditions = [scope.sql];
  const params = [...scope.params];

  if (!isBlank(req.query.category)) {
    conditions.push('f.Category = ?');
    params.push(oneOf(req.query.category, FILE_CATEGORIES, 'Category'));
  }

  if (!isBlank(req.query.search)) {
    conditions.push('f.FileName LIKE ?');
    params.push(likePattern(String(req.query.search).trim()));
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = await query(`${FILE_SELECT} ${where} ORDER BY f.UploadDate DESC, f.FileID DESC`, params);

  res.json(rows.map((row) => shapeFile(row, req.user)));
}

/**
 * POST /api/files  (multipart: "file" + groupId)
 * UC4: uploads a project document to a group. Examiners are blocked in the route.
 * Uploading a file with the same name again creates a new version (v2, v3, ...).
 * An archived project (FR-8) only accepts uploads from an administrator.
 */
export async function uploadDocument(req, res) {
  if (!req.file) throw new HttpError(400, 'Please choose a file to upload.');
  const groupId = await assertGroupAccess(req.user, req.body.groupId);
  await assertGroupNotArchived(req.user, groupId);

  const info = getFileInfo(req.file);

  // The version is worked out and saved in one transaction, with the group row locked
  const { fileId, version } = await withTransaction(async (conn) => {
    await lockGroupRow(conn, groupId);
    const nextVersion = await nextFileVersion(conn, groupId, info.fileName, 'Document');
    const [inserted] = await conn.query(
      `INSERT INTO \`file\` (GroupID, UploadedByUserID, FileName, FilePath, FileSize, MimeType, Category, Version)
       VALUES (?, ?, ?, ?, ?, ?, 'Document', ?)`,
      [groupId, req.user.id, info.fileName, info.filePath, info.fileSize, info.mimeType, nextVersion]
    );
    return { fileId: inserted.insertId, version: nextVersion };
  });

  const file = await findFile(fileId);

  // Let the supervisor know when a student adds a document to the group
  if (req.user.role === 'Student') {
    const supervisorIds = await getGroupUserIds(groupId, { students: false, supervisor: true });
    await notify(supervisorIds, {
      type: 'System',
      title: `New document: ${info.fileName}`,
      message: `${req.user.name} uploaded ${info.fileName} (v${version}) to ${file.groupName}.`,
      link: `/documents?groupId=${groupId}`,
    });
  }

  res.status(201).json(shapeFile(file, req.user));
}

/**
 * GET /api/files/:id/download
 * Sends the stored file with its original name, after checking group access (NFR-9).
 */
export async function downloadFile(req, res) {
  const fileId = toInt(req.params.id, 'File id');
  const file = await findFile(fileId);
  await assertFileAccess(req.user, file);

  if (!storedFileExists(file.storedName)) {
    throw new HttpError(404, 'The file could not be found on the server.');
  }
  res.download(getUploadPath(file.storedName), file.fileName);
}

/**
 * DELETE /api/files/:id
 * Documents: the uploader, the group's supervisor or an admin. Submission files: admin only.
 * Files of an archived project (FR-8): admin only.
 */
export async function deleteFile(req, res) {
  const fileId = toInt(req.params.id, 'File id');
  const file = await findFile(fileId);
  await assertFileAccess(req.user, file);

  if (file.groupId) await assertGroupNotArchived(req.user, file.groupId); // FR-8
  if (!canDeleteFile(req.user, file)) {
    throw new HttpError(
      403,
      file.category === 'Document'
        ? 'You can only delete files you uploaded.'
        : 'Submission files can only be deleted by an administrator.'
    );
  }

  await query('DELETE FROM `file` WHERE FileID = ?', [fileId]);
  await removeStoredFiles([file.storedName]);

  res.json({ message: 'File deleted' });
}
