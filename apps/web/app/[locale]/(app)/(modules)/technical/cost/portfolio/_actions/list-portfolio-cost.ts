'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  MIXED_CURRENCY_ROLLUP_MARKER,
  portfolioMaterialCurrencySql,
  portfolioMaterialTotalSql,
} from '../../_actions/recipe-cost-rollup-sql';
import type { QueryClient } from '../../_actions/shared';

export { MIXED_CURRENCY_ROLLUP_MARKER };

type PortfolioCostRow = {
  fg_code: string;
  fg_name: string | null;
  total_recipe_cost: string | null;
  currency: string;
};

type PortfolioCostResult = {
  fg_code: string;
  fg_name: string;
  /** null when component currencies differ (no invalid cross-currency sum). */
  total_recipe_cost: number | null;
  currency: string;
};

export async function listPortfolioCost(): Promise<PortfolioCostResult[]> {
  try {
    return await withOrgContext(async ({ client }): Promise<PortfolioCostResult[]> => {
      const qc = client as QueryClient;
      const { rows } = await qc.query<PortfolioCostRow>(
        `with latest_bom as (
           select distinct on (i.item_code)
                  bh.id,
                  bh.item_id,
                  bh.version,
                  bh.status
             from public.bom_headers bh
             join public.items i
               on i.id = bh.item_id
              and i.org_id = app.current_org_id()
            where bh.org_id = app.current_org_id()
              and bh.item_id is not null
              and bh.status <> 'archived'
            order by i.item_code, bh.version desc
         )
         select i.item_code as fg_code,
                i.name as fg_name,
                ${portfolioMaterialTotalSql()} as total_recipe_cost,
                ${portfolioMaterialCurrencySql()} as currency
           from public.items i
           left join latest_bom lb
                  on lb.item_id = i.id
          where i.org_id = app.current_org_id()
            and i.item_type = 'fg'
          order by i.item_code asc`,
      );

      return rows.map((row) => ({
        fg_code: row.fg_code,
        fg_name: row.fg_name ?? '',
        total_recipe_cost:
          row.total_recipe_cost == null || row.currency === MIXED_CURRENCY_ROLLUP_MARKER
            ? null
            : Number(row.total_recipe_cost),
        currency: row.currency,
      }));
    });
  } catch (error) {
    console.error('[technical/cost/portfolio] listPortfolioCost load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
