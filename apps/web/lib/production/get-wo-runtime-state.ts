/**
 * 08-Production E1 — WO detail / runtime-state read (T-016 + T-021).
 *
 * Aggregates the materialized execution state + BOM-snapshot consumption progress
 * + output progress for one WO. Read-only (no outbox / no mutation). RLS-scoped
 * to app.current_org_id() so cross-tenant WOs are invisible (return not_found).
 *
 * consumption_progress_pct = per-UoM when mixed; single scalar only when one UoM.
 * output_progress_pct = sum(wo_outputs.qty_kg) / planned_quantity.
 *
 * NUMERIC-exact: the totals (sum required/consumed/output) and the per-component
 * `remaining` are computed IN SQL as NUMERIC — never round-tripped through JS
 * binary float. The progress percentages are likewise computed in SQL (rounded to
 * 1 dp there) so the gate-relevant math is exact decimal end-to-end; JS only reads
 * the already-rounded percentage. Per-row kg are returned as the exact decimal
 * STRINGS the pg driver yields (no Number()).
 */

import {
  type ProductionContext,
  type ProductionResult,
  type WoState,
  fail,
  hasPermission,
} from './shared';
import { summarizeConsumptionProgress } from './consumption-progress';

export type WoComponentProgress = {
  componentId: string;
  plannedQty: string;
  consumedQty: string;
  remainingQty: string;
};

export type WoOutputProgress = {
  outputType: string;
  qtyKg: string;
  lpId: string | null;
  batchNumber: string;
};

export type WoRuntimeState = {
  woId: string;
  status: WoState;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMin: number | null;
  /** Null when the WO BOM mixes UoMs (kg + pcs) — never sum unlike units. */
  consumptionProgressPct: number | null;
  consumptionMixedUnits: boolean;
  consumptionByUom: Array<{ uom: string; progressPct: number; consumedQty: string; requiredQty: string }>;
  outputProgressPct: number;
  components: WoComponentProgress[];
  outputs: WoOutputProgress[];
};

export async function getWoRuntimeState(
  ctx: ProductionContext,
  woId: string,
): Promise<ProductionResult<WoRuntimeState>> {
  if (!(await hasPermission(ctx, 'production.oee.read'))) return fail('forbidden');

  const client = ctx.client;

  const wo = await client.query<{
    id: string;
    planned_quantity: string;
    started_at: string | Date | null;
    completed_at: string | Date | null;
  }>(
    `select w.id, w.planned_quantity, e.started_at, e.completed_at
       from public.work_orders w
       left join public.wo_executions e
         on e.org_id = w.org_id and e.wo_id = w.id
      where w.org_id = app.current_org_id() and w.id = $1::uuid`,
    [woId],
  );
  if (wo.rows.length === 0) return fail('not_found');
  const woRow = wo.rows[0]!;

  const exec = await client.query<{ status: string; version: number }>(
    `select status, version
       from public.wo_executions
      where org_id = app.current_org_id() and wo_id = $1::uuid`,
    [woId],
  );
  const status = (exec.rows[0]?.status ?? 'planned') as WoState;
  const version = Number(exec.rows[0]?.version ?? 0);

  // Per-component progress. `remaining` is computed in SQL (NUMERIC) so the
  // subtraction never passes through JS binary float; the kg are the exact
  // decimal strings the driver returns.
  const materials = await client.query<{
    product_id: string;
    required_qty: string;
    consumed_qty: string;
    remaining_qty: string;
    uom: string;
  }>(
    `select product_id,
            required_qty,
            consumed_qty,
            uom,
            to_char(required_qty - consumed_qty, 'FM999999999990.000') as remaining_qty
       from public.wo_materials
      where org_id = app.current_org_id() and wo_id = $1::uuid
      order by sequence asc`,
    [woId],
  );

  const outputs = await client.query<{
    output_type: string;
    qty_kg: string;
    lp_id: string | null;
    batch_number: string;
  }>(
    `select output_type, qty_kg, lp_id, batch_number
       from public.wo_outputs
      where org_id = app.current_org_id() and wo_id = $1::uuid
      order by output_type asc`,
    [woId],
  );

  const components: WoComponentProgress[] = materials.rows.map((m) => ({
    componentId: String(m.product_id),
    plannedQty: String(m.required_qty),
    consumedQty: String(m.consumed_qty),
    remainingQty: m.remaining_qty,
  }));

  const outputRows: WoOutputProgress[] = outputs.rows.map((o) => ({
    outputType: o.output_type,
    qtyKg: String(o.qty_kg),
    lpId: o.lp_id,
    batchNumber: o.batch_number,
  }));

  // Per-UoM consumption progress — never sum kg + pcs into one scalar.
  const consumptionSummary = summarizeConsumptionProgress(materials.rows);

  const progress = await client.query<{
    output_pct: string | null;
  }>(
    `select
       (select case when $2::numeric > 0
                    then round(coalesce(sum(qty_kg), 0) / $2::numeric * 100, 1)
                    else 0 end
          from public.wo_outputs
         where org_id = app.current_org_id() and wo_id = $1::uuid) as output_pct`,
    [woId, woRow.planned_quantity],
  );
  const consumptionProgressPct = consumptionSummary.progressPct;
  const outputProgressPct = Number(progress.rows[0]?.output_pct ?? 0);

  const startedAt = toIso(woRow.started_at);
  const completedAt = toIso(woRow.completed_at);
  const elapsedMin =
    startedAt != null
      ? Math.round(
          ((completedAt ? Date.parse(completedAt) : Date.now()) - Date.parse(startedAt)) / 60000,
        )
      : null;

  return {
    ok: true,
    data: {
      woId,
      status,
      version,
      startedAt,
      completedAt,
      elapsedMin,
      consumptionProgressPct,
      consumptionMixedUnits: consumptionSummary.mixedUnits,
      consumptionByUom: consumptionSummary.byUom,
      outputProgressPct,
      components,
      outputs: outputRows,
    },
  };
}

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
