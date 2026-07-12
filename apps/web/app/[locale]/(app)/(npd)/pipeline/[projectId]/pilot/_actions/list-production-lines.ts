'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../../../lib/site/site-context';
import { PRODUCTION_LINES_SITE_FILTER_SQL } from '../../../../../../../../lib/site/production-lines-site-filter';
import { hasPilotPermission } from './get-pilot-run';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
  siteId: string | null;
  siteCode: string | null;
  siteName: string | null;
};

const READ_PERMISSION = 'npd.pilot.read';

type ProductionLineRow = {
  id: string;
  code: string;
  name: string;
  warehouse_id: string | null;
  site_id: string | null;
  site_code: string | null;
  site_name: string | null;
};

export async function listProductionLines(): Promise<ProductionLineOption[]> {
  return await withOrgContext(async (rawCtx) => {
    const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

    if (!(await hasPilotPermission(ctx, READ_PERMISSION))) {
      throw new Error('forbidden');
    }

    const activeSiteId = (await getActiveSiteId({ client: ctx.client })) ?? null;

    const { rows } = await ctx.client.query<ProductionLineRow>(
      `select pl.id::text,
              pl.code,
              pl.name,
              pl.warehouse_id::text,
              pl.site_id::text,
              s.site_code,
              s.name as site_name
         from public.production_lines pl
         left join public.sites s
           on s.id = pl.site_id
          and s.org_id = pl.org_id
        where pl.org_id = app.current_org_id()
          and coalesce(pl.status, 'active') <> 'archived'
          ${PRODUCTION_LINES_SITE_FILTER_SQL}
        order by s.site_code nulls last, pl.code`,
      [activeSiteId],
    );

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      warehouseId: row.warehouse_id,
      siteId: row.site_id,
      siteCode: row.site_code,
      siteName: row.site_name,
    }));
  });
}
