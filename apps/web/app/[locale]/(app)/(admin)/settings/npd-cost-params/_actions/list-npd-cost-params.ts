'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { NPD_COST_PARAMS_PERMISSION } from './npd-cost-params-schema';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type NpdCostParamsRow = {
  overheadPerKg: string;
  logisticsPerBox: string;
};

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

export async function listNpdCostParams() {
  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false as const, code: 'forbidden' as const };
      }

      const { rows } = await context.client.query<{
        overhead_per_kg: string;
        logistics_per_box: string;
      }>(
        `select overhead_per_kg::text,
                logistics_per_box::text
           from public.org_npd_cost_params
          where org_id = app.current_org_id()
          limit 1`,
      );

      const row = rows[0];
      const data: NpdCostParamsRow = {
        overheadPerKg: row?.overhead_per_kg ?? '0',
        logisticsPerBox: row?.logistics_per_box ?? '0',
      };

      return { ok: true as const, data };
    });
  } catch (error) {
    console.error('[listNpdCostParams] load_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, code: 'persistence_failed' as const };
  }
}
