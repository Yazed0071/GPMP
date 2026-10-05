// Examiners list, used when the administrator assigns an examiner to a group (UC10, FR-7).

import { query } from '../config/db.js';

/**
 * GET /api/examiners   (Administrator, Supervisor)
 * Active examiners with the number of groups they already examine.
 */
export async function listExaminers(req, res) {
  const rows = await query(
    `SELECT ex.ExaminerID AS id, ex.UserID AS userId, u.Name AS name, u.Email AS email,
            ex.ExaminerDepartment AS department,
            (SELECT COUNT(*) FROM project_group g WHERE g.ExaminerID = ex.ExaminerID) AS groupCount
       FROM examiner ex
       JOIN \`user\` u ON u.UserID = ex.UserID
      WHERE u.IsActive = 1
      ORDER BY u.Name`
  );
  res.json(rows);
}
