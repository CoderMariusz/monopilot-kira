'use server';

/**
 * Sign-off & PINs — scanner reverse-consume auth policy.
 *
 * Owner decision: the scanner reverse-consume flow ALWAYS needs the operator PIN
 * + `production.consumption.correct`. The org toggle below adds the supervisor
 * tier on top:
 *   - ON  (default) = supervisor email + PIN required for every scanner reversal
 *     (the supervisor must additionally hold production.consumption.override_approve).
 *   - OFF           = operator-PIN-only (the operator still needs
 *     production.consumption.correct — never client-trusted; enforced in the
 *     reverse-consume API route).
 *
 * Storage mirrors setOverconsumeThresholds in signoff-actions.ts exactly: the
 * boolean lives in public.tenant_variations.feature_flags JSONB under the key
 * 'scanner_reverse_require_supervisor_pin' (stored as text 'true'/'false';
 * absent = default ON, matching the route's supervisorPinRequired() read). No
 * new table or migration is needed for storage.
 *
 * RBAC: same admin gate as the signoff writers (settings.flags.edit), with a
 * fail-closed org-admin read gate so the page renders permission-denied for
 * non-admins instead of leaking the policy.
 */
import { z } from 'zod';

import { hasPermission as hasPermissionString } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

const ADMIN_PERMISSION = 'settings.flags.edit' as const;
const READ_PERMISSION = 'org.access.admin' as const;
const SCANNER_AUTH_ROUTE = '/settings/scanner-auth';
const REVERSE_SUPERVISOR_FLAG = 'scanner_reverse_require_supervisor_pin' as const;
const FLAG_AUDIT_ACTION = 'settings.flag.updated' as const;

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type ScannerAuthPolicy = {
  /** true = supervisor PIN required for scanner reverse-consume; false = operator-PIN-only. */
  requireSupervisorPin: boolean;
};

export type GetScannerAuthPolicyResult =
  | { state: 'ready'; policy: ScannerAuthPolicy; canEdit: boolean }
  | { state: 'forbidden' }
  | { state: 'error' };

const setSchema = z
  .object({
    requireSupervisorPin: z.boolean(),
  })
  .strict();

export type SetScannerReverseAuthPolicyInput = z.input<typeof setSchema>;

export type SetScannerReverseAuthPolicyResult =
  | { ok: true; requireSupervisorPin: boolean }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

/** Read the flag; absent or any value other than 'false' means required (default ON). */
function flagToRequireSupervisor(raw: string | null | undefined): boolean {
  return raw == null ? true : raw.toLowerCase() !== 'false';
}

export async function getScannerAuthPolicy(): Promise<GetScannerAuthPolicyResult> {
  try {
    return await withOrgContext<GetScannerAuthPolicyResult>(async (ctx): Promise<GetScannerAuthPolicyResult> => {
      const context = ctx as OrgContextLike;
      // Fail closed — the scanner auth policy is admin material.
      if (!(await hasPermissionString(context, READ_PERMISSION))) {
        return { state: 'forbidden' };
      }
      const canEdit = await hasPermissionString(context, ADMIN_PERMISSION);
      const { rows } = await context.client.query<{ require_supervisor: string | null }>(
        `select feature_flags ->> $2 as require_supervisor
           from public.tenant_variations
          where org_id = $1::uuid
          limit 1`,
        [context.orgId, REVERSE_SUPERVISOR_FLAG],
      );
      return {
        state: 'ready',
        policy: { requireSupervisorPin: flagToRequireSupervisor(rows[0]?.require_supervisor) },
        canEdit,
      };
    });
  } catch (error) {
    console.error(
      '[settings/scanner-auth] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error' };
  }
}

export async function setScannerReverseAuthPolicy(
  rawInput: SetScannerReverseAuthPolicyInput,
): Promise<SetScannerReverseAuthPolicyResult> {
  const parsed = setSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input' };
  }
  const { requireSupervisorPin } = parsed.data;

  try {
    return await withOrgContext<SetScannerReverseAuthPolicyResult>(
      async (ctx): Promise<SetScannerReverseAuthPolicyResult> => {
        const context = ctx as OrgContextLike;
        if (!(await hasPermissionString(context, ADMIN_PERMISSION))) {
          return { ok: false, error: 'forbidden' };
        }

        // Same jsonb-upsert pattern as setOverconsumeThresholds. Stored as text
        // 'true'/'false' so the scanner route's ->>'…' read sees a plain string.
        const { rows } = await context.client.query<{ feature_flags: Record<string, unknown> }>(
          `insert into public.tenant_variations (org_id, feature_flags)
           values ($1::uuid, jsonb_build_object($2::text, $3::text))
           on conflict (org_id) do update
              set feature_flags = coalesce(public.tenant_variations.feature_flags, '{}'::jsonb) ||
                jsonb_build_object($2::text, $3::text)
           returning feature_flags`,
          [context.orgId, REVERSE_SUPERVISOR_FLAG, requireSupervisorPin ? 'true' : 'false'],
        );
        if (rows.length < 1) {
          return { ok: false, error: 'persistence_failed' };
        }

        await context.client.query(
          `insert into public.audit_log
             (org_id, actor_user_id, actor_type, action, resource_type, resource_id, after_state, retention_class)
           values ($1::uuid, $2::uuid, 'user', $3, 'settings_feature_flag', $4, $5::jsonb, 'standard')`,
          [
            context.orgId,
            context.userId,
            FLAG_AUDIT_ACTION,
            REVERSE_SUPERVISOR_FLAG,
            JSON.stringify({
              flag_key: REVERSE_SUPERVISOR_FLAG,
              require_supervisor_pin: requireSupervisorPin,
              permission: ADMIN_PERMISSION,
            }),
          ],
        );

        try {
          revalidateLocalized(SCANNER_AUTH_ROUTE);
        } catch {
          /* no request store (unit/integration test) */
        }

        return { ok: true, requireSupervisorPin };
      },
    );
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
