// useApi: loads data from the backend and tracks loading / error state for a page.
//
// Usage:
//   const { data: tasks, loading, error, reload, setData } =
//     useApi(() => api.get('/tasks', { groupId }), [groupId]);
//
//   if (loading) return <Loading />;
//   if (error) return <ErrorMessage error={error} onRetry={reload} />;
//
// - The fetcher runs again whenever a value in `deps` changes.
// - reload() fetches again. If data is already shown it refreshes quietly (no spinner),
//   so the page does not flash after every action.
// - setData lets you update the shown data yourself (e.g. add a new chat message).
import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refs keep the newest values without re-creating functions
  const fetcherRef = useRef(fetcher);
  const dataRef = useRef(null);
  const lastRequest = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const run = useCallback(async (showLoading) => {
    // Only the newest request may update the state (older, slower answers are ignored)
    const requestId = ++lastRequest.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (requestId === lastRequest.current) setData(result);
    } catch (err) {
      if (requestId === lastRequest.current) setError(err);
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }, []);

  // Load on first render and whenever a dependency changes
  useEffect(() => {
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Shows the spinner only when there is nothing on screen yet
  const reload = useCallback(() => run(dataRef.current === null), [run]);

  return { data, loading, error, reload, setData };
}
