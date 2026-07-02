/**
 * Shared types for user lifecycle Server Actions (reactivate, reset-user-mfa).
 *
 * IMPORTANT: This file must NOT have 'use server' — it exports types only.
 * The 'use server' modules (reactivate.ts, reset-user-mfa.ts) import type
 * from here. See SHARED-RULES.md rule 3: 'use server' files may export ONLY
 * async function declarations.
 */

export type ReactivateUserInput = {
  targetUserId: string;
};

export type ReactivateUserResult =
  | { ok: true; data: { targetUserId: string; reactivated: true } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'not_disabled'
        | 'auth_identity_missing'
        | 'seat_limit_exceeded'
        | 'persistence_failed';
    };

export type ResetUserMfaInput = {
  targetUserId: string;
  reason: string;
};

export type ResetUserMfaResult =
  | { ok: true; data: { targetUserId: string; factorsRemoved: number; secretsCleared: boolean } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'reset_failed'
        | 'service_unavailable'
        | 'persistence_failed';
    };
