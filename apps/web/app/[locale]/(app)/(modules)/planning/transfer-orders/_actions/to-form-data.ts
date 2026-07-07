'use server';

/**
 * P2-PLANNING — thin read helpers for the Transfer Order list + create modal.
 *
 * The reviewed write/read actions (listTransferOrders / getTransferOrder /
 * createTransferOrder / transitionTransferOrderStatus in ./actions.ts) are
 * imported verbatim — never rewritten. They expose from_warehouse_id /
 * to_warehouse_id as SOFT uuid refs (mig 263, no DB FK by design) and never
 * surface warehouse NAMES, so the list + create UI needs two SMALL org-scoped
 * reads that no existing action provides:
 *
 *   1. listTransferWarehouses — the From / To selects + the list "From"/"To"
 *      columns need human-readable warehouse codes/names. We look them up from
 *      public.warehouses (mig 042), org-scoped, never a hardcoded list.
 *   2. searchTransferItems — the line editor product picker reuses the
 *      established ItemPicker combobox over the REAL items master. A transfer
 *      can move ANY stock item (the prototype line picker is "RM / intermediate
 *      / FA"), so unlike the WO picker (fg only) this fans out across every
 *      stock item type. Never free text, never a hardcoded list.
 *
 * Both run inside withOrgContext as app_user with app.set_org_context applied,
 * so RLS (org_id = app.current_org_id()) scopes every row. No service-role
 * bypass, no mocks. createTransferOrder remains the source of truth: it
 * re-validates each itemId is a uuid, so these helpers are convenience reads.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';
import { listOrgUnits, type OrgUnitOption, type QueryClient } from '../../_actions/procurement-shared';

export type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

/** Load the org's warehouses for the From/To selects + list name lookups. */
export async function listTransferWarehouses(): Promise<WarehouseOption[]> {
  return withOrgContext<WarehouseOption[]>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const { rows } = await client.query<{ id: string; code: string; name: string }>(
      `select id, code, name
         from public.warehouses
        where org_id = app.current_org_id()
        order by code`,
    );
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  });
}

/**
 * Per-TO line counts for the list "Lines" column. listTransferOrders returns
 * headers only (no aggregate), so this is a single grouped count, org-scoped.
 */
export async function listTransferOrderLineCounts(): Promise<Record<string, number>> {
  return withOrgContext<Record<string, number>>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const { rows } = await client.query<{ to_id: string; n: string }>(
      `select to_id, count(*)::text as n
         from public.transfer_order_lines
        where org_id = app.current_org_id()
        group by to_id`,
    );
    const map: Record<string, number> = {};
    for (const r of rows) map[r.to_id] = Number(r.n);
    return map;
  });
}

/**
 * Active units of measure for the TO line UoM picker, read from the REAL
 * public.unit_of_measure master (org-scoped). Replaces the page's old hardcoded
 * {kg,g,l,…} list, so units an admin adds in Settings → Units appear here. Falls
 * back to an empty list (the caller then keeps the canonical defaults) on read
 * failure rather than throwing.
 */
export async function listTransferUnits(): Promise<OrgUnitOption[]> {
  try {
    return await withOrgContext<OrgUnitOption[]>(async (ctx) =>
      listOrgUnits(ctx.client as unknown as QueryClient),
    );
  } catch {
    return [];
  }
}

const searchInput = z.object({
  query: z.string().trim().max(120).optional().default(''),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export type SearchTransferItemsInput = z.input<typeof searchInput>;

/**
 * Search active stock items (org-scoped) for a transfer line. A transfer can
 * move any stock item, so this fans out across every item type (excluding
 * blocked items). Empty query returns the most-recently-updated items so the
 * picker is never blank on first open.
 */
export async function searchTransferItems(input: SearchTransferItemsInput = {}): Promise<ItemPickerOption[]> {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return [];
  const { query, limit } = parsed.data;
  const term = query.trim();
  const like = term.length > 0 ? `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;

  return withOrgContext<ItemPickerOption[]>(async (ctx) => {
    const client = ctx.client as unknown as QueryClient;
    const { rows } = await client.query<{
      id: string;
      item_code: string;
      name: string;
      item_type: string;
      status: string;
      cost_per_kg: string | null;
      uom_base: string;
    }>(
      `select i.id, i.item_code, i.name, i.item_type, i.status, i.cost_per_kg, i.uom_base
         from public.items i
        where i.org_id = app.current_org_id()
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
      itemType: r.item_type,
      status: r.status,
      costPerKgEur: r.cost_per_kg,
      uomBase: r.uom_base,
    }));
  });
}
