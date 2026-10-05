// useBlobUrl: loads a PROTECTED file (image, video, PDF) and returns a temporary local URL
// that <img>, <video> or <iframe> can use. Needed because uploaded files are only served
// through authenticated API endpoints, and <video src="/api/..."> cannot send the login token.
//
// Usage:
//   const { url, loading, error } = useBlobUrl(showcase ? `/showcase/${id}/video` : null);
//   {url && <video src={url} controls />}
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function useBlobUrl(path) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setLoading(false);
      return;
    }
    let objectUrl = null;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .download(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Free the memory used by the file when the path changes or the component unmounts
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, loading, error };
}
