/**
 * W9-L7 — E-sign & scanner PIN management (desktop), closing chain dead-end #17
 * (clickthrough §6 + audit F-C15): desktop e-sign flows demand a PIN but the
 * only enrollment UI lived in the scanner shell.
 *
 * OWNER DECISION (2026-06-11): `public.user_pins` stays ONE record shared
 * between scanner login and e-signatures (CFR-21 separation = future
 * decision). This screen manages that shared PIN; the copy says so honestly.
 *
 * Write path: `setPin()` re-exported by `lib/scanner/auth` from
 * `@monopilot/auth` `verify-pin.ts` — the EXACT argon2id hash + upsert the
 * scanner /api/scanner/set-pin and /api/scanner/change-pin routes use. No
 * hashing is duplicated here; lockout-field handling (reset on successful
 * set) belongs to `setPin` itself, never to this action.
 *
 * Authorization to (re)set: the caller proves identity with EITHER their
 * Supabase account password (`verifySupabaseLoginPassword`, same helper as
 * the scanner set-pin route) OR their current PIN (`verifyPin` — wrong
 * attempts count toward the server-side lockout exactly like the scanner
 * change-pin route; 'locked' is surfaced, never bypassed).
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  setPin,
  verifyPin,
  verifySupabaseLoginPassword,
} from '../../../../../../lib/scanner/auth';
import { writeScannerAudit } from '../../../../../../lib/scanner/audit';
import { validPin } from '../../../../../../lib/scanner/route-utils';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

export type PinStatus = {
  state: 'ready' | 'error';
  /** Whether a user_pins row exists for the signed-in user. NEVER the PIN. */
  pinSet: boolean;
  /** ISO timestamp while an active lockout is in force, else null. */
  lockedUntil: string | null;
  /** Failed attempts recorded on the row (10-min rolling window, server-side). */
  failedAttempts: number;
  /** Last time the PIN was (re)set or attempted, for display only. */
  updatedAt: string | null;
};

type UserPinRow = {
  attempts_count: number;
  locked_until: Date | string | null;
  updated_at: Date | string | null;
};

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Read the signed-in user's PIN status (existence + lockout fields, never the
 * hash). RLS (migration 026) scopes user_pins SELECT to the caller's org.
 */
export async function readPinStatus(): Promise<PinStatus> {
  try {
    return await withOrgContext(async ({ userId, client }) => {
      const queryClient = client as QueryClient;
      const result = await queryClient.query<UserPinRow>(
        `select attempts_count, locked_until, updated_at
           from public.user_pins
          where user_id = $1::uuid`,
        [userId],
      );

      const row = result.rows[0];
      if (!row) {
        return { state: 'ready' as const, pinSet: false, lockedUntil: null, failedAttempts: 0, updatedAt: null };
      }

      const lockedUntilIso = toIso(row.locked_until);
      const activeLock = lockedUntilIso !== null && new Date(lockedUntilIso).getTime() > Date.now();

      return {
        state: 'ready' as const,
        pinSet: true,
        lockedUntil: activeLock ? lockedUntilIso : null,
        failedAttempts: Number(row.attempts_count ?? 0),
        updatedAt: toIso(row.updated_at),
      };
    });
  } catch (error) {
    console.error('[account/pin] readPinStatus failed:', error);
    return { state: 'error', pinSet: false, lockedUntil: null, failedAttempts: 0, updatedAt: null };
  }
}

export type SetPinInput = {
  /** How the caller authorizes the change: account password or current PIN. */
  authMethod: 'password' | 'pin';
  /** The current account password OR current PIN, per authMethod. */
  currentSecret: string;
  newPin: string;
  confirmPin: string;
};

export type SetPinError =
  | 'invalid_input'
  | 'invalid_pin_format'
  | 'pin_mismatch'
  | 'invalid_credentials'
  | 'pin_locked'
  | 'persistence_failed';

export type SetPinResult = { ok: true; pinSet: true } | { ok: false; error: SetPinError };

/**
 * Set or change the shared e-sign/scanner PIN for the SIGNED-IN user (id from
 * verified context, never the client). Reuses the scanner write path verbatim.
 */
export async function setEsignPinAction(input: SetPinInput): Promise<SetPinResult> {
  'use server';

  if (
    !input ||
    (input.authMethod !== 'password' && input.authMethod !== 'pin') ||
    typeof input.currentSecret !== 'string' ||
    input.currentSecret.length === 0 ||
    typeof input.newPin !== 'string' ||
    typeof input.confirmPin !== 'string'
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  if (!validPin(input.newPin)) {
    return { ok: false, error: 'invalid_pin_format' };
  }
  if (input.newPin !== input.confirmPin) {
    return { ok: false, error: 'pin_mismatch' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const auditBase = { orgId, userId, operation: 'account.set_pin' };

      if (input.authMethod === 'pin') {
        // Same lockout-honouring check the scanner change-pin route performs.
        const pinResult = await verifyPin(userId, input.currentSecret, { client: queryClient });
        if (pinResult === 'locked') {
          await writeScannerAudit(queryClient, { ...auditBase, resultCode: 'pin_locked' });
          return { ok: false as const, error: 'pin_locked' as const };
        }
        if (pinResult !== true) {
          await writeScannerAudit(queryClient, { ...auditBase, resultCode: 'invalid_pin' });
          return { ok: false as const, error: 'invalid_credentials' as const };
        }
      } else {
        const emailResult = await queryClient.query<{ email: string | null }>(
          `select email::text as email from public.users where id = $1::uuid limit 1`,
          [userId],
        );
        const email = emailResult.rows[0]?.email;
        const passwordOk = email
          ? await verifySupabaseLoginPassword(email, input.currentSecret)
          : false;
        if (!passwordOk) {
          await writeScannerAudit(queryClient, { ...auditBase, resultCode: 'invalid_credentials' });
          return { ok: false as const, error: 'invalid_credentials' as const };
        }
      }

      // The ONLY user_pins write — the shared scanner path (argon2id hash +
      // upsert; resets attempts_count/locked_until inside setPin itself).
      await setPin(userId, input.newPin);
      await writeScannerAudit(queryClient, { ...auditBase, resultCode: 'ok' });

      return { ok: true as const, pinSet: true as const };
    });
  } catch (error) {
    console.error('[account/pin] setEsignPinAction failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
