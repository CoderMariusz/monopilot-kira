'use server';

/**
 * 03-technical Cost History (T-021): GET the cost-roll history for an item.
 *
 * Org-scoped read of public.item_cost_history under withOrgContext + RLS
 * (`app.current_org_id()`). Rows are ordered effective_from DESC (AC4 + the
 * idx_item_cost_active index). cost_per_kg is returned as a string to preserve
 * NUMERIC exactness — never coerced to a JS float.
 *
 * Read access is gated on `technical.cost.edit` (the Technical cost surface is
 * an admin/cost-editor surface; there is no separate cost.read string in the
 * `technical.*` family — PRD §3). A caller without it gets `forbidden`.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  COST_EDIT_PERMISSION,
  type CostHistoryRow,
  type CostSource,
  hasPermission,
  ListCostHistoryInput,
  type ListCostHistoryResult,
  type OrgActionContext,
  type QueryClient,
} from './shared';

type HistoryDbRow = {
  id: string;
  item_id: string;
  cost_per_kg: string;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string | Date;
};

const SOURCE_SET = new Set<CostSource>(['manual', 'd365_sync', 'supplier_update', 'variance_roll']);

function mapRow(row: HistoryDbRow): CostHistoryRow {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    costPerKg: row.cost_per_kg,
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    source: row.source && SOURCE_SET.has(row.source as CostSource) ? (row.source as CostSource) : null,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function listCostHistory(rawInput: unknown): Promise<ListCostHistoryResult> {
  const parsed = ListCostHistoryInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListCostHistoryResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, COST_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<HistoryDbRow>(
        `select id,
                item_id,
                cost_per_kg::text as cost_per_kg,
                currency,
                effective_from::text as effective_from,
                effective_to::text as effective_to,
                source,
                created_by::text as created_by,
                created_at
           from public.item_cost_history
          where org_id = app.current_org_id()
            and item_id = $1::uuid
          order by effective_from desc, created_at desc`,
        [input.itemId],
      );

      return { ok: true, data: { rows: rows.map(mapRow) } };
    });
  } catch (error) {
    console.error('[technical/cost] listCostHistory load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
