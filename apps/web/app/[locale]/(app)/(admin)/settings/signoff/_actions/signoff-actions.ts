'use server';

/**
 * Wave 8a / Lane K4 (A) + (B) — signoff policy data layer.
 *
 *  - listSignoffPolicies(): read all e-sign policies for the org + the roles the
 *    org can assign as signers (loaded exactly like the invite modal does).
 *  - upsertSignoffPolicy(...): admin-gated upsert of one policy (unique per
 *    org + signoff_type). Mirrors the company-profile pattern: withOrgContext,
 *    zod parse inside the action, permission check, UPDATE/INSERT, revalidatePath.
 *  - setOverconsumeThresholds(...): (B, two-tier — Lane C1c) writes BOTH
 *    tenant_variations.feature_flags->>'overconsume_warn_pct' (warn tier:
 *    consume proceeds with a warning) and ->>'overconsume_threshold_pct'
 *    (approval tier: supervisor PIN) via the same jsonb-upsert pattern as
 *    setRequireGrnQcInspection. The consume gates read them (absent = 0).
 *    Invariant enforced server-side: warnPct ≤ approvePct.
 *    NOTE: the former single-tier export setOverconsumeThresholdPct was
 *    REPLACED by this writer; all call sites (signoff page + client) updated.
 *
 * Roles FK is real (public.roles(id), migration 037); see 275-signoff-policies.sql.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { hasPermission as hasPermissionString } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const ADMIN_PERMISSION = 'settings.flags.edit' as const;
// Read gate for the list action — mirrors the flags admin list (settings/flags
// page.tsx requirePermission): org admins may VIEW; editing additionally
// requires ADMIN_PERMISSION (canEdit).
const READ_PERMISSION = 'org.access.admin' as const;
const SIGNOFF_ROUTE = '/settings/signoff';
const OVERCONSUME_FLAG = 'overconsume_threshold_pct' as const;
const OVERCONSUME_WARN_FLAG = 'overconsume_warn_pct' as const;
const AUDIT_ACTION = 'settings.signoff_policy.updated' as const;
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

export type SignerRoleOption = { id: string; label: string };

export type SignoffPolicy = {
  id: string;
  signoffType: string;
  requiredSignatures: number;
  firstSignerRoleId: string | null;
  secondSignerRoleId: string | null;
  allowSameUser: boolean;
  isActive: boolean;
};

export type ListSignoffPoliciesResult =
  | { state: 'ready'; policies: SignoffPolicy[]; roles: SignerRoleOption[]; canEdit: boolean }
  | { state: 'forbidden'; policies: []; roles: []; canEdit: false }
  | { state: 'error'; policies: []; roles: []; canEdit: false };

type PolicyRow = {
  id: string;
  signoff_type: string;
  required_signatures: number;
  first_signer_role_id: string | null;
  second_signer_role_id: string | null;
  allow_same_user: boolean;
  is_active: boolean;
};

const upsertSchema = z
  .object({
    signoffType: z.string().trim().min(1).max(120),
    requiredSignatures: z.number().int().min(1).max(2),
    firstSignerRoleId: z.string().uuid().nullable().optional().default(null),
    secondSignerRoleId: z.string().uuid().nullable().optional().default(null),
    allowSameUser: z.boolean(),
    isActive: z.boolean(),
  })
  .strict();

export type UpsertSignoffPolicyInput = z.input<typeof upsertSchema>;

export type UpsertSignoffPolicyResult =
  | { ok: true; policy: SignoffPolicy }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed'; message?: string };

// Two-tier over-consumption thresholds. Shape parse first; the warn ≤ approve
// invariant is checked separately so it maps to its own explicit error.
const overconsumeThresholdsSchema = z
  .object({
    warnPct: z.number().min(0).max(100),
    approvePct: z.number().min(0).max(100),
  })
  .strict();

export type SetOverconsumeThresholdsInput = z.input<typeof overconsumeThresholdsSchema>;

export type SetOverconsumeThresholdsResult =
  | { ok: true; warnPct: number; approvePct: number }
  | {
      ok: false;
      error: 'invalid_input' | 'warn_above_approve' | 'forbidden' | 'persistence_failed';
      message?: string;
    };

async function hasAdminPermission(context: OrgContextLike): Promise<boolean> {
  return hasPermissionString(context, ADMIN_PERMISSION);
}

async function hasReadPermission(context: OrgContextLike): Promise<boolean> {
  return hasPermissionString(context, READ_PERMISSION);
}

function toPolicy(row: PolicyRow): SignoffPolicy {
  return {
    id: row.id,
    signoffType: row.signoff_type,
    requiredSignatures: Number(row.required_signatures),
    firstSignerRoleId: row.first_signer_role_id,
    secondSignerRoleId: row.second_signer_role_id,
    allowSameUser: Boolean(row.allow_same_user),
    isActive: Boolean(row.is_active),
  };
}

async function loadRoles(client: QueryClient): Promise<SignerRoleOption[]> {
  const { rows } = await client.query<{ id: string; code: string; name: string | null }>(
    `select r.id, r.code, r.name
       from public.roles r
      where r.org_id = app.current_org_id()
      order by r.display_order nulls last, coalesce(r.name, r.code) asc`,
  );
  return rows.map((role) => ({ id: role.id, label: role.name ?? role.code }));
}

export async function listSignoffPolicies(): Promise<ListSignoffPoliciesResult> {
  try {
    return await withOrgContext<ListSignoffPoliciesResult>(async (ctx): Promise<ListSignoffPoliciesResult> => {
      const context = ctx as OrgContextLike;
      // Server-side read gate (review F4): fail closed — policies + signer
      // roles are admin material, not visible to any org-authenticated caller.
      if (!(await hasReadPermission(context))) {
        return { state: 'forbidden', policies: [], roles: [], canEdit: false };
      }
      const canEdit = await hasAdminPermission(context);
      const { rows } = await context.client.query<PolicyRow>(
        `select id, signoff_type, required_signatures, first_signer_role_id,
                second_signer_role_id, allow_same_user, is_active
           from public.signoff_policies
          where org_id = $1::uuid
          order by signoff_type asc`,
        [context.orgId],
      );
      const roles = await loadRoles(context.client);
      return { state: 'ready', policies: rows.map(toPolicy), roles, canEdit };
    });
  } catch (error) {
    console.error(
      '[settings/signoff] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', policies: [], roles: [], canEdit: false };
  }
}

export async function upsertSignoffPolicy(rawInput: UpsertSignoffPolicyInput): Promise<UpsertSignoffPolicyResult> {
  const parsed = upsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input' };
  }
  const input = parsed.data;

  try {
    return await withOrgContext<UpsertSignoffPolicyResult>(async (ctx): Promise<UpsertSignoffPolicyResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasAdminPermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      // Org-scoping gate (review F3): signer role ids must belong to the
      // CURRENT org — validated inside this action's org-scoped transaction
      // before the upsert, so a foreign-org role id never reaches the table.
      const signerRoleIds = [...new Set([input.firstSignerRoleId, input.secondSignerRoleId])].filter(
        (id): id is string => typeof id === 'string',
      );
      if (signerRoleIds.length > 0) {
        const { rows: orgRoleRows } = await context.client.query<{ id: string }>(
          `select id
             from public.roles
            where org_id = app.current_org_id()
              and id = any($1::uuid[])`,
          [signerRoleIds],
        );
        if (orgRoleRows.length !== signerRoleIds.length) {
          return {
            ok: false,
            error: 'invalid_input',
            message: 'Role does not belong to this organization.',
          };
        }
      }

      // Single arbiter (org_id, signoff_type) — matches the table unique constraint.
      const { rows } = await context.client.query<PolicyRow>(
        `insert into public.signoff_policies
           (org_id, signoff_type, required_signatures, first_signer_role_id,
            second_signer_role_id, allow_same_user, is_active)
         values ($1::uuid, $2, $3::int, $4::uuid, $5::uuid, $6::boolean, $7::boolean)
         on conflict (org_id, signoff_type) do update
            set required_signatures   = excluded.required_signatures,
                first_signer_role_id  = excluded.first_signer_role_id,
                second_signer_role_id = excluded.second_signer_role_id,
                allow_same_user       = excluded.allow_same_user,
                is_active             = excluded.is_active,
                updated_at            = now()
         returning id, signoff_type, required_signatures, first_signer_role_id,
                   second_signer_role_id, allow_same_user, is_active`,
        [
          context.orgId,
          input.signoffType,
          input.requiredSignatures,
          input.firstSignerRoleId,
          input.secondSignerRoleId,
          input.allowSameUser,
          input.isActive,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await context.client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'signoff_policy', $4, $5::jsonb, 'standard')`,
        [
          context.orgId,
          context.userId,
          AUDIT_ACTION,
          input.signoffType,
          JSON.stringify({
            signoff_type: input.signoffType,
            required_signatures: input.requiredSignatures,
            first_signer_role_id: input.firstSignerRoleId,
            second_signer_role_id: input.secondSignerRoleId,
            allow_same_user: input.allowSameUser,
            is_active: input.isActive,
            permission: ADMIN_PERMISSION,
          }),
        ],
      );

      try {
        revalidatePath(SIGNOFF_ROUTE);
      } catch {
        /* no request store (unit/integration test) */
      }

      return { ok: true, policy: toPolicy(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function setOverconsumeThresholds(
  rawInput: SetOverconsumeThresholdsInput,
): Promise<SetOverconsumeThresholdsResult> {
  const parsed = overconsumeThresholdsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input' };
  }
  const { warnPct, approvePct } = parsed.data;
  // Server-side invariant: the warn tier must not sit above the approval tier
  // (otherwise the "proceed with warning" band would be empty/inverted).
  if (warnPct > approvePct) {
    return {
      ok: false,
      error: 'warn_above_approve',
      message: 'Warning threshold must be less than or equal to the approval tolerance.',
    };
  }

  try {
    return await withOrgContext<SetOverconsumeThresholdsResult>(
      async (ctx): Promise<SetOverconsumeThresholdsResult> => {
        const context = ctx as OrgContextLike;
        if (!(await hasAdminPermission(context))) {
          return { ok: false, error: 'forbidden' };
        }

        const { rows } = await context.client.query<{ feature_flags: Record<string, unknown> }>(
          `insert into public.tenant_variations (org_id, feature_flags)
           values ($1::uuid, jsonb_build_object(
                     'overconsume_warn_pct', $2::numeric,
                     'overconsume_threshold_pct', $3::numeric))
           on conflict (org_id) do update
              set feature_flags = coalesce(public.tenant_variations.feature_flags, '{}'::jsonb) ||
                jsonb_build_object(
                  'overconsume_warn_pct', $2::numeric,
                  'overconsume_threshold_pct', $3::numeric)
           returning feature_flags`,
          [context.orgId, warnPct, approvePct],
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
            OVERCONSUME_FLAG,
            JSON.stringify({
              flag_key: OVERCONSUME_FLAG,
              warn_flag_key: OVERCONSUME_WARN_FLAG,
              warn_pct: warnPct,
              approve_pct: approvePct,
              permission: ADMIN_PERMISSION,
            }),
          ],
        );

        try {
          revalidatePath(SIGNOFF_ROUTE);
        } catch {
          /* no request store */
        }

        return { ok: true, warnPct, approvePct };
      },
    );
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
