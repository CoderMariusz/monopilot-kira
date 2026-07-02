export type PlatformActionResult =
  | { ok: true }
  | { ok: false; error: 'invalid_org' | 'forbidden' };

/**
 * Result of addPlatformAdminAction. Kept in this NON-'use server' sibling so the
 * 'use server' actions module exports ONLY async functions (a 'use server'
 * module that exports a type fails `next build` — the #1 silent Vercel
 * deploy-breaker). Consumers `import type` from here.
 *
 *   - added          → a fresh row was inserted
 *   - revived        → a previously-revoked admin was un-revoked
 *   - already_admin  → the email is already an active platform admin (no-op)
 *   - self           → the caller added their own email (no-op success)
 *   - not_found      → no user with that email exists
 *   - invalid_email  → the email was blank / malformed
 *   - forbidden      → caller is not a platform admin
 */
export type AddPlatformAdminOutcome =
  | 'added'
  | 'revived'
  | 'already_admin'
  | 'self';

export type AddPlatformAdminResult =
  | { ok: true; outcome: AddPlatformAdminOutcome; email: string }
  | { ok: false; error: 'not_found' | 'invalid_email' | 'forbidden' };
