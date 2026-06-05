/**
 * 08-Production E1 — WO detail / runtime-state read (T-016 + T-021).
 *
 * Aggregates the materialized execution state + BOM-snapshot consumption progress
 * + output progress for one WO. Read-only (no outbox / no mutation). RLS-scoped
 * to app.current_org_id() so cross-tenant WOs are invisible (return not_found).
 *
 * consumption_progress_pct = sum(consumed) / sum(required) over wo_materials.
 * output_progress_pct = sum(wo_outputs.qty_kg) / planned_quantity.
 */

import {
  type ProductionContext,
  type ProductionResult,
  type WoState,
  fail,
  hasPermission,
} from './shared';

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
  consumptionProgressPct: number;
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
    `select id, planned_quantity, started_at, completed_at
       from public.work_orders
      where org_id = app.current_org_id() and id = $1::uuid`,
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

  const materials = await client.query<{
    product_id: string;
    required_qty: string;
    consumed_qty: string;
  }>(
    `select product_id, required_qty, consumed_qty
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

  // NUMERIC-exact aggregation (string → Number only at the percentage boundary).
  let sumRequired = 0;
  let sumConsumed = 0;
  const components: WoComponentProgress[] = materials.rows.map((m) => {
    const req = Number(m.required_qty);
    const con = Number(m.consumed_qty);
    sumRequired += req;
    sumConsumed += con;
    return {
      componentId: String(m.product_id),
      plannedQty: String(m.required_qty),
      consumedQty: String(m.consumed_qty),
      remainingQty: (req - con).toFixed(3),
    };
  });

  let sumOutput = 0;
  const outputRows: WoOutputProgress[] = outputs.rows.map((o) => {
    sumOutput += Number(o.qty_kg);
    return {
      outputType: o.output_type,
      qtyKg: String(o.qty_kg),
      lpId: o.lp_id,
      batchNumber: o.batch_number,
    };
  });

  const consumptionProgressPct =
    sumRequired > 0 ? round1((sumConsumed / sumRequired) * 100) : 0;
  const plannedQty = Number(woRow.planned_quantity);
  const outputProgressPct = plannedQty > 0 ? round1((sumOutput / plannedQty) * 100) : 0;

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
      outputProgressPct,
      components,
      outputs: outputRows,
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
