// Projects showcase and archive (FR-18 showcase video + description, FR-19 access to archived
// and showcased projects, FR-8 final documentation kept with the archived project).
// Completed and Archived projects are visible to every logged-in user.

import { query, withTransaction, likePattern } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { toInt, isBlank, trimOrNull, checkMaxLength } from '../utils/validate.js';
import { assertGroupAccess, getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';
import { getFileInfo } from '../middleware/upload.js';
import { getUploadPath, storedFileExists, deleteStoredFile } from '../utils/paths.js';
import { FINISHED_STATUSES, findProjectById, readAcademicYear } from './projects.controller.js';

const MAX_SHOWCASE_TEXT = 5000;

// The showcase cards: finished projects with their group and supervisor
const SHOWCASE_SELECT = `
  SELECT p.ProjectID AS projectId, p.ProjectTitle AS title, p.ProjectDescription AS description,
         p.ShowcaseDescription AS showcaseDescription, p.AcademicYear AS academicYear,
         p.Status AS status, p.ShowcaseVideoPath AS videoPath,
         p.CompletedAt AS completedAt, p.ArchivedAt AS archivedAt,
         g.GroupID AS groupId, g.GroupName AS groupName, su.Name AS supervisorName
    FROM graduation_project p
    JOIN project_group g    ON g.GroupID = p.GroupID
    LEFT JOIN supervisor sp ON sp.SupervisorID = g.SupervisorID
    LEFT JOIN \`user\` su   ON su.UserID = sp.UserID`;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Member names of the given groups: Map groupId -> ['Name', ...]
async function getMemberNames(groupIds) {
  const map = new Map();
  if (groupIds.length === 0) return map;
  const rows = await query(
    `SELECT s.GroupID AS groupId, u.Name AS name
       FROM student s JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID IN (?) ORDER BY u.Name`,
    [groupIds]
  );
  for (const row of rows) {
    if (!map.has(row.groupId)) map.set(row.groupId, []);
    map.get(row.groupId).push(row.name);
  }
  return map;
}

// Number of final documents per group: Map groupId -> count
// (each file name once, like getFinalDocuments, so old versions are not counted)
async function getDocumentCounts(groupIds) {
  const map = new Map();
  if (groupIds.length === 0) return map;
  const rows = await query(
    `SELECT GroupID AS groupId, COUNT(DISTINCT FileName) AS total FROM \`file\`
      WHERE Category = 'Document' AND GroupID IN (?) GROUP BY GroupID`,
    [groupIds]
  );
  for (const row of rows) map.set(row.groupId, row.total);
  return map;
}

// Turns a showcase row into the API shape (the stored video name is never sent)
function toShowcaseItem(row, memberNames, documentCounts) {
  const { videoPath, ...item } = row;
  return {
    id: row.projectId,
    ...item,
    members: memberNames.get(row.groupId) || [],
    hasVideo: Boolean(videoPath),
    documentCount: documentCounts.get(row.groupId) || 0,
  };
}

/**
 * Loads a project for the showcase endpoints. Finished projects are public to every
 * logged-in user; other projects only to the users of that group.
 */
async function getShowcaseProject(user, idParam) {
  const projectId = toInt(idParam, 'Project id');
  const project = await findProjectById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (!FINISHED_STATUSES.includes(project.status)) {
    await assertGroupAccess(user, project.groupId);
  }
  return project;
}

// The group's final documents: the newest version of each file in the Documents area
async function getFinalDocuments(groupId) {
  return query(
    `SELECT f.FileID AS id, f.FileName AS name, f.Version AS version, f.FileSize AS size,
            f.UploadDate AS uploadedAt
       FROM \`file\` f
      WHERE f.GroupID = ? AND f.Category = 'Document'
        AND f.Version = (SELECT MAX(f2.Version) FROM \`file\` f2
                          WHERE f2.GroupID = f.GroupID AND f2.Category = 'Document'
                            AND f2.FileName = f.FileName)
      ORDER BY f.FileName`,
    [groupId]
  );
}

// Builds the full showcase detail of one project for this user
async function buildShowcaseDetail(user, projectId) {
  const rows = await query(`${SHOWCASE_SELECT} WHERE p.ProjectID = ?`, [projectId]);
  const row = rows[0];

  const [memberNames, documentCounts, memberRows, examinerRows, documents] = await Promise.all([
    getMemberNames([row.groupId]),
    getDocumentCounts([row.groupId]),
    query(
      `SELECT u.Name AS name, s.StudentMajor AS major
         FROM student s JOIN \`user\` u ON u.UserID = s.UserID
        WHERE s.GroupID = ? ORDER BY u.Name`,
      [row.groupId]
    ),
    query(
      `SELECT u.Name AS name FROM project_group g
         JOIN examiner ex ON ex.ExaminerID = g.ExaminerID
         JOIN \`user\` u ON u.UserID = ex.UserID
        WHERE g.GroupID = ?`,
      [row.groupId]
    ),
    getFinalDocuments(row.groupId),
  ]);

  const isFinished = FINISHED_STATUSES.includes(row.status);
  return {
    ...toShowcaseItem(row, memberNames, documentCounts),
    memberDetails: memberRows,
    examinerName: examinerRows[0]?.name || null,
    documents,
    // FR-18: the students of the group edit their showcase once the project is finished
    canEdit: user.role === 'Student' && user.groupId === row.groupId && isFinished,
  };
}

// Deletes the group's showcase video rows (inside a transaction) and returns their stored names
async function removeShowcaseFiles(conn, groupId) {
  const [rows] = await conn.query("SELECT FilePath FROM `file` WHERE GroupID = ? AND Category = 'Showcase'", [
    groupId,
  ]);
  await conn.query("DELETE FROM `file` WHERE GroupID = ? AND Category = 'Showcase'", [groupId]);
  return rows.map((row) => row.FilePath);
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

/**
 * GET /api/showcase?year=2024-2025&search=library
 * FR-19: completed and archived projects, newest academic year first.
 * search looks in the title, descriptions, group name and supervisor name.
 */
export async function listShowcase(req, res) {
  const conditions = ['p.Status IN (?)'];
  const params = [FINISHED_STATUSES];

  if (!isBlank(req.query.year)) {
    conditions.push('p.AcademicYear = ?');
    params.push(String(req.query.year).trim());
  }

  const search = trimOrNull(req.query.search);
  if (search) {
    const pattern = likePattern(search);
    conditions.push(
      `(p.ProjectTitle LIKE ? OR p.ProjectDescription LIKE ? OR p.ShowcaseDescription LIKE ?
        OR g.GroupName LIKE ? OR su.Name LIKE ?)`
    );
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const rows = await query(
    `${SHOWCASE_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.AcademicYear DESC, COALESCE(p.CompletedAt, p.CreatedAt) DESC`,
    params
  );

  const groupIds = rows.map((row) => row.groupId);
  const [memberNames, documentCounts] = await Promise.all([
    getMemberNames(groupIds),
    getDocumentCounts(groupIds),
  ]);

  res.json(rows.map((row) => toShowcaseItem(row, memberNames, documentCounts)));
}

/**
 * GET /api/showcase/years
 * The academic years that have showcased projects, newest first (for the year filter).
 */
export async function listShowcaseYears(req, res) {
  const rows = await query(
    `SELECT DISTINCT AcademicYear AS year FROM graduation_project
      WHERE Status IN (?) AND AcademicYear IS NOT NULL
      ORDER BY AcademicYear DESC`,
    [FINISHED_STATUSES]
  );
  res.json(rows.map((row) => row.year));
}

/**
 * GET /api/showcase/:projectId
 * One project with its members, supervisor, examiner, final documents and video flag.
 */
export async function getShowcaseItem(req, res) {
  const project = await getShowcaseProject(req.user, req.params.projectId);
  res.json(await buildShowcaseDetail(req.user, project.id));
}

/**
 * PUT /api/showcase/:projectId   multipart: video? (field "video"), showcaseDescription, academicYear?
 * FR-18: a student of the group adds or replaces the showcase video and description
 * once the project is Completed (or Archived). A new video replaces the old one.
 */
export async function updateShowcase(req, res) {
  const projectId = toInt(req.params.projectId, 'Project id');
  const project = await findProjectById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (project.groupId !== req.user.groupId) {
    throw new HttpError(403, 'Only the students of this project can update its showcase.');
  }
  if (!FINISHED_STATUSES.includes(project.status)) {
    throw new HttpError(400, 'You can add a showcase only after your project is marked as completed.');
  }

  const showcaseDescription = trimOrNull(req.body.showcaseDescription);
  if (!showcaseDescription) {
    throw new HttpError(400, 'Please write a short description of your project.', { field: 'showcaseDescription' });
  }
  checkMaxLength(showcaseDescription, MAX_SHOWCASE_TEXT, 'Showcase description');
  const academicYear = isBlank(req.body.academicYear)
    ? project.academicYear
    : readAcademicYear(req.body.academicYear);

  let oldStoredNames = [];
  if (req.file) {
    const video = getFileInfo(req.file);
    oldStoredNames = await withTransaction(async (conn) => {
      const oldNames = await removeShowcaseFiles(conn, project.groupId);
      await conn.query(
        `INSERT INTO \`file\` (GroupID, UploadedByUserID, FileName, FilePath, FileSize, MimeType, Category)
         VALUES (?, ?, ?, ?, ?, ?, 'Showcase')`,
        [project.groupId, req.user.id, video.fileName, video.filePath, video.fileSize, video.mimeType]
      );
      await conn.query(
        `UPDATE graduation_project SET ShowcaseDescription = ?, AcademicYear = ?, ShowcaseVideoPath = ?
          WHERE ProjectID = ?`,
        [showcaseDescription, academicYear, video.filePath, project.id]
      );
      return oldNames;
    });
    if (project.showcaseVideoPath) oldStoredNames.push(project.showcaseVideoPath);
  } else {
    await query('UPDATE graduation_project SET ShowcaseDescription = ?, AcademicYear = ? WHERE ProjectID = ?', [
      showcaseDescription,
      academicYear,
      project.id,
    ]);
  }

  // The old video is no longer used, so remove it from the disk (after the database commit)
  for (const name of oldStoredNames) {
    if (name !== req.file?.filename) await deleteStoredFile(name);
  }

  const supervisorIds = await getGroupUserIds(project.groupId, { students: false, supervisor: true });
  await notify(supervisorIds, {
    type: 'System',
    title: `${project.groupName} updated their project showcase`,
    message: req.file ? 'A new showcase video was uploaded.' : 'The showcase description was updated.',
    link: `/showcase?search=${encodeURIComponent(project.title)}`,
  });

  res.json(await buildShowcaseDetail(req.user, project.id));
}

/**
 * DELETE /api/showcase/:projectId/video   (Student of the group, Administrator)
 * Removes the showcase video (the description stays).
 */
export async function removeShowcaseVideo(req, res) {
  const projectId = toInt(req.params.projectId, 'Project id');
  const project = await findProjectById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (req.user.role === 'Student' && project.groupId !== req.user.groupId) {
    throw new HttpError(403, 'Only the students of this project can change its showcase.');
  }
  if (!project.showcaseVideoPath) throw new HttpError(404, 'This project has no showcase video.');

  const storedNames = await withTransaction(async (conn) => {
    const names = await removeShowcaseFiles(conn, project.groupId);
    await conn.query('UPDATE graduation_project SET ShowcaseVideoPath = NULL WHERE ProjectID = ?', [project.id]);
    return names;
  });
  for (const name of new Set([...storedNames, project.showcaseVideoPath])) await deleteStoredFile(name);

  res.json({ message: 'Showcase video removed' });
}

/**
 * GET /api/showcase/:projectId/video
 * Streams the showcase video. The page fetches it with the login token and plays it
 * from a blob: URL; sendFile supports seeking (range requests).
 */
export async function streamShowcaseVideo(req, res) {
  const project = await getShowcaseProject(req.user, req.params.projectId);
  if (!project.showcaseVideoPath || !storedFileExists(project.showcaseVideoPath)) {
    throw new HttpError(404, 'This project has no showcase video.');
  }
  res.sendFile(getUploadPath(project.showcaseVideoPath));
}

/**
 * GET /api/showcase/:projectId/documents/:fileId/download
 * FR-8 / FR-19: anyone can download the final documents (the newest version of each file)
 * of a finished project (for reference and comparison), even without access to that group.
 */
export async function downloadShowcaseDocument(req, res) {
  const project = await getShowcaseProject(req.user, req.params.projectId);
  const fileId = toInt(req.params.fileId, 'File id');

  // Only the final documents (the newest version of each file) are public, like the list
  const rows = await query(
    `SELECT f.FileName, f.FilePath FROM \`file\` f
      WHERE f.FileID = ? AND f.GroupID = ? AND f.Category = 'Document'
        AND f.Version = (SELECT MAX(f2.Version) FROM \`file\` f2
                          WHERE f2.GroupID = f.GroupID AND f2.Category = 'Document'
                            AND f2.FileName = f.FileName)`,
    [fileId, project.groupId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Document not found');
  if (!storedFileExists(rows[0].FilePath)) {
    throw new HttpError(404, 'The file could not be found on the server.');
  }

  res.download(getUploadPath(rows[0].FilePath), rows[0].FileName);
}
