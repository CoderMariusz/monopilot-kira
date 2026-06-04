'use server';

/**
 * T-046 — 03-technical Shelf Life Config (TEC-030): list Server Action.
 *
 * Org-scoped read of the finished-good (`item_type = 'fg'`) shelf-life config
 * stored on public.items (shelf_life_days / shelf_life_mode / date_code_format,
 * migration 153), under withOrgContext + RLS (`app.current_org_id()`). No
 * service-role bypass, no hardcoded data. Also resolves whether the caller may
 * edit (override) shelf-life so the page renders the Override actions only when
 * the real `technical.items.edit` permission resolves.
 *
 * Shelf-life is a per-FG attribute of the canonical item master — there is no
 * separate shelf-life table — so this reads the FG slice of `items`.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ITEMS_EDIT_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  type ShelfLifeConfigRow,
  type ShelfLifeMode,
  SHELF_LIFE_MODES,
} from './shared';

export type ListShelfLifeState = 'ready' | 'empty' | 'error';

export type ListShelfLifeResult = {
  rows: ShelfLifeConfigRow[];
  canEdit: boolean;
  state: ListShelfLifeState;
  kpis: {
    products: number;
    useBy: number;
    bestBefore: number;
    unconfigured: number;
  };
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  shelf_life_days: number | string | null;
  shelf_life_mode: string | null;
  date_code_format: string | null;
  product_group: string | null;
  updated_at: string | Date;
};

const SHELF_LIFE_MODE_SET = new Set<ShelfLifeMode>(SHELF_LIFE_MODES);

function mapRow(row: ItemRow): ShelfLifeConfigRow {
  const mode =
    row.shelf_life_mode && SHELF_LIFE_MODE_SET.has(row.shelf_life_mode as ShelfLifeMode)
      ? (row.shelf_life_mode as ShelfLifeMode)
      : null;
  const days =
    row.shelf_life_days === null || row.shelf_life_days === undefined
      ? null
      : Number(row.shelf_life_days);
  return {
    id: String(row.id),
    itemCode: row.item_code,
    name: row.name,
    shelfLifeDays: Number.isFinite(days as number) ? (days as number) : null,
    shelfLifeMode: mode,
    dateCodeFormat: row.date_code_format,
    productGroup: row.product_group,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listShelfLife(): Promise<ListShelfLifeResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListShelfLifeResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const [itemsResult, canEdit] = await Promise.all([
        (client as QueryClient).query<ItemRow>(
          `select id, item_code, name, shelf_life_days, shelf_life_mode,
                  date_code_format, product_group, updated_at
             from public.items
            where org_id = app.current_org_id()
              and item_type = 'fg'
            order by item_code asc`,
        ),
        hasPermission(ctx, ITEMS_EDIT_PERMISSION),
      ]);

      const rows = itemsResult.rows.map(mapRow);
      const kpis = {
        products: rows.length,
        useBy: rows.filter((r) => r.shelfLifeMode === 'use_by').length,
        bestBefore: rows.filter((r) => r.shelfLifeMode === 'best_before').length,
        unconfigured: rows.filter((r) => r.shelfLifeDays === null).length,
      };

      return {
        rows,
        canEdit,
        state: rows.length ? 'ready' : 'empty',
        kpis,
      };
    });
  } catch (error) {
    console.error('[technical/shelf-life] listShelfLife load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      rows: [],
      canEdit: false,
      state: 'error',
      kpis: { products: 0, useBy: 0, bestBefore: 0, unconfigured: 0 },
    };
  }
}
