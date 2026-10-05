// The password rule, checked in the browser for instant feedback.
// It is the same rule the backend enforces: at least 8 characters with at least one letter
// and one number. (The backend checks again, so this is only for a friendlier form.)

export const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and contain at least one letter and one number.';

// Each part of the rule, shown as a live checklist by <PasswordRules />
export const PASSWORD_CHECKS = [
  { id: 'length', label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { id: 'letter', label: 'At least one letter', test: (password) => /[A-Za-z]/.test(password) },
  { id: 'number', label: 'At least one number', test: (password) => /\d/.test(password) },
];

export function isStrongPassword(password) {
  return PASSWORD_CHECKS.every((check) => check.test(password || ''));
}

/**
 * Checks a "new password" + "confirm password" pair.
 * Returns an object of field errors, e.g. { confirm: 'The passwords do not match.' } ({} = all good).
 */
export function checkNewPassword(password, confirm) {
  const errors = {};
  if (!password) errors.password = 'Please enter a new password.';
  else if (!isStrongPassword(password)) errors.password = PASSWORD_RULE_MESSAGE;
  else if (password.length > 72) errors.password = 'Password must be at most 72 characters.';

  if (!confirm) errors.confirm = 'Please type the new password again.';
  else if (confirm !== password) errors.confirm = 'The passwords do not match.';
  return errors;
}

// Letters and digits that are easy to read aloud (no l/I/1 or O/0 look-alikes)
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Creates a random password that follows the rule (used by administrators).
 * crypto.getRandomValues gives secure random numbers; we try again in the rare case
 * that the result has no letter or no digit.
 */
export function generatePassword(length = 12) {
  let password = '';
  do {
    const numbers = crypto.getRandomValues(new Uint32Array(length));
    password = Array.from(numbers, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join('');
  } while (!isStrongPassword(password));
  return password;
}
