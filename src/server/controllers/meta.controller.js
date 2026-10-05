// Small shared lookups that many pages need.

import { query } from '../config/db.js';
import { getAccessibleGroupIds } from '../services/access.js';

/**
 * GET /api/meta/my-groups
 * The groups the logged-in user can access (all groups for administrators), ordered by name.
 * Used by the frontend group picker (GroupSelect / useMyGroups).
 */
export async function getMyGroups(req, res) {
  const groupIds = await getAccessibleGroupIds(req.user);

  // A user without any group (e.g. a student not yet placed in a group) gets an empty list
  if (groupIds !== null && groupIds.length === 0) {
    res.json([]);
    return;
  }

  const onlyTheseGroups = groupIds === null ? '' : 'WHERE g.GroupID IN (?)';
  const rows = await query(
    `SELECT g.GroupID AS id, g.GroupName AS name,
            p.ProjectID AS projectId, p.ProjectTitle AS projectTitle, p.Status AS projectStatus,
            su.Name AS supervisorName, eu.Name AS examinerName,
            (SELECT COUNT(*) FROM student s WHERE s.GroupID = g.GroupID) AS memberCount
       FROM project_group g
       LEFT JOIN graduation_project p ON p.GroupID = g.GroupID
       LEFT JOIN supervisor sp ON sp.SupervisorID = g.SupervisorID
       LEFT JOIN \`user\` su   ON su.UserID = sp.UserID
       LEFT JOIN examiner ex   ON ex.ExaminerID = g.ExaminerID
       LEFT JOIN \`user\` eu   ON eu.UserID = ex.UserID
       ${onlyTheseGroups}
      ORDER BY g.GroupName`,
    groupIds === null ? [] : [groupIds]
  );

  res.json(rows);
}
