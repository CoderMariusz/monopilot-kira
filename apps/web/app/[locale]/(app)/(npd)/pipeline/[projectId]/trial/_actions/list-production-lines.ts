'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { getActiveSiteId } from '../../../../../../../../lib/site/site-context';
import { PRODUCTION_LINES_SITE_FILTER_SQL } from '../../../../../../../../lib/site/production-lines-site-filter';
import { TRIAL_READ_PERMISSION } from './errors';
import type { ProductionLineOption } from '../_lib/capacity-block';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type ProductionLineRow = {
  id: string;
  code: string;
  name: string;
};

/** Org-scoped active production lines for the trial line-time picker. */
export async function listProductionLines(): Promise<ProductionLineOption[]> {
  return await withOrgContext(async (rawCtx) => {
    const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

    if (!(await hasPermission(ctx, TRIAL_READ_PERMISSION))) {
      throw new Error('forbidden');
    }

    const activeSiteId = (await getActiveSiteId({ client: ctx.client })) ?? null;

    const { rows } = await ctx.client.query<ProductionLineRow>(
      `select id::text, code, name
         from public.production_lines pl
        where pl.org_id = app.current_org_id()
          and pl.status = 'active'
          ${PRODUCTION_LINES_SITE_FILTER_SQL}
        order by pl.code`,
      [activeSiteId],
    );

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
    }));
  });
}
