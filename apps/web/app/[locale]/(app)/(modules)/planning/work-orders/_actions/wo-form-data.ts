'use server';

/**
 * P2-PLANNING — thin read helpers for the WO create modal.
 *
 * The reviewed write actions (createWorkOrder / releaseWorkOrder) and the list /
 * detail reads (listPlanningWorkOrders / getPlanningWorkOrder) live alongside this
 * file and are imported verbatim — never rewritten. The create modal additionally
 * needs two SMALL org-scoped reads that no existing action surfaces:
 *
 *   1. searchFgProducts — the product picker is restricted to FINISHED GOODS
 *      (item_type = 'fg'). The shared `searchItems` action (npd) only accepts
 *      rm/ingredient/intermediate/co_product/packaging — never 'fg' — so it
 *      cannot back an fg-only picker. This is a tiny dedicated read.
 *   2. listProductionResources — the line/machine selects load from the real
 *      public.production_lines / public.machines masters (seeded by migration
 *      259), never a hardcoded list.
 *
 * Both run inside withOrgContext as app_user with app.set_org_context applied, so
 * RLS (org_id = app.current_org_id()) scopes every row. No service-role bypass,
 * no mocks. createWorkOrder validates productId is a uuid + that the item resolves,
 * so these helpers are convenience reads only — the source of truth stays in the
 * reviewed write action.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type FgProductOption = {
  id: string;
  itemCode: string;
  name: string;
  uomBase: string;
};

export type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
};

export type ProductionMachineOption = {
  id: string;
  code: string;
  name: string;
  machineType: string;
};

export type ProductionResources = {
  lines: ProductionLineOption[];
  machines: ProductionMachineOption[];
};

const searchInput = z.object({
  query: z.string().trim().max(120).optional().default(''),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export type SearchFgProductsInput = z.input<typeof searchInput>;

/** Search active finished-goods items (org-scoped) by code or name. */
export async function searchFgProducts(input: SearchFgProductsInput = {}): Promise<FgProductOption[]> {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return [];
  const { query, limit } = parsed.data;
  const term = query.trim();
  const like = term.length > 0 ? `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;

  return withOrgContext<FgProductOption[]>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const { rows } = await client.query<{
      id: string;
      item_code: string;
      name: string;
      uom_base: string;
    }>(
      `select i.id, i.item_code, i.name, i.uom_base
         from public.items i
        where i.org_id = app.current_org_id()
          and i.item_type = 'fg'
          and i.status <> 'blocked'
          and (
            $1::text is null
            or i.item_code ilike $1 escape '\\'
            or i.name ilike $1 escape '\\'
          )
        order by
          case when $1::text is not null and i.item_code ilike $1 escape '\\' then 0 else 1 end,
          i.updated_at desc,
          i.item_code asc
        limit $2`,
      [like, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      itemCode: r.item_code,
      name: r.name,
      uomBase: r.uom_base,
    }));
  });
}

/** Load the org's active production lines + machines for the create-modal selects. */
export async function listProductionResources(): Promise<ProductionResources> {
  return withOrgContext<ProductionResources>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const [lines, machines] = await Promise.all([
      client.query<{ id: string; code: string; name: string }>(
        `select id, code, name
           from public.production_lines
          where org_id = app.current_org_id()
            and status = 'active'
          order by code`,
      ),
      client.query<{ id: string; code: string; name: string; machine_type: string }>(
        `select id, code, name, machine_type
           from public.machines
          where org_id = app.current_org_id()
            and status = 'active'
          order by code`,
      ),
    ]);
    return {
      lines: lines.rows.map((r) => ({ id: r.id, code: r.code, name: r.name })),
      machines: machines.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        machineType: r.machine_type,
      })),
    };
  });
}
