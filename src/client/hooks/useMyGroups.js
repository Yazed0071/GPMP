// useMyGroups: the groups the logged-in user can open (GET /api/meta/my-groups).
// Students get their own group, supervisors/examiners the groups they are assigned to,
// administrators get every group.
//
// Usage:
//   const { groups, loading, error, reload } = useMyGroups();
//   // groups = [{ id, name, projectId, projectTitle, projectStatus,
//   //             supervisorName, examinerName, memberCount }]
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from './useApi.js';

export function useMyGroups() {
  const { user } = useAuth();
  // Reloaded when another user logs in, or when a student's group changes
  const { data, loading, error, reload } = useApi(
    () => (user ? api.get('/meta/my-groups') : Promise.resolve([])),
    [user?.id, user?.groupId]
  );
  return { groups: data || [], loading, error, reload };
}
