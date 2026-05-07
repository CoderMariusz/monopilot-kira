/**
 * T-016 — Verify-PIN step-up auth
 *
 * Exports:
 *   setPin(userId, pin): Promise<void>
 *   verifyPin(userId, pin): Promise<true | false | 'locked'>
 *
 * argon2id params: m=65536 (64 MiB), t=3, p=1
 * Lockout policy: 5 wrong attempts in a 10-min window → 6th returns 'locked';
 *                 locked_until = now + 15 min.
 *
 * Server-side enforcement only — no client counter trust (red line).
 * PIN never stored plaintext (red line).
 */

import * as argon2 from 'argon2';
import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';

const ARGON2_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB — mutation m=4096 causes AC3 tests to fail
  timeCost: 3,
  parallelism: 1,
};

/** Window in milliseconds within which failed attempts are counted */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Number of failures in the window that causes lockout on the NEXT attempt */
const LOCKOUT_THRESHOLD = 5; // 6th attempt triggers lockout

/** Lockout duration in milliseconds */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Hash the given PIN with argon2id and upsert it into user_pins.
 * Resets attempts_count and locked_until on each setPin call.
 */
export async function setPin(userId: string, pin: string): Promise<void> {
  const hash = await argon2.hash(pin, ARGON2_OPTS);
  const pool = getOwnerConnection();
  try {
    await pool.query(
      `INSERT INTO public.user_pins (user_id, pin_hash, attempts_count, locked_until, last_attempt_at)
       VALUES ($1, $2, 0, NULL, NULL)
       ON CONFLICT (user_id) DO UPDATE
         SET pin_hash       = EXCLUDED.pin_hash,
             attempts_count = 0,
             locked_until   = NULL,
             last_attempt_at = NULL,
             updated_at     = now()`,
      [userId, hash],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Verify a PIN for the given user.
 *
 * Returns:
 *   true      — PIN is correct (and account was not locked)
 *   false     — PIN is wrong but account not yet locked
 *   'locked'  — Account is locked (regardless of PIN correctness)
 *
 * Lockout logic (server-side only):
 * 1. If locked_until > now() → return 'locked' immediately
 * 2. If last_attempt_at is older than 10 min → reset attempts_count to 0 (new window)
 * 3. Verify argon2id hash
 * 4. Correct → reset attempts_count=0, locked_until=NULL; return true
 * 5. Wrong → increment attempts_count, set last_attempt_at=now()
 *    If attempts_count >= 6 → set locked_until=now()+15min; return 'locked'
 *    Else return false
 */
export async function verifyPin(userId: string, pin: string): Promise<true | false | 'locked'> {
  const pool = getOwnerConnection();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      pin_hash: string;
      attempts_count: number;
      locked_until: Date | null;
      last_attempt_at: Date | null;
    }>(
      `SELECT pin_hash, attempts_count, locked_until, last_attempt_at
         FROM public.user_pins
        WHERE user_id = $1
          FOR UPDATE`,
      [userId],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const row = rows[0];
    const now = Date.now(); // uses fake timers in tests via vi.useFakeTimers()

    // Step 1: Check active lockout
    if (row.locked_until !== null && row.locked_until.getTime() > now) {
      await client.query('ROLLBACK');
      return 'locked';
    }

    // Step 2: Determine effective attempts_count (reset if outside the 10-min window)
    let currentAttempts = row.attempts_count;
    if (
      row.last_attempt_at === null ||
      now - row.last_attempt_at.getTime() > ATTEMPT_WINDOW_MS
    ) {
      currentAttempts = 0;
    }

    // Step 3: Verify argon2id hash
    const isCorrect = await argon2.verify(row.pin_hash, pin);

    if (isCorrect) {
      // Step 4: Correct PIN — reset lockout state
      await client.query(
        `UPDATE public.user_pins
            SET attempts_count = 0,
                locked_until   = NULL,
                last_attempt_at = NULL,
                updated_at     = now()
          WHERE user_id = $1`,
        [userId],
      );
      await client.query('COMMIT');
      return true;
    }

    // Step 5: Wrong PIN — increment count, update last_attempt_at
    const newAttempts = currentAttempts + 1;
    const nowTs = new Date(now).toISOString();

    if (newAttempts >= LOCKOUT_THRESHOLD + 1) {
      // 6th failure triggers lockout
      const lockedUntil = new Date(now + LOCKOUT_DURATION_MS).toISOString();
      await client.query(
        `UPDATE public.user_pins
            SET attempts_count  = $2,
                last_attempt_at = $3,
                locked_until    = $4,
                updated_at      = now()
          WHERE user_id = $1`,
        [userId, newAttempts, nowTs, lockedUntil],
      );
      await client.query('COMMIT');
      return 'locked';
    }

    // Below threshold — record failure, no lockout yet
    await client.query(
      `UPDATE public.user_pins
          SET attempts_count  = $2,
              last_attempt_at = $3,
              locked_until    = NULL,
              updated_at      = now()
        WHERE user_id = $1`,
      [userId, newAttempts, nowTs],
    );
    await client.query('COMMIT');
    return false;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
