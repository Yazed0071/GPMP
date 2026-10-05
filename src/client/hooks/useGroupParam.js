// useGroupParam: keeps the selected group in the page address, e.g. /tasks?groupId=3.
// This lets pages link to each other ("open the tasks of this group") and keeps the
// choice when the page is refreshed.
//
// Usage:
//   const [groupId, setGroupId] = useGroupParam();   // groupId is a number or null
//   <GroupSelect value={groupId} onChange={setGroupId} />
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useGroupParam(paramName = 'groupId') {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(paramName);
  const groupId = raw && Number.isInteger(Number(raw)) ? Number(raw) : null;

  const setGroupId = useCallback(
    (newId) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          if (newId === null || newId === undefined || newId === '') next.delete(paramName);
          else next.set(paramName, String(newId));
          return next;
        },
        // replace: changing the group should not add a new "Back" step in the browser
        { replace: true }
      );
    },
    [paramName, setSearchParams]
  );

  return [groupId, setGroupId];
}
