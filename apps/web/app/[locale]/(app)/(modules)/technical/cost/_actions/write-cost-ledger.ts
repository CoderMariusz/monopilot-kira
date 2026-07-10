/**
 * Shared canonical item-cost ledger writer.
 *
 * This is the single implementation behind Technical cost writes: it inserts
 * item_cost_history, applies V-TEC-53 in SQL NUMERIC space, and denormalizes
 * items.cost_per_kg from the same string-bound ::numeric value.
 *
 * Interval surgery (Wave 10): backdated effective_from values split or close
 * neighboring rows so ranges never overlap and exactly one open (latest) row
 * remains.
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

type CostIntervalAnchor = {
  open_id: string | null;
  open_from: string | null;
  next_from: string | null;
  containing_id: string | null;
  containing_from: string | null;
};

async function resolveEffectiveDate(qc: QueryClient, effectiveFrom?: string): Promise<string> {
  if (effectiveFrom) return effectiveFrom;
  const { rows } = await qc.query<{ eff_date: string }>(`select current_date::text as eff_date`);
  return rows[0]?.eff_date ?? new Date().toISOString().slice(0, 10);
}

async function loadIntervalAnchors(
  qc: QueryClient,
  itemId: string,
  effDate: string,
): Promise<CostIntervalAnchor> {
  const { rows } = await qc.query<CostIntervalAnchor>(
    `select
       (select ch.id::text
          from public.item_cost_history ch
         where ch.org_id = app.current_org_id()
           and ch.item_id = $1::uuid
           and ch.effective_to is null
         order by ch.effective_from desc
         limit 1) as open_id,
       (select ch.effective_from::text
          from public.item_cost_history ch
         where ch.org_id = app.current_org_id()
           and ch.item_id = $1::uuid
           and ch.effective_to is null
         order by ch.effective_from desc
         limit 1) as open_from,
       (select ch.effective_from::text
          from public.item_cost_history ch
         where ch.org_id = app.current_org_id()
           and ch.item_id = $1::uuid
           and ch.effective_from > $2::date
         order by ch.effective_from asc
         limit 1) as next_from,
       (select ch.id::text
          from public.item_cost_history ch
         where ch.org_id = app.current_org_id()
           and ch.item_id = $1::uuid
           and ch.effective_from <= $2::date
           and (ch.effective_to is null or ch.effective_to >= $2::date)
         order by ch.effective_from desc
         limit 1) as containing_id,
       (select ch.effective_from::text
          from public.item_cost_history ch
         where ch.org_id = app.current_org_id()
           and ch.item_id = $1::uuid
           and ch.effective_from <= $2::date
           and (ch.effective_to is null or ch.effective_to >= $2::date)
         order by ch.effective_from desc
         limit 1) as containing_from`,
    [itemId, effDate],
  );
  return rows[0] ?? {
    open_id: null,
    open_from: null,
    next_from: null,
    containing_id: null,
    containing_from: null,
  };
}

async function closeHistoryRowAt(qc: QueryClient, rowId: string, effDate: string): Promise<void> {
  await qc.query(
    `update public.item_cost_history
        set effective_to = greatest(($2::date - interval '1 day')::date, effective_from)
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [rowId, effDate],
  );
}

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

  const effDate = await resolveEffectiveDate(qc, input.effectiveFrom);
  const anchor = await loadIntervalAnchors(qc, input.itemId, effDate);

  if (anchor.open_id && anchor.open_from && effDate > anchor.open_from) {
    await closeHistoryRowAt(qc, anchor.open_id, effDate);
  }

  if (anchor.containing_id && anchor.containing_from && anchor.containing_from < effDate) {
    const closedByForward =
      anchor.open_id === anchor.containing_id && anchor.open_from != null && effDate > anchor.open_from;
    if (!closedByForward) {
      await closeHistoryRowAt(qc, anchor.containing_id, effDate);
    }
  }

  if (anchor.containing_id && anchor.containing_from === effDate) {
    await qc.query(
      `delete from public.item_cost_history
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [anchor.containing_id],
    );
  }

  const { rows: nextCloseRows } = anchor.next_from
    ? await qc.query<{ effective_to: string }>(
        `select ($1::date - interval '1 day')::date::text as effective_to`,
        [anchor.next_from],
      )
  : { rows: [{ effective_to: null as unknown as string }] };
  const effectiveTo = anchor.next_from ? (nextCloseRows[0]?.effective_to ?? null) : null;
  const becomesActive = effectiveTo == null;

  const { rows: inserted } = await qc.query<{ id: string; effective_from: string }>(
    `insert into public.item_cost_history
       (org_id, item_id, cost_per_kg, currency, effective_from, effective_to, source, created_by)
     values
       (app.current_org_id(), $1::uuid, $2::numeric, $3, $4::date, $5::date, $6, $7::uuid)
     returning id, effective_from::text as effective_from`,
    [input.itemId, input.costPerKg, input.currency, effDate, effectiveTo, input.source, userId],
  );
  const row = inserted[0];
  if (!row) return { ok: false, error: 'persistence_failed' };

  if (becomesActive) {
    await qc.query(
      `update public.items
          set cost_per_kg = $2::numeric
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [input.itemId, input.costPerKg],
    );
  }

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
      effectiveTo,
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
