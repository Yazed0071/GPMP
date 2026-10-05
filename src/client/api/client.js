// API client: the ONE place that talks to the backend over HTTP.
// Every page calls these helpers instead of using fetch() directly, so the login token,
// JSON conversion and error handling work the same way everywhere.
//
// Examples:
//   const tasks = await api.get('/tasks', { groupId: 3 });
//   const task  = await api.post('/tasks', { title: 'Write chapter 1' });
//   await api.upload('/files', formData);
//   await downloadFile('/files/7/download', 'report.pdf');

const TOKEN_KEY = 'gpmp_token';
const API_BASE = '/api';

// ----- Token helpers (the login token is kept in the browser's localStorage) -----

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage can be blocked (e.g. private mode); the user just has to log in again later
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// ----- Error type thrown by every API call -----

// ApiError carries the server's friendly message so pages can show it directly:
//   try { ... } catch (err) { toast.error(err.message); }
export class ApiError extends Error {
  constructor(message, status = 0, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // HTTP status code (0 = the server could not be reached)
    this.details = details; // optional extra info from the server (e.g. field errors)
  }
}

// Messages used when the server did not send its own message
const DEFAULT_MESSAGES = {
  0: 'Cannot reach the server. Please check your connection and try again.',
  400: 'Please check the information you entered.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do this.',
  404: 'The requested item was not found.',
  409: 'This item already exists.',
  413: 'The file is too large.',
  423: 'This account is temporarily locked.',
  429: 'Too many requests. Please wait a moment and try again.',
};
const FALLBACK_MESSAGE = 'Something went wrong on the server. Please try again.';

// Builds "/api/tasks?groupId=3". Empty values (undefined, null, '') are skipped.
function buildUrl(path, params) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        search.append(key, String(value));
      }
    }
  }
  const query = search.toString();
  return `${API_BASE}${cleanPath}${query ? `?${query}` : ''}`;
}

// Tries to read the { error: { message, details } } body the backend sends on failures
async function readError(response) {
  let message = DEFAULT_MESSAGES[response.status] || FALLBACK_MESSAGE;
  let details;
  try {
    const data = await response.json();
    if (data?.error?.message) message = data.error.message;
    details = data?.error?.details;
  } catch {
    // The body was not JSON (e.g. the backend is down); keep the default message
  }
  return new ApiError(message, response.status, details);
}

// Sends one request. `body` can be a plain object (sent as JSON) or FormData (file uploads).
async function request(method, path, { params, body, asBlob = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart Content-Type itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(buildUrl(path, params), { method, headers, body: payload });
  } catch {
    throw new ApiError(DEFAULT_MESSAGES[0], 0);
  }

  if (!response.ok) {
    // A 401 on a request that carried a token means the session expired or the account
    // was deactivated: forget the token and tell AuthContext to log out.
    if (response.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event('gpmp:unauthorized'));
    }
    throw await readError(response);
  }

  if (asBlob) return response;
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Reads the file name from a "Content-Disposition: attachment; filename=..." header
function fileNameFromResponse(response) {
  const header = response.headers.get('Content-Disposition') || '';
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1] : null;
}

// ----- The api object used by every page -----

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),

  // Sends a FormData object (files + text fields). Use method 'PUT' to replace a file.
  upload: (path, formData, method = 'POST') => request(method, path, { body: formData }),

  // Downloads a protected file and returns it as a Blob (e.g. to preview an image or video)
  download: async (path, params) => {
    const response = await request('GET', path, { params, asBlob: true });
    return response.blob();
  },
};

// Downloads a protected file and saves it on the user's computer.
// `filename` is optional: when missing, the name sent by the server is used.
export async function downloadFile(path, filename) {
  const response = await request('GET', path, { asBlob: true });
  const blob = await response.blob();
  const name = filename || fileNameFromResponse(response) || 'download';

  // Create a temporary link to the file in memory, click it, then clean up
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
