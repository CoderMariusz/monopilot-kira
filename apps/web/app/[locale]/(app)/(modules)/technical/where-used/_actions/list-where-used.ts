'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from '../../cost/_actions/shared';

type WhereUsedRow = {
  fg_code: string;
  fg_name: string | null;
  component_qty: string;
  component_uom: string;
};

type WhereUsedResult = {
  fg_code: string;
  fg_name: string;
  component_qty: number;
  component_uom: string;
};

export async function listWhereUsed(rawCode: unknown): Promise<WhereUsedResult[]> {
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!code) return [];

  try {
    return await withOrgContext(async ({ client }): Promise<WhereUsedResult[]> => {
      const qc = client as QueryClient;
      const { rows } = await qc.query<WhereUsedRow>(
        `select distinct on (i.item_code)
                i.item_code as fg_code,
                i.name as fg_name,
                bl.quantity::text as component_qty,
                bl.uom as component_uom
           from public.bom_lines bl
           join public.bom_headers ph
             on ph.id = bl.bom_header_id and ph.org_id = bl.org_id
           left join public.items i
             on i.org_id = ph.org_id and i.id = ph.item_id
          where bl.org_id = app.current_org_id()
            and bl.component_code = $1
            and ph.status = 'active'
            and ph.item_id is not null
            and ph.item_id <> (
              select id
                from public.items
               where org_id = app.current_org_id()
                 and item_code = $1
            )
          order by i.item_code, ph.version desc
          limit 100`,
        [code],
      );

      return rows.map((row) => ({
        fg_code: row.fg_code,
        fg_name: row.fg_name ?? '',
        component_qty: Number(row.component_qty),
        component_uom: row.component_uom,
      }));
    });
  } catch (error) {
    console.error('[technical/where-used] listWhereUsed load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
