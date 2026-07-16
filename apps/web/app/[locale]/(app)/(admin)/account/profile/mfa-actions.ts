/**
 * C005 — Real TOTP reconfigure + backup-code generation for My Profile.
 *
 * Uses packages/auth enrollTotp / verifyTotp / setRecoveryCodes against
 * public.mfa_secrets + public.recovery_codes (migration 007). When
 * MFA_MASTER_KEY is unset the actions fail closed with mfa_unavailable
 * rather than opening a silent-empty modal.
 */
import { enrollTotp, getMfaMasterKeyFromEnv, verifyTotp } from '../../../../../../../../packages/auth/src/totp.js';
import { setRecoveryCodes } from '../../../../../../../../packages/auth/src/recovery.js';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export type MfaBackendAvailability = {
  /** True when MFA_MASTER_KEY is configured for TOTP encryption. */
  available: boolean;
};

export function readMfaBackendAvailability(): MfaBackendAvailability {
  const key = process.env.MFA_MASTER_KEY;
  return { available: typeof key === 'string' && key.length > 0 };
}

export type BeginMfaReconfigureResult =
  | { ok: true; secret: string; provisioningUri: string }
  | { ok: false; error: 'mfa_unavailable' | 'not_authenticated' };

export async function beginMfaReconfigureAction(): Promise<BeginMfaReconfigureResult> {
  'use server';

  const masterKey = getMfaMasterKeyFromEnv();
  if (!masterKey) {
    return { ok: false, error: 'mfa_unavailable' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId }) => {
      const { secret, provisioningUri } = await enrollTotp(userId, {
        masterKey,
        tenantId: orgId,
      });
      return { ok: true as const, secret, provisioningUri };
    });
  } catch (error) {
    console.error('[account/profile] beginMfaReconfigureAction failed:', error);
    return { ok: false, error: 'not_authenticated' };
  }
}

export type ConfirmMfaReconfigureResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: 'mfa_unavailable' | 'invalid_code' | 'not_authenticated' };

export async function confirmMfaReconfigureAction(input: {
  code: string;
}): Promise<ConfirmMfaReconfigureResult> {
  'use server';

  const token = typeof input?.code === 'string' ? input.code.trim() : '';
  if (!/^\d{6}$/.test(token)) {
    return { ok: false, error: 'invalid_code' };
  }

  const masterKey = getMfaMasterKeyFromEnv();
  if (!masterKey) {
    return { ok: false, error: 'mfa_unavailable' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId }) => {
      const verified = await verifyTotp(userId, token, { masterKey, tenantId: orgId });
      if (!verified.ok) {
        return { ok: false as const, error: 'invalid_code' as const };
      }

      const backupCodes = await setRecoveryCodes(userId);
      return { ok: true as const, backupCodes };
    });
  } catch (error) {
    console.error('[account/profile] confirmMfaReconfigureAction failed:', error);
    return { ok: false, error: 'not_authenticated' };
  }
}

export type RegenerateBackupCodesResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: 'mfa_unavailable' | 'not_enrolled' | 'invalid_code' | 'not_authenticated' };

/**
 * Regenerates backup codes after the caller proves possession of the current
 * TOTP factor. Plaintext codes cannot be read back from recovery_codes hashes.
 */
export async function regenerateBackupCodesAction(input: {
  code: string;
}): Promise<RegenerateBackupCodesResult> {
  'use server';

  const token = typeof input?.code === 'string' ? input.code.trim() : '';
  if (!/^\d{6}$/.test(token)) {
    return { ok: false, error: 'invalid_code' };
  }

  const masterKey = getMfaMasterKeyFromEnv();
  if (!masterKey) {
    return { ok: false, error: 'mfa_unavailable' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> };
      const enrolled = await queryClient.query(
        `select 1 from public.mfa_secrets where user_id = $1::uuid limit 1`,
        [userId],
      );
      if (enrolled.rows.length === 0) {
        return { ok: false as const, error: 'not_enrolled' as const };
      }

      const verified = await verifyTotp(userId, token, { masterKey, tenantId: orgId });
      if (!verified.ok) {
        return { ok: false as const, error: 'invalid_code' as const };
      }

      const backupCodes = await setRecoveryCodes(userId);
      return { ok: true as const, backupCodes };
    });
  } catch (error) {
    console.error('[account/profile] regenerateBackupCodesAction failed:', error);
    return { ok: false, error: 'not_authenticated' };
  }
}
