/**
 * Shared canonical item-cost ledger writer.
 *
 * This is the single implementation behind Technical cost writes: it inserts
 * item_cost_history, applies V-TEC-53 in SQL NUMERIC space, and denormalizes
 * items.cost_per_kg from the same string-bound ::numeric value.
 */

import {
  APPROVER_GUARDED_SOURCES,
  HIGH_VARIANCE_RATIO,
  type CostSource,
  type QueryClient,
  writeAudit,
} from './shared';

export type WriteItemCostLedgerInput = {
  itemId: string;
  costPerKg: string;
  currency: string;
  effectiveFrom?: string;
  source: CostSource;
  approverUserId?: string;
  notes?: string;
};

export type WriteItemCostLedgerResult =
  | { ok: true; data: { id: string; itemId: string; itemCode: string; costPerKg: string; effectiveFrom: string } }
  | { ok: false; error: 'not_found' | 'approver_required' | 'persistence_failed'; message?: string };

export async function writeItemCostLedger(
  qc: QueryClient,
  params: {
    orgId: string;
    userId: string;
    input: WriteItemCostLedgerInput;
  },
): Promise<WriteItemCostLedgerResult> {
  const { orgId, userId, input } = params;

  const { rows: itemRows } = await qc.query<{ id: string; item_code: string; current_cost: string | null }>(
    `select i.id,
            i.item_code,
            (select ch.cost_per_kg::text
               from public.item_cost_history ch
              where ch.org_id = app.current_org_id()
                and ch.item_id = i.id
                and ch.effective_to is null
              order by ch.effective_from desc
              limit 1) as current_cost
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $1::uuid`,
    [input.itemId],
  );
  const item = itemRows[0];
  if (!item) return { ok: false, error: 'not_found' };

  if (APPROVER_GUARDED_SOURCES.has(input.source) && item.current_cost !== null && !input.approverUserId) {
    const { rows: guardRows } = await qc.query<{ exceeds: boolean }>(
      `select (
         $1::numeric > 0
         and (abs($2::numeric - $1::numeric) / $1::numeric) > $3::numeric
       ) as exceeds`,
      [item.current_cost, input.costPerKg, HIGH_VARIANCE_RATIO],
    );
    if (guardRows[0]?.exceeds) {
      return { ok: false, error: 'approver_required', message: 'cost change > 20% requires an approver (V-TEC-53)' };
    }
  }

  const effectiveFromExpr = input.effectiveFrom ? '$2::date' : 'current_date';
  const closeParams: unknown[] = input.effectiveFrom ? [input.itemId, input.effectiveFrom] : [input.itemId];
  await qc.query(
    `update public.item_cost_history
        set effective_to = greatest(
              (${effectiveFromExpr} - interval '1 day')::date,
              effective_from
            )
      where org_id = app.current_org_id()
        and item_id = $1::uuid
        and effective_to is null`,
    closeParams,
  );

  const insertParams: unknown[] = input.effectiveFrom
    ? [input.itemId, input.costPerKg, input.currency, input.source, userId, input.effectiveFrom]
    : [input.itemId, input.costPerKg, input.currency, input.source, userId];
  const { rows: inserted } = await qc.query<{ id: string; effective_from: string }>(
    `insert into public.item_cost_history
       (org_id, item_id, cost_per_kg, currency, effective_from, source, created_by)
     values
       (app.current_org_id(), $1::uuid, $2::numeric, $3, ${effectiveFromExpr}, $4, $5::uuid)
     returning id, effective_from::text as effective_from`,
    insertParams,
  );
  const row = inserted[0];
  if (!row) return { ok: false, error: 'persistence_failed' };

  await qc.query(
    `update public.items
        set cost_per_kg = $2::numeric
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [input.itemId, input.costPerKg],
  );

  await writeAudit(qc, {
    orgId,
    actorUserId: userId,
    action: 'item_cost.recorded',
    resourceId: row.id,
    beforeState: { costPerKg: item.current_cost },
    afterState: {
      itemId: input.itemId,
      costPerKg: input.costPerKg,
      currency: input.currency,
      effectiveFrom: row.effective_from,
      source: input.source,
      approverUserId: input.approverUserId ?? null,
      notes: input.notes ?? null,
    },
  });

  return {
    ok: true,
    data: { id: row.id, itemId: input.itemId, itemCode: item.item_code, costPerKg: input.costPerKg, effectiveFrom: row.effective_from },
  };
}
