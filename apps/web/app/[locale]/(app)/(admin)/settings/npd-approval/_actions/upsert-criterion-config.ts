'use server';

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { NPD_APPROVAL_CRITERIA_PERMISSION, upsertCriterionConfigSchema } from './criterion-config-schema';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function hasNpdSchemaEdit({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
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
    [userId, orgId, NPD_APPROVAL_CRITERIA_PERMISSION],
  );
  return rows.length > 0;
}

export async function upsertCriterionConfig(input: unknown) {
  const parsed = upsertCriterionConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: 'invalid_input' as const };
  }

  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false as const, code: 'forbidden' as const };
      }

      await context.client.query(
        `insert into public.npd_approval_criterion_config (org_id, criterion_key, required)
         values (app.current_org_id(), $1, $2)
         on conflict (org_id, criterion_key) do update
            set required = excluded.required,
                updated_at = now()`,
        [parsed.data.criterionKey, parsed.data.required],
      );

      await context.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user', 'npd.approval_criterion_config.updated',
                 'npd_approval_criterion_config', $2, $3::jsonb, $4::uuid, 'operational')`,
        [
          context.userId,
          parsed.data.criterionKey,
          JSON.stringify({
            criterion_key: parsed.data.criterionKey,
            required: parsed.data.required,
            permission: NPD_APPROVAL_CRITERIA_PERMISSION,
          }),
          randomUUID(),
        ],
      );

      return { ok: true as const };
    });
  } catch (error) {
    console.error('[upsertCriterionConfig] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, code: 'persistence_failed' as const };
  }
}
