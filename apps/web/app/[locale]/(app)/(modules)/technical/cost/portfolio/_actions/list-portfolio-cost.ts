'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from '../../_actions/shared';

type PortfolioCostRow = {
  fg_code: string;
  fg_name: string | null;
  total_recipe_cost: string | null;
  currency: string;
};

type PortfolioCostResult = {
  fg_code: string;
  fg_name: string;
  total_recipe_cost: number;
  currency: string;
};

export async function listPortfolioCost(): Promise<PortfolioCostResult[]> {
  try {
    return await withOrgContext(async ({ client }): Promise<PortfolioCostResult[]> => {
      const qc = client as QueryClient;
      const { rows } = await qc.query<PortfolioCostRow>(
        `with latest_bom as (
           select distinct on (bh.product_id)
                  bh.id,
                  bh.product_id,
                  bh.version,
                  bh.status
             from public.bom_headers bh
            where bh.org_id = app.current_org_id()
              and bh.product_id is not null
              and bh.status <> 'archived'
            order by bh.product_id, bh.version desc
         )
         select i.item_code as fg_code,
                i.name as fg_name,
                (select sum(bl.quantity * ci.cost_per_kg)::text
                   from public.bom_lines bl
                   left join public.items ci
                          on ci.org_id = app.current_org_id()
                         and (ci.id = bl.item_id or ci.item_code = bl.component_code)
                  where bl.org_id = app.current_org_id()
                    and bl.bom_header_id = lb.id
                    and ci.cost_per_kg is not null) as total_recipe_cost,
                'PLN'::text as currency
           from public.items i
           left join latest_bom lb
                  on lb.product_id = i.item_code
          where i.org_id = app.current_org_id()
            and i.item_type = 'fg'
          order by i.item_code asc`,
      );

      return rows.map((row) => ({
        fg_code: row.fg_code,
        fg_name: row.fg_name ?? '',
        total_recipe_cost: Number(row.total_recipe_cost ?? '0'),
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
