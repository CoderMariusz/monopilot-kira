'use server';

/**
 * 10-Finance read-only WO actual costing.
 *
 * Cost-source inspection and resolution decisions:
 * - Materials: public.wo_material_consumption.qty_consumed joined to public.items by
 *   component_id; active `item_cost_history.cost_per_kg` is preferred, falling
 *   back to the denormalized `items.cost_per_kg`.
 * - Process costing: WO operation names resolve to Reference.ManufacturingOperations,
 *   then NPD process defaults/roles and effective-dated public.labor_rates. The
 *   returned labor shape stays per-hour by deriving the aggregate hourly rate over
 *   summed expected WO operation minutes.
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
  downtimeCost: string;
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

export type CompletedWoWasteCostSummary = {
  days: number;
  woCount: number;
  wasteCost: string;
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
  expected_duration_minutes: string | null;
  has_labor_rate: boolean | null;
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

function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const neg = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const rounded = (absNum + absDen / 2n) / absDen;
  return neg ? -rounded : rounded;
}

function downtimeCostFromLaborRate(downtimeMin: number, laborRatePerHour: string | null): string {
  if (laborRatePerHour == null) return '0.0000';
  const downtimeMinutes = toMicro(Math.max(0, downtimeMin).toFixed(6));
  const ratePerHour = toMicro(laborRatePerHour);
  const cost = divRound(downtimeMinutes * ratePerHour, toMicro('60'));
  return microToFixed(cost, 4);
}

function asDays(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? Math.min(value, 365)
    : fallback;
}

function hasComputedCostInputs(row: WoActualCost): boolean {
  return toMicro(row.totalCost) !== 0n;
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
            coalesce(w.waste_kg, '0')::text as waste_kg
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
  const woDate = wo.started_at
    ? new Date(wo.started_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const materials = await ctx.client.query<MaterialRow>(
    `select coalesce(i.item_code, c.component_id::text) as item_code,
            sum(c.qty_consumed)::text as qty_kg,
            max(coalesce(ch.cost_per_kg, i.cost_per_kg))::text as cost_per_kg
       from public.wo_material_consumption c
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = c.component_id
       left join lateral (
         select cost_per_kg
           from public.item_cost_history
          where org_id = app.current_org_id()
            and item_id = c.component_id
            and effective_to is null
          order by effective_from desc
          limit 1
       ) ch on true
      where c.org_id = app.current_org_id()
        and c.wo_id = $1::uuid
      group by coalesce(i.item_code, c.component_id::text)
      order by coalesce(i.item_code, c.component_id::text)`,
    [woId],
  );

  const process = await ctx.client.query<ProcessRow>(
    `with op as (
       select sequence,
              operation_name,
              coalesce(expected_duration_minutes, 0)::numeric as expected_duration_minutes
         from public.wo_operations
        where org_id = app.current_org_id()
          and wo_id = $1::uuid
     ),
     op_rate as (
       -- Aggregate roles PER OPERATION first so the crew rate is NOT deflated by the
       -- role-fanout. crew_rate_per_hour = SUM over roles(rate x headcount) = the true
       -- GBP/h for the whole crew on that operation; exactly one row per operation, so
       -- the outer aggregate (and the downtime rate derived from cost_rate) is correct
       -- even when an operation has multiple default roles.
       select op.sequence,
              op.operation_name,
              op.expected_duration_minutes,
              mo.id as mo_id,
              sum(coalesce(lr.rate_per_hour, 0) * coalesce(pdr.default_headcount, 0)) as crew_rate_per_hour,
              bool_or(lr.rate_per_hour is not null) as has_rate
         from op
         left join lateral (
           select id
             from "Reference"."ManufacturingOperations" mo
            where mo.org_id = app.current_org_id()
              and lower(mo.operation_name) = lower(op.operation_name)
            order by mo.id
            limit 1
         ) mo on true
         left join public.npd_process_defaults pd
           on pd.org_id = app.current_org_id()
          and pd.operation_id = mo.id
         left join public.npd_process_default_roles pdr
           on pdr.org_id = app.current_org_id()
          and pdr.process_default_id = pd.id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = app.current_org_id()
              and lr.role_group = pdr.role_group
              and lr.currency = 'GBP'
              and lr.effective_from <= $2::date
            order by lr.effective_from desc
            limit 1
         ) lr on true
        group by op.sequence, op.operation_name, op.expected_duration_minutes, mo.id
     )
     select (array_agg(operation_name order by sequence))[1] as operation_name,
            (array_agg(mo_id::text order by sequence) filter (where mo_id is not null))[1] as row_key,
            'per_hour'::text as cost_mode,
            case
              when coalesce(sum(expected_duration_minutes), 0) > 0
               and bool_or(has_rate)
              then (
                sum(crew_rate_per_hour * (expected_duration_minutes / 60.0))
                / (sum(expected_duration_minutes) / 60.0)
              )::text
              else null
            end as cost_rate,
            'GBP'::text as currency,
            '1'::text as staffing_count,
            null::text as setup_cost,
            nullif(sum(expected_duration_minutes), 0)::text as expected_duration_minutes,
            coalesce(bool_or(has_rate), false) as has_labor_rate
       from op_rate`,
    [woId, woDate],
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
  const laborRuntimeMin = processRow?.expected_duration_minutes ?? runtimeMin;
  const downtimeCost = hasHourlyLabor ? downtimeCostFromLaborRate(downtimeMin, processRow!.cost_rate!) : '0.0000';
  const machineCost = costMode === 'per_run' && processRow?.cost_rate != null ? processRow.cost_rate : null;
  const totals = computeWoActualCostTotals({
    materials: materials.rows.map((row) => ({
      itemCode: row.item_code ?? 'UNKNOWN',
      qtyKg: row.qty_kg,
      costPerKg: row.cost_per_kg,
    })),
    labor: hasHourlyLabor
      ? {
          runtimeMin: laborRuntimeMin,
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
      downtimeCost,
      processResolution: {
        operationName: processRow?.operation_name ?? null,
        processRowKey: processRow?.row_key ?? null,
        costMode,
        currency: processRow?.currency ?? null,
        note:
          processRow?.has_labor_rate
            ? 'Matched WO operations to ManufacturingOperations/process-defaults/labor_rates using GBP effective labor rates.'
            : 'no labor rate matched via ManufacturingOperations/process-defaults',
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
          if (result.ok && hasComputedCostInputs(result.data)) {
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

export async function summarizeCompletedWoWasteCost(
  input: { days?: number } = {},
): Promise<FinanceActionResult<CompletedWoWasteCostSummary>> {
  const days = asDays(input.days, 30);
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<FinanceActionResult<CompletedWoWasteCostSummary>> => {
        const ctx: FinanceContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasFinancePermission(ctx, FINANCE_COSTS_READ_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const rows = await ctx.client.query<{ wo_id: string }>(
          `select wo.id::text as wo_id
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

        let wasteCost = 0n;
        let woCount = 0;
        for (const row of rows.rows) {
          const result = await computeWoActualCostInContext(ctx, row.wo_id);
          if (result.ok && hasComputedCostInputs(result.data)) {
            wasteCost += toMicro(result.data.wasteCost);
            woCount += 1;
          }
        }

        return { ok: true, data: { days, woCount, wasteCost: microToFixed(wasteCost, 4) } };
      },
    );
  } catch (error) {
    console.error('[finance] summarizeCompletedWoWasteCost failed', error);
    return { ok: false, reason: 'error' };
  }
}
