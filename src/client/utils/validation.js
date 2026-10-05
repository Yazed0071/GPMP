// Small form checks shared by several pages, so the same rule is used everywhere.

// A simple email check: something@something.something (the backend checks again)
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A link must start with http:// or https:// (same rule as the backend)
export function isWebLink(text) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}
