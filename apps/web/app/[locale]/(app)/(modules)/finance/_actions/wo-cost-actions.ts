'use server';

/**
 * 10-Finance read-only WO actual costing.
 *
 * Cost-source inspection and resolution decisions:
 * - Materials: public.wo_material_consumption.qty_consumed joined to public.items by
 *   component_id; `items.cost_per_kg` is the technical/finance dual-owned master.
 * - Process costing: process rows are JSON-backed reference rows in
 *   public.reference_tables where table_code='processes' (migrations 269/276),
 *   not a physical processes table. Today the WO has no process FK, so resolution
 *   is conservative: lowest-sequence wo_operations.operation_name matches, case
 *   insensitively, against reference row_data.name, row_data.process_code, or row_key.
 *   If that path does not find an active row with cost_rate, labor is honest null.
 * - Runtime: the OEE producer's exact window rule is reused for downtime overlap
 *   merging via totalDowntimeMinutes(); runtime = started/completed minus merged
 *   downtime for that WO. We do not write or read oee_snapshots here.
 * - Waste: public.wo_waste_log.qty_kg is costed at the weighted average material
 *   cost of the same WO consumption rows. If no material cost basis exists, waste
 *   cost is 0.0000 rather than inventing a valuation.
 * - Outputs: public.wo_outputs.qty_kg is the completed WO output denominator;
 *   costPerKgOutput is null when output kg is zero.
 *
 * READ ONLY: no postings, no new tables, no valuation snapshots, no D365.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { totalDowntimeMinutes } from '../../../../../../lib/production/oee-snapshot-producer';
import { microToFixed, toMicro, MICRO_SCALE } from '../../../../../../lib/shared/decimal';
import {
  computeWoActualCostTotals,
  type WoActualCostLabor,
  type WoActualCostMaterial,
} from './wo-cost-math';

const FINANCE_COSTS_READ_PERMISSION = 'fin.costs.read';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type FinanceContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type FinanceActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error'; message?: string };

export type WoActualCost = {
  woId: string;
  woNumber: string;
  product: { itemCode: string | null; name: string | null };
  outputKg: string;
  materials: WoActualCostMaterial[];
  materialsTotal: string;
  labor: WoActualCostLabor | null;
  machineCost: string;
  setupCost: string;
  wasteCost: string;
  totalCost: string;
  costPerKgOutput: string | null;
  processResolution: {
    operationName: string | null;
    processRowKey: string | null;
    costMode: 'per_hour' | 'per_run' | null;
    currency: string | null;
    note: string;
  };
};

export type WoCostSummaryRow = WoActualCost & {
  completedAt: string | null;
};

export type CompletedWoCostsSummary = {
  days: number;
  rows: WoCostSummaryRow[];
};

type MaterialRow = {
  item_code: string | null;
  qty_kg: string;
  cost_per_kg: string | null;
};

type WoBaseRow = {
  wo_id: string;
  wo_number: string;
  product_code: string | null;
  product_name: string | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  output_kg: string;
  waste_kg: string;
};

type ProcessRow = {
  operation_name: string | null;
  row_key: string | null;
  cost_mode: 'per_hour' | 'per_run' | null;
  cost_rate: string | null;
  currency: string | null;
  staffing_count: string | null;
  setup_cost: string | null;
};

type DowntimeRow = {
  started_at: string | Date;
  ended_at: string | Date | null;
};

function iso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function minutesBetween(start: string | Date | null, end: string | Date | null): string {
  if (start == null || end == null) return '0';
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return '0';
  const elapsedMs = BigInt(endMs - startMs);
  const minuteMicros = (elapsedMs * MICRO_SCALE + 30_000n) / 60_000n;
  return microToFixed(minuteMicros, 6);
}

function clampRuntime(runtimeMin: string, downtimeMin: number): string {
  const runtime = toMicro(runtimeMin);
  if (runtime <= 0n) return '0';
  const downtime = toMicro(Math.max(0, downtimeMin).toFixed(6));
  const actual = runtime > downtime ? runtime - downtime : 0n;
  return microToFixed(actual, 6);
}

function asDays(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? Math.min(value, 365)
    : fallback;
}

async function hasFinancePermission(
  ctx: FinanceContext,
  permission: string,
): Promise<boolean> {
  const res = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r
         on r.id = ur.role_id
        and r.org_id = $2::uuid
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return (res.rowCount ?? res.rows.length) > 0;
}

async function computeWoActualCostInContext(
  ctx: FinanceContext,
  woId: string,
): Promise<FinanceActionResult<WoActualCost>> {
  if (!(await hasFinancePermission(ctx, FINANCE_COSTS_READ_PERMISSION))) {
    return { ok: false, reason: 'forbidden' };
  }

  const base = await ctx.client.query<WoBaseRow>(
    `select wo.id::text as wo_id,
            wo.wo_number,
            i.item_code as product_code,
            i.name as product_name,
            coalesce(x.started_at, wo.started_at) as started_at,
            coalesce(x.completed_at, wo.completed_at) as completed_at,
            coalesce(sum(o.qty_kg), 0)::text as output_kg,
            coalesce(w.waste_kg, 0)::text as waste_kg
       from public.work_orders wo
       left join public.wo_executions x
         on x.org_id = app.current_org_id()
        and x.wo_id = wo.id
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = wo.product_id
       left join public.wo_outputs o
         on o.org_id = app.current_org_id()
        and o.wo_id = wo.id
       left join (
         select wo_id, sum(qty_kg)::text as waste_kg
           from public.wo_waste_log
          where org_id = app.current_org_id()
          group by wo_id
       ) w on w.wo_id = wo.id
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
        and (
          wo.status in ('COMPLETED', 'CLOSED')
          or x.status in ('completed', 'closed')
        )
      group by wo.id, wo.wo_number, i.item_code, i.name, x.started_at, x.completed_at, w.waste_kg`,
    [woId],
  );
  const wo = base.rows[0];
  if (!wo) return { ok: false, reason: 'not_found' };

  const materials = await ctx.client.query<MaterialRow>(
    `select coalesce(i.item_code, c.component_id::text) as item_code,
            sum(c.qty_consumed)::text as qty_kg,
            max(i.cost_per_kg)::text as cost_per_kg
       from public.wo_material_consumption c
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = c.component_id
      where c.org_id = app.current_org_id()
        and c.wo_id = $1::uuid
      group by coalesce(i.item_code, c.component_id::text)
      order by coalesce(i.item_code, c.component_id::text)`,
    [woId],
  );

  const process = await ctx.client.query<ProcessRow>(
    `with op as (
       select operation_name
         from public.wo_operations
        where org_id = app.current_org_id()
          and wo_id = $1::uuid
        order by sequence asc
        limit 1
     )
     select op.operation_name,
            rt.row_key,
            coalesce(rt.row_data ->> 'cost_mode', 'per_hour')::text as cost_mode,
            nullif(rt.row_data ->> 'cost_rate', '') as cost_rate,
            coalesce(nullif(rt.row_data ->> 'currency', ''), 'EUR') as currency,
            nullif(rt.row_data ->> 'staffing_count', '') as staffing_count,
            nullif(rt.row_data ->> 'setup_cost', '') as setup_cost
       from op
       left join public.reference_tables rt
         on rt.org_id = app.current_org_id()
        and rt.table_code = 'processes'
        and rt.is_active = true
        and lower(op.operation_name) in (
          lower(rt.row_key),
          lower(coalesce(rt.row_data ->> 'name', '')),
          lower(coalesce(rt.row_data ->> 'process_code', ''))
        )
      limit 1`,
    [woId],
  );
  const processRow = process.rows[0];

  const downtime = await ctx.client.query<DowntimeRow>(
    `select started_at, ended_at
       from public.downtime_events
      where org_id = app.current_org_id()
        and wo_id = $1::uuid`,
    [woId],
  );
  const downtimeMin =
    wo.started_at && wo.completed_at
      ? totalDowntimeMinutes(
          downtime.rows.map((row) => ({ startedAt: row.started_at, endedAt: row.ended_at })),
          wo.started_at,
          wo.completed_at,
        )
      : 0;
  const runtimeMin = clampRuntime(minutesBetween(wo.started_at, wo.completed_at), downtimeMin);

  const costMode =
    processRow?.cost_mode === 'per_run'
      ? 'per_run'
      : processRow?.cost_mode === 'per_hour'
        ? 'per_hour'
        : null;
  const hasHourlyLabor = costMode === 'per_hour' && processRow?.cost_rate != null;
  const machineCost = costMode === 'per_run' && processRow?.cost_rate != null ? processRow.cost_rate : null;
  const totals = computeWoActualCostTotals({
    materials: materials.rows.map((row) => ({
      itemCode: row.item_code ?? 'UNKNOWN',
      qtyKg: row.qty_kg,
      costPerKg: row.cost_per_kg,
    })),
    labor: hasHourlyLabor
      ? {
          runtimeMin,
          staffing: processRow?.staffing_count ?? '1',
          ratePerHour: processRow!.cost_rate!,
        }
      : null,
    machineCost,
    setupCost: processRow?.setup_cost ?? null,
    wasteKg: wo.waste_kg,
    outputKg: wo.output_kg,
  });

  return {
    ok: true,
    data: {
      woId: wo.wo_id,
      woNumber: wo.wo_number,
      product: { itemCode: wo.product_code, name: wo.product_name },
      outputKg: wo.output_kg,
      ...totals,
      processResolution: {
        operationName: processRow?.operation_name ?? null,
        processRowKey: processRow?.row_key ?? null,
        costMode,
        currency: processRow?.currency ?? null,
        note:
          processRow?.row_key == null
            ? 'No active reference_tables.processes row matched the first WO operation by row_key, row_data.name, or row_data.process_code.'
            : 'Matched first WO operation to reference_tables.processes by row_key, row_data.name, or row_data.process_code. per_hour cost_rate is labor; per_run cost_rate is reported as machineCost.',
      },
    },
  };
}

export async function computeWoActualCost(woId: string): Promise<FinanceActionResult<WoActualCost>> {
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<FinanceActionResult<WoActualCost>> =>
        computeWoActualCostInContext({ userId, orgId, client: client as QueryClient }, woId),
    );
  } catch (error) {
    console.error('[finance] computeWoActualCost failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function listCompletedWoCosts(
  input: { days?: number } = {},
): Promise<FinanceActionResult<CompletedWoCostsSummary>> {
  const days = asDays(input.days, 30);
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<FinanceActionResult<CompletedWoCostsSummary>> => {
        const ctx: FinanceContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasFinancePermission(ctx, FINANCE_COSTS_READ_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const rows = await ctx.client.query<{ wo_id: string; completed_at: string | Date | null }>(
          `select wo.id::text as wo_id,
                  coalesce(x.completed_at, wo.completed_at) as completed_at
             from public.work_orders wo
             left join public.wo_executions x
               on x.org_id = app.current_org_id()
              and x.wo_id = wo.id
            where wo.org_id = app.current_org_id()
              and (
                wo.status in ('COMPLETED', 'CLOSED')
                or x.status in ('completed', 'closed')
              )
              and coalesce(x.completed_at, wo.completed_at) >= pg_catalog.now() - ($1::int * interval '1 day')
            order by coalesce(x.completed_at, wo.completed_at) desc nulls last, wo.wo_number desc
            limit 25`,
          [days],
        );

        const costRows: WoCostSummaryRow[] = [];
        for (const row of rows.rows) {
          const result = await computeWoActualCostInContext(ctx, row.wo_id);
          if (result.ok) {
            costRows.push({ ...result.data, completedAt: iso(row.completed_at) });
          }
        }

        return { ok: true, data: { days, rows: costRows } };
      },
    );
  } catch (error) {
    console.error('[finance] listCompletedWoCosts failed', error);
    return { ok: false, reason: 'error' };
  }
}
