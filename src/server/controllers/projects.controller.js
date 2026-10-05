// Graduation projects (FR-3 create and manage projects, FR-4 project status, FR-8 archive).
// Also exports small project helpers that the groups, proposals and showcase controllers
// reuse, so the project rules are written in one place only.

import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, toInt, oneOf, isBlank, checkMaxLength, trimOrNull } from '../utils/validate.js';
import { assertGroupAccess, getGroupUserIds } from '../services/access.js';
import { notify } from '../services/notify.js';

// The values allowed by the CHECK constraint on graduation_project.Status
export const PROJECT_STATUSES = ['Proposed', 'In Progress', 'Completed', 'Archived'];

// Projects in these statuses are finished and appear in the showcase (FR-18, FR-19)
export const FINISHED_STATUSES = ['Completed', 'Archived'];

// While a proposal has one of these statuses, the group may not submit another one
export const OPEN_PROPOSAL_STATUSES = ['Pending Supervisor', 'Pending Examiner', 'Approved'];

// The supervisors can only move a project between these two statuses (the admin can set any)
const SUPERVISOR_STATUSES = ['In Progress', 'Completed'];

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

// Columns of one project, renamed to camelCase. showcaseVideoPath stays on the server only.
const PROJECT_SELECT = `
  SELECT p.ProjectID AS id, p.GroupID AS groupId, g.GroupName AS groupName,
         p.ProjectTitle AS title, p.ProjectDescription AS description, p.Status AS status,
         p.AcademicYear AS academicYear, p.ShowcaseDescription AS showcaseDescription,
         p.ShowcaseVideoPath AS showcaseVideoPath, p.CompletedAt AS completedAt,
         p.ArchivedAt AS archivedAt, p.CreatedAt AS createdAt
    FROM graduation_project p
    JOIN project_group g ON g.GroupID = p.GroupID`;

// ---------------------------------------------------------------------
// Helpers (the exported ones are also used by other controllers)
// ---------------------------------------------------------------------

/**
 * Turns a project row into the API shape. The stored video file name is never sent;
 * the client only needs to know whether a video exists (hasVideo).
 */
export function toProject(row) {
  if (!row) return null;
  const { showcaseVideoPath, ...project } = row;
  return { ...project, hasVideo: Boolean(showcaseVideoPath) };
}

// Returns the project row (including showcaseVideoPath) or null
export async function findProjectById(projectId) {
  const rows = await query(`${PROJECT_SELECT} WHERE p.ProjectID = ?`, [projectId]);
  return rows[0] || null;
}

// Returns the project row of a group (a group has at most one project) or null
export async function findProjectByGroupId(groupId) {
  const rows = await query(`${PROJECT_SELECT} WHERE p.GroupID = ?`, [groupId]);
  return rows[0] || null;
}

/**
 * Loads a project by the id in the URL and checks the user may access its group.
 * Throws 404 when it does not exist and 403 when the user is not allowed.
 */
async function getProjectForUser(user, idParam) {
  const projectId = toInt(idParam, 'Project id');
  const project = await findProjectById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  await assertGroupAccess(user, project.groupId);
  return project;
}

// Returns the newest proposal of the project that is still under review or approved, or null
async function getOpenProposal(projectId) {
  const rows = await query(
    `SELECT ProposalID AS id, Status AS status FROM proposal
      WHERE ProjectID = ? AND Status IN (?)
      ORDER BY ProposalTime DESC, ProposalID DESC LIMIT 1`,
    [projectId, OPEN_PROPOSAL_STATUSES]
  );
  return rows[0] || null;
}

// The academic year starts in August: September 2026 -> "2026-2027", March 2027 -> "2026-2027"
function currentAcademicYear(date = new Date()) {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/**
 * Checks an academic year such as "2026-2027" (the second year must follow the first).
 * Returns the trimmed value or throws 400.
 */
export function readAcademicYear(value) {
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{4})$/.exec(text);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new HttpError(400, 'Academic year must look like 2026-2027', { field: 'academicYear' });
  }
  return text;
}

/**
 * Saves a new project status and keeps the dates in step with it:
 *   Completed -> CompletedAt is set (FR-18: the showcase opens)
 *   Archived  -> ArchivedAt is set (FR-8), CompletedAt is kept or set
 *   Proposed / In Progress -> both dates are cleared (the project was re-opened)
 */
async function saveProjectStatus(projectId, status) {
  let sql;
  if (status === 'Completed') {
    sql = `UPDATE graduation_project
              SET Status = ?, CompletedAt = COALESCE(CompletedAt, NOW()), ArchivedAt = NULL
            WHERE ProjectID = ?`;
  } else if (status === 'Archived') {
    sql = `UPDATE graduation_project
              SET Status = ?, CompletedAt = COALESCE(CompletedAt, NOW()), ArchivedAt = NOW()
            WHERE ProjectID = ?`;
  } else {
    sql = `UPDATE graduation_project
              SET Status = ?, CompletedAt = NULL, ArchivedAt = NULL
            WHERE ProjectID = ?`;
  }
  await query(sql, [status, projectId]);
}

// Reads and checks the title / description fields sent by the project forms
function readProjectFields(body) {
  requireFields(body, { title: 'Project title', description: 'Project description' });
  const title = String(body.title).trim();
  const description = String(body.description).trim();
  checkMaxLength(title, MAX_TITLE, 'Project title');
  checkMaxLength(description, MAX_DESCRIPTION, 'Project description');
  return { title, description };
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

/**
 * GET /api/projects/:id
 * One project (any user who can access its group).
 */
export async function getProject(req, res) {
  const project = await getProjectForUser(req.user, req.params.id);
  res.json(toProject(project));
}

/**
 * POST /api/projects  { title, description, academicYear? }   (Student)
 * FR-3: a student creates the graduation project of their group. One project per group.
 */
export async function createProject(req, res) {
  const groupId = req.user.groupId;
  if (!groupId) {
    throw new HttpError(400, 'You are not in a group yet. The administrator must add you to a group first.');
  }

  const { title, description } = readProjectFields(req.body);
  const academicYear = isBlank(req.body.academicYear)
    ? currentAcademicYear()
    : readAcademicYear(req.body.academicYear);

  if (await findProjectByGroupId(groupId)) {
    throw new HttpError(409, 'Your group already has a project.');
  }

  // GroupID is UNIQUE, so even two clicks at the same moment cannot create two projects
  const result = await query(
    `INSERT INTO graduation_project (GroupID, ProjectTitle, ProjectDescription, AcademicYear, Status)
     VALUES (?, ?, ?, ?, 'Proposed')`,
    [groupId, title, description, academicYear]
  );

  // Tell the teammates and the supervisor (if the group already has one)
  await notifyProjectChange(groupId, req.user.id, {
    title: `New project created: "${title}"`,
    message: `${req.user.name} created the graduation project of the group.`,
  });

  const project = await findProjectById(result.insertId);
  res.status(201).json(toProject(project));
}

/**
 * PUT /api/projects/:id  { title, description, academicYear? }   (Student, Supervisor, Administrator)
 * FR-3: students edit their project only while no proposal is under review or approved.
 * The group's supervisor and the administrator may always edit it.
 */
export async function updateProject(req, res) {
  const project = await getProjectForUser(req.user, req.params.id);

  if (req.user.role === 'Student') {
    const openProposal = await getOpenProposal(project.id);
    if (openProposal) {
      const message =
        openProposal.status === 'Approved'
          ? 'Your proposal is approved, so only your supervisor can change the project details now.'
          : 'You cannot edit the project while its proposal is being reviewed.';
      throw new HttpError(409, message);
    }
  }

  const { title, description } = readProjectFields(req.body);
  const academicYear = isBlank(req.body.academicYear)
    ? project.academicYear
    : readAcademicYear(req.body.academicYear);

  await query(
    `UPDATE graduation_project SET ProjectTitle = ?, ProjectDescription = ?, AcademicYear = ?
      WHERE ProjectID = ?`,
    [title, description, academicYear, project.id]
  );

  res.json(toProject(await findProjectById(project.id)));
}

/**
 * PATCH /api/projects/:id/status  { status }   (Supervisor, Administrator)
 * FR-4: the group's supervisor marks the project 'In Progress' or 'Completed';
 * the administrator may set any status.
 */
export async function updateProjectStatus(req, res) {
  const status = oneOf(req.body.status, PROJECT_STATUSES, 'Status');
  const project = await getProjectForUser(req.user, req.params.id);

  if (req.user.role === 'Supervisor') {
    if (!SUPERVISOR_STATUSES.includes(status)) {
      throw new HttpError(403, 'Supervisors can only mark a project as In Progress or Completed.');
    }
    if (project.status === 'Archived') {
      throw new HttpError(400, 'This project is archived. Only the administrator can change it.');
    }
    if (project.status === 'Proposed') {
      throw new HttpError(400, 'The proposal must be approved before the project status can be changed.');
    }
  }

  // Nothing to do when the status does not change
  if (status === project.status) {
    res.json(toProject(project));
    return;
  }

  await saveProjectStatus(project.id, status);
  await notifyStatusChange(req.user, project, status);

  res.json(toProject(await findProjectById(project.id)));
}

/**
 * PATCH /api/projects/:id/archive   (Supervisor, Administrator)
 * FR-8: a completed project is archived together with its documents and showcase.
 */
export async function archiveProject(req, res) {
  const project = await getProjectForUser(req.user, req.params.id);
  if (project.status === 'Archived') {
    throw new HttpError(400, 'This project is already archived.');
  }
  if (project.status !== 'Completed') {
    throw new HttpError(400, 'Only completed projects can be archived.');
  }

  await saveProjectStatus(project.id, 'Archived');
  await notifyStatusChange(req.user, project, 'Archived');

  res.json(toProject(await findProjectById(project.id)));
}

// Tells the students (and the supervisor, when someone else made the change) about a new status
async function notifyStatusChange(user, project, status) {
  const messages = {
    Proposed: 'The project was set back to Proposed.',
    'In Progress': 'The project is now in progress.',
    Completed: 'Congratulations! You can now add a showcase video and description to your project.',
    Archived: 'The project and its final documents are now kept in the projects archive.',
  };
  await notifyProjectChange(project.groupId, user.id, {
    title: `Project "${project.title}" is now ${status}`,
    message: messages[status],
  });
}

/**
 * Notifies a group's students and its supervisor, leaving out the person who made the change.
 * Students get a link to their My Project page; the supervisor cannot open that page,
 * so they get a link to the group's page instead.
 */
async function notifyProjectChange(groupId, actorUserId, { title, message }) {
  const notActor = (ids) => ids.filter((id) => id !== actorUserId);
  const studentIds = await getGroupUserIds(groupId, { students: true, supervisor: false });
  const supervisorIds = await getGroupUserIds(groupId, { students: false, supervisor: true });
  await notify(notActor(studentIds), { type: 'System', title, message, link: '/project' });
  await notify(notActor(supervisorIds), { type: 'System', title, message, link: `/groups/${groupId}` });
}

// ---------------------------------------------------------------------
// UC16: "search the database to see if there are any similar projects"
// ---------------------------------------------------------------------

// Common words that say nothing about a project's topic
const STOP_WORDS = new Set([
  'about', 'after', 'also', 'based', 'between', 'from', 'have', 'into', 'more', 'most', 'other',
  'that', 'their', 'them', 'there', 'these', 'they', 'this', 'using', 'which', 'will', 'with',
  'your', 'project', 'system', 'application', 'platform', 'students', 'student', 'university',
]);

// "Smart Campus Navigation App" -> ['smart', 'campus', 'navigation'] (at most 6 words)
function extractKeywords(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 6);
}

/**
 * GET /api/projects/similar?projectId=3   or   ?q=campus navigation   (Supervisor, Examiner, Administrator)
 * Finds other projects (from every year) whose title or description share keywords with
 * the given project's title (or with the ?q= words the reviewer typed), so reviewers can spot
 * duplicate ideas (UC16). With both, the q words are used and the project itself is left out.
 * Returns the 5 best matches.
 */
export async function findSimilarProjects(req, res) {
  let text = req.query.q;
  let excludeId = 0;

  if (!isBlank(req.query.projectId)) {
    const project = await getProjectForUser(req.user, req.query.projectId);
    if (isBlank(text)) text = project.title; // no search words: use the project's own title
    excludeId = project.id;
  }

  const keywords = extractKeywords(trimOrNull(text));
  if (keywords.length === 0) {
    res.json([]);
    return;
  }

  // One "title LIKE ? OR description LIKE ?" pair per keyword
  const conditions = keywords.map(() => '(p.ProjectTitle LIKE ? OR p.ProjectDescription LIKE ?)');
  const params = keywords.flatMap((word) => [`%${word}%`, `%${word}%`]);

  const rows = await query(
    `SELECT p.ProjectID AS id, p.ProjectTitle AS title, p.ProjectDescription AS description,
            p.Status AS status, p.AcademicYear AS academicYear, g.GroupName AS groupName
       FROM graduation_project p
       JOIN project_group g ON g.GroupID = p.GroupID
      WHERE p.ProjectID <> ? AND (${conditions.join(' OR ')})`,
    [excludeId, ...params]
  );

  // Score = how many keywords appear in the title or description; best matches first
  const results = rows
    .map((row) => {
      const haystack = `${row.title} ${row.description || ''}`.toLowerCase();
      const matchedWords = keywords.filter((word) => haystack.includes(word));
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        academicYear: row.academicYear,
        groupName: row.groupName,
        matchedWords,
      };
    })
    .sort((a, b) => b.matchedWords.length - a.matchedWords.length)
    .slice(0, 5);

  res.json(results);
}
