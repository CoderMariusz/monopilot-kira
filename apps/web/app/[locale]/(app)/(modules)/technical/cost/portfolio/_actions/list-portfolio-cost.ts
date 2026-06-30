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
                (select sum(bl.quantity * vec.amount)::text
                   from public.bom_lines bl
                   left join public.items ci
                          on ci.org_id = app.current_org_id()
                         and (ci.id = bl.item_id or ci.item_code = bl.component_code)
                   left join public.v_item_effective_cost vec on vec.item_id = ci.id
                  where bl.org_id = app.current_org_id()
                    and bl.bom_header_id = lb.id
                    and vec.amount is not null) as total_recipe_cost,
                (select case when count(distinct vec.currency) > 1 then 'MIXED' else max(vec.currency) end
                   from public.bom_lines bl
                   left join public.items ci
                          on ci.org_id = app.current_org_id()
                         and (ci.id = bl.item_id or ci.item_code = bl.component_code)
                   left join public.v_item_effective_cost vec on vec.item_id = ci.id
                  where bl.org_id = app.current_org_id()
                    and bl.bom_header_id = lb.id
                    and vec.amount is not null) as currency
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
