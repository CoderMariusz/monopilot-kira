/**
 * T-015 — Recovery code management
 *
 * Exports:
 *   setRecoveryCodes(userId): generate 10 plaintext codes, store argon2id hashes, return plaintext
 *   verifyRecoveryCode(userId, code, conn): one-time use enforcement + replay audit trail
 *
 * Security red lines:
 *   - Recovery codes NEVER stored plaintext (argon2id hashed)
 *   - Replay attempt writes audit_events row with action='mfa.recovery_replay_attempt'
 */

import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type pg from 'pg';
import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';

const ARGON2_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB — mutation m=4096 causes argon2id parameter tests to fail
  timeCost: 3,
  parallelism: 1,
};

/**
 * Generate 10 recovery codes, hash with argon2id, upsert into recovery_codes.
 * Deletes any existing codes for the user before inserting new ones.
 * Returns the 10 plaintext codes (shown to user once only).
 */
export async function setRecoveryCodes(userId: string): Promise<string[]> {
  // Generate 10 alphanumeric codes, each 8 chars
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(6).toString('base64url').slice(0, 8),
  );

  // Hash each code with argon2id
  const hashes = await Promise.all(codes.map((code) => argon2.hash(code, ARGON2_OPTS)));

  const pool = getOwnerConnection();
  try {
    // Delete existing codes for this user (idempotent re-enrolment)
    await pool.query(`DELETE FROM public.recovery_codes WHERE user_id = $1`, [userId]);

    // Insert all 10 hashed codes
    for (const codeHash of hashes) {
      await pool.query(
        `INSERT INTO public.recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
        [userId, codeHash],
      );
    }
  } finally {
    await pool.end();
  }

  return codes;
}

/**
 * Verify a recovery code for the given user (one-time use).
 *
 * Returns:
 *   true  — code matches an unused row; marks it used
 *   false — code is wrong OR already used (replay attempt writes audit row on replay)
 *
 * Logic:
 * 1. SELECT unused codes (used_at IS NULL) and verify argon2id hash
 * 2. First match: mark used_at = now(), return true
 * 3. No match in unused: check used codes for replay detection
 *    - If a USED code matches → write audit_events (action='mfa.recovery_replay_attempt'); return false
 *    - Otherwise (no match at all): return false (no audit — brute-force attempt vs replay differs)
 */
export async function verifyRecoveryCode(
  userId: string,
  code: string,
  conn: pg.Pool,
): Promise<boolean> {
  // Step 1: Fetch all unused codes
  const unusedResult = await conn.query<{ id: string; code_hash: string }>(
    `SELECT id, code_hash FROM public.recovery_codes
     WHERE user_id = $1 AND used_at IS NULL
     ORDER BY id`,
    [userId],
  );

  // Step 2: Check each unused code
  for (const row of unusedResult.rows) {
    const matches = await argon2.verify(row.code_hash, code);
    if (matches) {
      // Mark as used
      await conn.query(
        `UPDATE public.recovery_codes SET used_at = now() WHERE id = $1`,
        [row.id],
      );
      return true;
    }
  }

  // Step 3: No match in unused — check used codes for replay detection
  const usedResult = await conn.query<{ id: string; code_hash: string }>(
    `SELECT id, code_hash FROM public.recovery_codes
     WHERE user_id = $1 AND used_at IS NOT NULL
     ORDER BY id`,
    [userId],
  );

  for (const row of usedResult.rows) {
    const matches = await argon2.verify(row.code_hash, code);
    if (matches) {
      // Replay attempt — write audit event
      await conn.query(
        `INSERT INTO public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
         VALUES (
           (SELECT org_id FROM public.users WHERE id = $1),
           $1,
           'user',
           'mfa.recovery_replay_attempt',
           'mfa_recovery_code',
           $1,
           gen_random_uuid(),
           'security'
         )`,
        [userId],
      );
      return false;
    }
  }

  // No match at all (brute-force attempt — no audit)
  return false;
}
