'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  NPD_COST_PARAMS_PERMISSION,
  upsertNpdCostParamsSchema,
} from './npd-cost-params-schema';

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
    [userId, orgId, NPD_COST_PARAMS_PERMISSION],
  );
  return rows.length > 0;
}

export async function upsertNpdCostParams(input: unknown) {
  const parsed = upsertNpdCostParamsSchema.safeParse(input);
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
        `insert into public.org_npd_cost_params (org_id, overhead_per_kg, logistics_per_box)
         values (app.current_org_id(), $1::numeric, $2::numeric)
         on conflict (org_id) do update
            set overhead_per_kg = excluded.overhead_per_kg,
                logistics_per_box = excluded.logistics_per_box,
                updated_at = now()`,
        [parsed.data.overheadPerKg, parsed.data.logisticsPerBox],
      );

      return { ok: true as const };
    });
  } catch (error) {
    console.error('[upsertNpdCostParams] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, code: 'persistence_failed' as const };
  }
}
