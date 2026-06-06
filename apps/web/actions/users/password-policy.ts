/**
 * Password strength policy for admin-set passwords.
 *
 * Lives in its OWN module (NOT a `'use server'` file): server-action modules may
 * export only async functions, so the synchronous `isStrongPassword` predicate +
 * its constants cannot live in `create-user-with-password.ts`. The action and the
 * tests both import from here.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Deliberately conservative: a length floor plus character-class diversity. The
 * admin sets this password on the user's behalf, so it MUST NOT be trivially
 * guessable. Returns true when the password is acceptable.
 */
export function isStrongPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) return false;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  return classes >= 3;
}
