// Learning resources page (FR-17): tutorials, guides and recommended tools for students.
// Everyone can read the list. Supervisors and administrators add resources; administrators can
// edit or delete any resource, supervisors only the ones they added.

import { query, likePattern } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { requireFields, isBlank, oneOf, toInt, trimOrNull, checkMaxLength } from '../utils/validate.js';

// Must match the CHECK constraint on resource.Category in schema.sql
export const RESOURCE_CATEGORIES = ['Tutorial', 'Tool', 'Framework', 'Library', 'Guide'];

const RESOURCE_SELECT = `
  SELECT r.ResourceID AS id, r.Title AS title, r.Description AS description, r.Url AS url,
         r.Category AS category, r.CreatedAt AS createdAt,
         r.CreatedByUserID AS createdById, u.Name AS createdByName
    FROM resource r
    LEFT JOIN \`user\` u ON u.UserID = r.CreatedByUserID`;

function canManage(user, createdById) {
  return user.role === 'Administrator' || (user.role === 'Supervisor' && createdById === user.id);
}

// Database row -> API shape
function formatResource(row, user) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    category: row.category,
    createdAt: row.createdAt,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName } : null,
    canEdit: canManage(user, row.createdById),
  };
}

async function loadResource(id, user) {
  const rows = await query(`${RESOURCE_SELECT} WHERE r.ResourceID = ?`, [id]);
  return rows.length ? formatResource(rows[0], user) : null;
}

/**
 * Checks and cleans the form values of a resource.
 * Returns { title, description, url, category }.
 */
function readResourceInput(body) {
  requireFields(body, { title: 'Title', url: 'Link', category: 'Category' });

  const title = String(body.title).trim();
  const url = String(body.url).trim();
  const description = trimOrNull(body.description);
  const category = oneOf(body.category, RESOURCE_CATEGORIES, 'Category');

  checkMaxLength(title, 200, 'Title');
  checkMaxLength(url, 500, 'Link');
  checkMaxLength(description, 5000, 'Description');

  // Only real web links, so a resource can never run a script (e.g. "javascript:...")
  if (!/^https?:\/\//i.test(url)) {
    throw new HttpError(400, 'The link must start with http:// or https://', { field: 'url' });
  }
  try {
    new URL(url);
  } catch {
    throw new HttpError(400, 'Please enter a valid link', { field: 'url' });
  }

  return { title, description, url, category };
}

// Loads a resource the user may change, or throws 404 / 403
async function findManageableResource(user, id) {
  const rows = await query('SELECT ResourceID, CreatedByUserID FROM resource WHERE ResourceID = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Resource not found');
  if (!canManage(user, rows[0].CreatedByUserID)) {
    throw new HttpError(403, 'You can only change the resources you added.');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/resources?category=&search=
 * All resources (newest first), optionally only one category or matching a search text.
 */
export async function listResources(req, res) {
  const conditions = [];
  const params = [];

  if (!isBlank(req.query.category)) {
    conditions.push('r.Category = ?');
    params.push(oneOf(req.query.category, RESOURCE_CATEGORIES, 'Category'));
  }
  if (!isBlank(req.query.search)) {
    const pattern = likePattern(String(req.query.search).trim());
    conditions.push('(r.Title LIKE ? OR r.Description LIKE ?)');
    params.push(pattern, pattern);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(`${RESOURCE_SELECT} ${where} ORDER BY r.CreatedAt DESC, r.ResourceID DESC`, params);
  res.json(rows.map((row) => formatResource(row, req.user)));
}

// POST /api/resources { title, description?, url, category } -> 201 the resource
export async function createResource(req, res) {
  const values = readResourceInput(req.body);
  const result = await query(
    'INSERT INTO resource (Title, Description, Url, Category, CreatedByUserID) VALUES (?, ?, ?, ?, ?)',
    [values.title, values.description, values.url, values.category, req.user.id]
  );
  res.status(201).json(await loadResource(result.insertId, req.user));
}

// PUT /api/resources/:id { title, description?, url, category } -> the updated resource
export async function updateResource(req, res) {
  const id = toInt(req.params.id, 'Resource id');
  await findManageableResource(req.user, id);
  const values = readResourceInput(req.body);

  await query('UPDATE resource SET Title = ?, Description = ?, Url = ?, Category = ? WHERE ResourceID = ?', [
    values.title,
    values.description,
    values.url,
    values.category,
    id,
  ]);
  res.json(await loadResource(id, req.user));
}

// DELETE /api/resources/:id -> { message }
export async function deleteResource(req, res) {
  const id = toInt(req.params.id, 'Resource id');
  await findManageableResource(req.user, id);

  await query('DELETE FROM resource WHERE ResourceID = ?', [id]);
  res.json({ message: 'Resource deleted' });
}
