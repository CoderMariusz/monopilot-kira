'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

const FLAG_KEY = 'require_grn_qc_inspection' as const;
const REQUIRED_PERMISSION = 'settings.flags.edit' as const;
const AUDIT_ACTION = 'settings.flag.updated' as const;

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type SetRequireGrnQcInspectionInput = {
  flagKey?: typeof FLAG_KEY;
  enabled: boolean;
  auditReason?: string;
};

export type SetRequireGrnQcInspectionResult =
  | { ok: true; data: { flagKey: typeof FLAG_KEY; enabled: boolean } }
  | { ok: false; error: 'forbidden' | 'persistence_failed' | 'invalid_input' };

async function hasSettingsFlagsEdit({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, REQUIRED_PERMISSION],
  );
  return rows.length > 0;
}

export async function setRequireGrnQcInspection(
  input: SetRequireGrnQcInspectionInput,
): Promise<SetRequireGrnQcInspectionResult> {
  if (input.flagKey && input.flagKey !== FLAG_KEY) {
    return { ok: false, error: 'invalid_input' };
  }
  if (typeof input.enabled !== 'boolean') {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext<SetRequireGrnQcInspectionResult>(async (ctx): Promise<SetRequireGrnQcInspectionResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsFlagsEdit(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const enabled = Boolean(input.enabled);
      const { rows } = await context.client.query<{ feature_flags: Record<string, boolean> }>(
        `insert into public.tenant_variations (org_id, feature_flags)
         values ($1::uuid, jsonb_build_object('require_grn_qc_inspection', $2::boolean))
         on conflict (org_id) do update
            set feature_flags = coalesce(public.tenant_variations.feature_flags, '{}'::jsonb) ||
              jsonb_build_object('require_grn_qc_inspection', $2::boolean)
         returning feature_flags`,
        [context.orgId, enabled],
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
          AUDIT_ACTION,
          FLAG_KEY,
          JSON.stringify({
            flag_key: FLAG_KEY,
            enabled,
            permission: REQUIRED_PERMISSION,
            audit_reason: input.auditReason ?? null,
          }),
        ],
      );

      revalidateLocalized('/settings/quality');
      return { ok: true, data: { flagKey: FLAG_KEY, enabled } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
