import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import type pg from 'pg';

/**
 * [UNIVERSAL] Password policy error reasons.
 * Used by validateNewPassword to report specific validation failures.
 *
 * 'whitespace_only': password consists entirely of whitespace (NIST SP 800-63B §5.1.1.2 SHOULD).
 */
export type PasswordPolicyError = 'too_short' | 'pwned' | 'reused' | 'too_common' | 'whitespace_only';

/**
 * [UNIVERSAL] Result of password validation.
 * On success: { ok: true }
 * On failure: { ok: false, reasons: PasswordPolicyError[] }
 */
export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; reasons: PasswordPolicyError[] };

/**
 * [UNIVERSAL] Options for validateNewPassword.
 */
export interface ValidateNewPasswordOpts {
  userId: string;
  orgId: string;
  newPassword: string;
  pool: pg.Pool;
}

// ---------------------------------------------------------------------------
// Bundled common-password list (top ~200 most common passwords from NIST data).
// This list is intentionally small and offline. The HIBP check catches the rest.
// ---------------------------------------------------------------------------
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password123',
  'password1234',
  'password12345',
  'password123456',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '12345678901',
  '123456789012',
  '1234567890123',
  '12345',
  '1234',
  '123',
  '111111',
  '1111111',
  '11111111',
  '000000',
  '0000000',
  '00000000',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'qwertyuiop123',
  'asdfghjkl',
  'asdfgh',
  'zxcvbn',
  'zxcvbnm',
  'abc123',
  'abc1234',
  'abcdefg',
  'abcdefgh',
  'abcdefghi',
  'abcdefghij',
  'iloveyou',
  'iloveyou1',
  'monkey',
  'monkey1',
  'dragon',
  'dragon1',
  'master',
  'master1',
  'letmein',
  'letmein1',
  'welcome',
  'welcome1',
  'login',
  'login1',
  'sunshine',
  'sunshine1',
  'princess',
  'princess1',
  'football',
  'football1',
  'baseball',
  'baseball1',
  'superman',
  'superman1',
  'batman',
  'batman1',
  'shadow',
  'shadow1',
  'michael',
  'michael1',
  'jessica',
  'jessica1',
  'charlie',
  'charlie1',
  'donald',
  'donald1',
  'access',
  'access1',
  'hello',
  'hello123',
  'trustno1',
  'admin',
  'admin1',
  'admin123',
  'pass',
  'pass1',
  'pass12',
  'pass123',
  'pass1234',
  'test',
  'test1',
  'test12',
  'test123',
  'test1234',
  'guest',
  'guest1',
  'guest123',
  'user',
  'user1',
  'user123',
  'root',
  'root1',
  'root123',
  '696969',
  '123321',
  '654321',
  '987654321',
  '000000000000',
  '111111111111',
  '222222222222',
  '333333333333',
  '444444444444',
  '555555555555',
  '666666666666',
  '777777777777',
  '888888888888',
  '999999999999',
  'aaaaaaaaaaaa',
  'bbbbbbbbbbbb',
  'cccccccccccc',
  'dddddddddddd',
  'eeeeeeeeeeee',
  'ffffffffffff',
  'gggggggggggg',
  'hhhhhhhhhhhh',
  'iiiiiiiiiiii',
  'jjjjjjjjjjjj',
  'kkkkkkkkkkkk',
  'llllllllllll',
  'mmmmmmmmmmmm',
  'nnnnnnnnnnnn',
  'oooooooooooo',
  'pppppppppppp',
  'qqqqqqqqqqqq',
  'rrrrrrrrrrrr',
  'ssssssssssss',
  'tttttttttttt',
  'uuuuuuuuuuuu',
  'vvvvvvvvvvvv',
  'wwwwwwwwwwww',
  'xxxxxxxxxxxx',
  'yyyyyyyyyyyy',
  'zzzzzzzzzzzz',
  'passwordpassword',
  'monkey123',
  'ninja',
  'ninja1',
  'wizard',
  'hunter',
  'hunter2',
  'ferrari',
  'pokemon',
  'starwars',
  'starwars1',
  'flower',
  'flower1',
  'whatever',
  'ranger',
  'ranger1',
  'cowboy',
  'cowboy1',
  'summer',
  'summer1',
  'winter',
  'winter1',
  'autumn',
  'spring',
  'january',
  'february',
  'march',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

// ---------------------------------------------------------------------------
// HIBP k-anonymity check
// ---------------------------------------------------------------------------

/** Injectable HIBP lookup function signature. */
export type HibpLookup = (prefix: string) => Promise<string>;

const HIBP_TIMEOUT_MS = 2000;

/**
 * Default HIBP lookup using global fetch.
 * Sends only the first 5 hex chars of the SHA-1 hash (k-anonymity).
 */
async function defaultHibpLookup(prefix: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { signal: controller.signal },
    );
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks the password against the HIBP k-anonymity API.
 * Returns true if the password has been pwned, false otherwise.
 * Fails-open on timeout or network error (unless HIBP_FAIL_HARD=true).
 */
async function checkHibp(
  password: string,
  hibp?: HibpLookup,
): Promise<boolean> {
  if (process.env.HIBP_DISABLED === 'true') {
    return false;
  }

  // Keep lowercase for the URL prefix (API is case-insensitive; tests verify lowercase)
  const sha1Lower = createHash('sha1').update(password).digest('hex');
  const prefix = sha1Lower.substring(0, 5);
  // Use uppercase for suffix comparison (HIBP response is uppercase)
  const sha1Upper = sha1Lower.toUpperCase();
  const suffix = sha1Upper.substring(5);

  const lookup = hibp ?? defaultHibpLookup;

  try {
    const responseText = await lookup(prefix);
    const lines = responseText.split('\n');
    for (const line of lines) {
      const [lineSuffix] = line.trim().split(':');
      if (lineSuffix && lineSuffix.toUpperCase() === suffix.toUpperCase()) {
        return true;
      }
    }
    return false;
  } catch (_err) {
    // Fail-open on timeout/network error unless HIBP_FAIL_HARD is set
    if (process.env.HIBP_FAIL_HARD === 'true') {
      throw _err;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Password history check
// ---------------------------------------------------------------------------

/**
 * Queries the last 5 password hashes for the user and checks if the new
 * password matches any of them via argon2.verify().
 * Returns true if the password was reused, false otherwise.
 * Fails-open if the DB query fails (e.g., table not yet created).
 */
async function checkPasswordHistory(
  password: string,
  userId: string,
  pool: pg.Pool,
): Promise<boolean> {
  let rows: Array<{ password_hash: string }>;
  try {
    const result = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId],
    );
    rows = result.rows;
  } catch (_err) {
    // Fail-open: table may not exist yet or other transient error
    return false;
  }

  for (const row of rows) {
    try {
      const matches = await argon2.verify(row.password_hash, password);
      if (matches) {
        return true;
      }
    } catch (_err) {
      // Invalid hash format or other argon2 error — treat as no match
      continue;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for validateNewPassword — extended to support injectable HIBP lookup.
 */
export interface ValidateNewPasswordFullOpts extends ValidateNewPasswordOpts {
  /** Optional injectable HIBP lookup function (for testing). */
  hibp?: HibpLookup;
}

/**
 * [UNIVERSAL] Validates a new password against NIST SP 800-63B policy.
 *
 * Checks (all are run; all failures are collected):
 * 1. Minimum 12 characters (too_short)
 * 2. Not a common/weak password (too_common)
 * 3. Not breached via HIBP k-anonymity check (pwned)
 * 4. Not in user's last 5 password history (reused)
 *
 * HIBP k-anonymity protocol:
 * - SHA1 hash the password
 * - Send first 5 hex chars to https://api.pwnedpasswords.com/range/{prefix}
 * - Scan response for remaining 35 chars
 * - Honor process.env.HIBP_DISABLED=true for offline testing
 *
 * On HIBP timeout (2s): fail-open (soft warning) unless process.env.HIBP_FAIL_HARD=true
 *
 * @returns { ok: true } if password passes all checks
 * @returns { ok: false, reasons: [...] } if one or more checks fail
 */
export async function validateNewPassword(
  opts: ValidateNewPasswordFullOpts,
): Promise<PasswordValidationResult> {
  const { userId, newPassword, pool } = opts;
  const hibp = opts.hibp;

  const reasons: PasswordPolicyError[] = [];

  // Check 1: Minimum length (NIST SP 800-63B §5.1.1)
  if (newPassword.length < 12) {
    reasons.push('too_short');
    // Return early — no point running other checks on very short passwords
    // (also avoids noisy argon2/HIBP calls on clearly invalid input)
    return { ok: false, reasons };
  }

  // Check 1b: Whitespace-only guard (NIST SP 800-63B §5.1.1.2 SHOULD).
  // A password of 12+ spaces passes the length check but provides no entropy.
  if (newPassword.trim().length === 0) {
    reasons.push('whitespace_only');
    return { ok: false, reasons };
  }

  // Check 2: Common password list (offline, fast)
  if (COMMON_PASSWORDS.has(newPassword.toLowerCase())) {
    reasons.push('too_common');
  }

  // Check 3: HIBP k-anonymity (network, with 2s timeout, fail-open)
  const isPwned = await checkHibp(newPassword, hibp);
  if (isPwned) {
    reasons.push('pwned');
  }

  // Check 4: Password history (last 5, argon2 verify)
  const isReused = await checkPasswordHistory(newPassword, userId, pool);
  if (isReused) {
    reasons.push('reused');
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true };
}

/**
 * [UNIVERSAL] Helper to record a password hash in the password_history table.
 * Called by T-011 sign-up/change-password flow after successful validation.
 *
 * Inserts a new row and trims older rows beyond the most recent 5 per user.
 *
 * @param userId User UUID
 * @param hash Argon2id hash (pre-hashed password, never plaintext)
 * @param pool Database connection pool
 */
export async function recordPasswordHistory(
  userId: string,
  hash: string,
  pool: pg.Pool,
): Promise<void> {
  // Insert new history entry
  await pool.query(
    `INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`,
    [userId, hash],
  );

  // Trim to last 5 per user (delete oldest beyond 5)
  await pool.query(
    `DELETE FROM password_history
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM password_history
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 5
        )`,
    [userId],
  );
}
