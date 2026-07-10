'use server';

/**
 * 10-Finance read-only WO actual costing.
 *
 * Cost-source inspection and resolution decisions:
 * - Materials: public.wo_material_consumption.qty_consumed joined to public.items by
 *   component_id; active `item_cost_history.cost_per_kg` is preferred, falling
 *   back to the denormalized `items.cost_per_kg`.
 * - Process costing: WO operation crew snapshots are the primary source.
 *   Operation-level hourly cost is Σ(crew.headcount × effective-dated
 *   labor_rates.rate_per_hour). When wo_operations.crew IS NULL, fall back to
 *   npd_process_default_roles headcounts × labor_rates (Settings process defaults).
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
import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { WAC_VALUATION_CURRENCY_CODE } from '../../../../../../lib/finance/upsert-wac';
import {
  DEFAULT_FINANCE_WO_COST_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../lib/shared/pagination';
import { totalDowntimeMinutes } from '../../../../../../lib/production/oee-snapshot-producer';
import { microToFixed, toMicro, MICRO_SCALE } from '../../../../../../lib/shared/decimal';
import {
  computeWoActualCostTotals,
  type WoActualCostLabor,
  type WoActualCostMaterial,
} from './wo-cost-math';

const FINANCE_COSTS_READ_PERMISSION = 'fin.costs.read';
/** WO actual-cost reporting currency — labor/setup are GBP; no FX conversion table exists. */
const WO_REPORTING_CURRENCY = WAC_VALUATION_CURRENCY_CODE;

const COMPLETED_WO_FROM = `
             from public.work_orders wo
             left join public.wo_executions x
               on x.org_id = app.current_org_id()
              and x.wo_id = wo.id`;

const COMPLETED_WO_WHERE = `
            where wo.org_id = app.current_org_id()
              and (
                wo.status in ('COMPLETED', 'CLOSED')
                or x.status in ('completed', 'closed')
              )
              and coalesce(x.completed_at, wo.completed_at) >= pg_catalog.now() - ($1::int * interval '1 day')`;

const COMPLETED_WO_ORDER = `
            order by coalesce(x.completed_at, wo.completed_at) desc nulls last, wo.wo_number desc`;

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
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error' | 'unsupported_currency'; message?: string };

export type WoActualCost = {
  woId: string;
  woNumber: string;
  product: { itemCode: string | null; name: string | null };
  outputKg: string;
  materials: WoActualCostMaterial[];
  unresolvedUom: Array<{
    itemCode: string;
    uom: string | null;
    qty: string;
  }>;
  materialsTotal: string;
  labor: WoActualCostLabor | null;
  laborBasis: 'planned_duration' | 'actual_runtime' | null;
  plannedRuntimeMin: string | null;
  actualRuntimeMin: string;
  downtimeMin: string;
  downtimeCost: string;
  machineCost: string;
  setupCost: string;
  wasteCost: string;
  totalCost: string;
  costPerKgOutput: string | null;
  zeroCost: boolean;
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
  pagination: PaginatedResult<WoCostSummaryRow>;
};

export type CompletedWoWasteCostSummary = {
  days: number;
  woCount: number;
  wasteCost: string;
};

type MaterialRow = {
  item_code: string | null;
  uom: string | null;
  raw_qty: string;
  qty_kg: string;
  cost_per_kg: string | null;
  has_non_gbp_currency: boolean;
  unresolved_uom: boolean;
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

function divMicro(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const neg = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const rounded = (absNum * MICRO_SCALE + absDen / 2n) / absDen;
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

function normalizeLaborInput(
  runtimeMin: string,
  staffingCount: string,
  aggregatedRatePerHour: string,
): { runtimeMin: string; staffing: string; ratePerHour: string } {
  const staffingMicro = toMicro(staffingCount);
  if (staffingMicro <= toMicro('1')) {
    return { runtimeMin, staffing: staffingCount, ratePerHour: aggregatedRatePerHour };
  }
  const perSeatRate = divMicro(toMicro(aggregatedRatePerHour), staffingMicro);
  return {
    runtimeMin,
    staffing: staffingCount,
    ratePerHour: microToFixed(perSeatRate, 4),
  };
}

async function computeWoActualCostInContext(
  ctx: FinanceContext,
  woId: string,
): Promise<FinanceActionResult<WoActualCost>> {
  if (!(await hasPermission(ctx, FINANCE_COSTS_READ_PERMISSION))) {
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
    `with converted as (
       select coalesce(i.item_code, c.component_id::text) as item_code,
              c.uom,
              c.qty_consumed::numeric as raw_qty,
              case
                when lower(c.uom) = 'kg' then c.qty_consumed::numeric
                when lower(c.uom) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then c.qty_consumed::numeric
                when lower(c.uom) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg' then c.qty_consumed::numeric
                when lower(c.uom) = 'each' and i.net_qty_per_each is not null
                  then c.qty_consumed::numeric * i.net_qty_per_each
                when lower(c.uom) = 'box' and i.net_qty_per_each is not null and i.each_per_box is not null
                  then c.qty_consumed::numeric * i.each_per_box::numeric * i.net_qty_per_each
                else null
              end as qty_kg,
              coalesce(
                nullif(c.ext_jsonb->>'wac_avg_cost', '')::numeric,
                ch.cost_per_kg,
                i.cost_per_kg
              ) as cost_per_kg,
              case
                when nullif(trim(c.ext_jsonb->>'wac_avg_cost'), '') is not null then $3::text
                when ch.cost_per_kg is not null then ch.currency
                else coalesce(ch.currency, 'PLN')
              end as cost_currency
         from public.wo_material_consumption c
         left join public.items i
           on i.org_id = app.current_org_id()
          and i.id = c.component_id
         left join lateral (
           select cost_per_kg, currency
             from public.item_cost_history
            where org_id = app.current_org_id()
              and item_id = c.component_id
              and effective_from <= coalesce(c.consumed_at::date, $2::date)
              and (effective_to is null or effective_to >= coalesce(c.consumed_at::date, $2::date))
            order by effective_from desc
            limit 1
         ) ch on nullif(trim(c.ext_jsonb->>'wac_avg_cost'), '') is null
        where c.org_id = app.current_org_id()
          and c.wo_id = $1::uuid
     )
     select item_code,
            case when qty_kg is null then uom else null end as uom,
            sum(raw_qty)::text as raw_qty,
            coalesce(sum(qty_kg), 0)::text as qty_kg,
            case
              when coalesce(sum(qty_kg), 0) > 0
              then (
                sum(coalesce(qty_kg, 0) * coalesce(cost_per_kg, 0)) / sum(qty_kg)
              )::text
              else null
            end as cost_per_kg,
            bool_or(cost_currency is distinct from $3::text) as has_non_gbp_currency,
            bool_or(qty_kg is null) as unresolved_uom
       from converted
      group by item_code, case when qty_kg is null then uom else null end
      order by item_code, case when qty_kg is null then uom else null end`,
    [woId, woDate, WO_REPORTING_CURRENCY],
  );

  const process = await ctx.client.query<ProcessRow>(
    `with op as (
       select sequence,
              operation_name,
              coalesce(expected_duration_minutes, 0)::numeric as expected_duration_minutes,
              crew
         from public.wo_operations
        where org_id = app.current_org_id()
          and wo_id = $1::uuid
     ),
     direct_op_rate as (
       select op.sequence,
              op.operation_name,
              op.expected_duration_minutes,
              null::uuid as process_default_id,
              sum(coalesce((crew.headcount)::numeric, 0) * coalesce(lr.rate_per_hour, 0)) as crew_rate_per_hour,
              '1'::text as staffing_count,
              0::numeric as setup_cost,
              bool_or(lr.rate_per_hour is not null) as has_rate
         from op
         left join lateral jsonb_to_recordset(
           case
             when jsonb_typeof(coalesce(op.crew, '[]'::jsonb)) = 'array'
               then coalesce(op.crew, '[]'::jsonb)
             else '[]'::jsonb
           end
         ) as crew(role_group text, headcount numeric) on true
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = app.current_org_id()
              and lower(lr.role_group) = lower(crew.role_group)
              and lr.currency = 'GBP'
              and lr.effective_from <= $2::date
            order by lr.effective_from desc, lr.created_at desc
            limit 1
         ) lr on true
        where op.crew is not null
        group by op.sequence, op.operation_name, op.expected_duration_minutes
     ),
     defaults_op_rate as (
       select op.sequence,
              op.operation_name,
              op.expected_duration_minutes,
              md.process_default_id,
              sum(coalesce(lr.rate_per_hour, 0) * coalesce(pdr.default_headcount, 0)) as crew_rate_per_hour,
              coalesce(nullif(sum(pdr.default_headcount), 0), 1)::text as staffing_count,
              md.setup_cost,
              bool_or(lr.rate_per_hour is not null) as has_rate
         from op
         join lateral (
           select pd.id as process_default_id,
                  coalesce(pd.setup_cost, 0)::numeric as setup_cost
             from "Reference"."ManufacturingOperations" mo
             join public.npd_process_defaults pd
               on pd.org_id = app.current_org_id()
              and pd.operation_id = mo.id
            where mo.org_id = app.current_org_id()
              and lower(btrim(mo.operation_name)) = lower(btrim(op.operation_name))
              and mo.is_active = true
            order by mo.id asc, pd.id asc
            limit 1
         ) md on true
         left join public.npd_process_default_roles pdr
           on pdr.org_id = app.current_org_id()
          and pdr.process_default_id = md.process_default_id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = app.current_org_id()
              and lower(lr.role_group) = lower(pdr.role_group)
              and lr.currency = 'GBP'
              and lr.effective_from <= $2::date
            order by lr.effective_from desc, lr.created_at desc
            limit 1
         ) lr on true
        where op.crew is null
        group by op.sequence, op.operation_name, op.expected_duration_minutes, md.process_default_id, md.setup_cost
     ),
     op_rate as (
       select * from direct_op_rate
       union all
       select * from defaults_op_rate
     )
     select (array_agg(operation_name order by sequence))[1] as operation_name,
            (array_agg(process_default_id::text order by sequence) filter (where process_default_id is not null))[1] as row_key,
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
            (array_agg(staffing_count order by sequence))[1] as staffing_count,
            nullif((
              select sum(distinct_setup.setup_cost)
                from (
                  select distinct on (process_default_id)
                         process_default_id,
                         setup_cost
                    from op_rate
                   where process_default_id is not null
                   order by process_default_id
                ) distinct_setup
            ), 0)::text as setup_cost,
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
  const downtimeMinText = Math.max(0, downtimeMin).toFixed(6);

  const resolvedMaterials = materials.rows.filter((row) => !row.unresolved_uom);
  const mixedCurrencyMaterial = resolvedMaterials.find((row) => row.has_non_gbp_currency);
  if (mixedCurrencyMaterial) {
    return {
      ok: false,
      reason: 'unsupported_currency',
      message: `Material ${mixedCurrencyMaterial.item_code ?? 'UNKNOWN'} includes non-${WO_REPORTING_CURRENCY} consumption; WO actual cost requires ${WO_REPORTING_CURRENCY} (no FX conversion).`,
    };
  }

  const hasHourlyLabor = processRow?.cost_rate != null;
  const laborRuntimeMin = processRow?.expected_duration_minutes ?? runtimeMin;
  const laborBasis = hasHourlyLabor
    ? processRow?.expected_duration_minutes != null
      ? 'planned_duration'
      : 'actual_runtime'
    : null;
  const downtimeCost = hasHourlyLabor ? downtimeCostFromLaborRate(downtimeMin, processRow!.cost_rate!) : '0.0000';
  const totals = computeWoActualCostTotals({
    materials: resolvedMaterials.map((row) => ({
      itemCode: row.item_code ?? 'UNKNOWN',
      qtyKg: row.qty_kg,
      costPerKg: row.cost_per_kg,
    })),
    labor: hasHourlyLabor
      ? normalizeLaborInput(
          laborRuntimeMin,
          processRow?.staffing_count ?? '1',
          processRow!.cost_rate!,
        )
      : null,
    machineCost: null,
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
      unresolvedUom: materials.rows
        .filter((row) => row.unresolved_uom)
        .map((row) => ({
          itemCode: row.item_code ?? 'UNKNOWN',
          uom: row.uom,
          qty: row.raw_qty,
        })),
      laborBasis,
      plannedRuntimeMin: processRow?.expected_duration_minutes ?? null,
      actualRuntimeMin: runtimeMin,
      downtimeMin: downtimeMinText,
      downtimeCost,
      zeroCost: toMicro(totals.totalCost) === 0n,
      processResolution: {
        operationName: processRow?.operation_name ?? null,
        processRowKey: processRow?.row_key ?? null,
        costMode: hasHourlyLabor ? 'per_hour' : null,
        currency: processRow?.currency ?? null,
        note:
          processRow?.has_labor_rate
            ? 'Matched WO operation crew snapshots or Settings process-default roles to GBP effective labor rates.'
            : 'no labor rate matched from WO operation crew or process-default roles',
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
  input: { days?: number; page?: number; offset?: number; limit?: number } = {},
): Promise<FinanceActionResult<CompletedWoCostsSummary>> {
  const days = asDays(input.days, 30);
  const page = normalizePage({
    page: input.page,
    offset: input.offset,
    limit: input.limit,
    defaultLimit: DEFAULT_FINANCE_WO_COST_PAGE_SIZE,
    maxLimit: DEFAULT_FINANCE_WO_COST_PAGE_SIZE,
  });
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<FinanceActionResult<CompletedWoCostsSummary>> => {
        const ctx: FinanceContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasPermission(ctx, FINANCE_COSTS_READ_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const [countResult, rowsResult] = await Promise.all([
          ctx.client.query<{ total: number }>(
            `select count(*)::int as total
               ${COMPLETED_WO_FROM}
              ${COMPLETED_WO_WHERE}`,
            [days],
          ),
          ctx.client.query<{ wo_id: string; completed_at: string | Date | null }>(
            `select wo.id::text as wo_id,
                    coalesce(x.completed_at, wo.completed_at) as completed_at
               ${COMPLETED_WO_FROM}
              ${COMPLETED_WO_WHERE}
              ${COMPLETED_WO_ORDER}
              limit $2::integer offset $3::integer`,
            [days, page.limit, page.offset],
          ),
        ]);

        const costRows: WoCostSummaryRow[] = [];
        for (const row of rowsResult.rows) {
          const result = await computeWoActualCostInContext(ctx, row.wo_id);
          if (result.ok) {
            costRows.push({ ...result.data, completedAt: iso(row.completed_at) });
          }
        }

        const pagination = toPaginatedResult(costRows, Number(countResult.rows[0]?.total ?? 0), page);
        return { ok: true, data: { days, rows: pagination.items, pagination } };
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
        if (!(await hasPermission(ctx, FINANCE_COSTS_READ_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const [countResult, rows] = await Promise.all([
          ctx.client.query<{ total: number }>(
            `select count(*)::int as total
               ${COMPLETED_WO_FROM}
              ${COMPLETED_WO_WHERE}`,
            [days],
          ),
          ctx.client.query<{ wo_id: string }>(
            `select wo.id::text as wo_id
               ${COMPLETED_WO_FROM}
              ${COMPLETED_WO_WHERE}
              ${COMPLETED_WO_ORDER}`,
            [days],
          ),
        ]);

        let wasteCost = 0n;
        let woCount = 0;
        for (const row of rows.rows) {
          const result = await computeWoActualCostInContext(ctx, row.wo_id);
          if (result.ok && hasComputedCostInputs(result.data)) {
            wasteCost += toMicro(result.data.wasteCost);
            woCount += 1;
          }
        }

        return {
          ok: true,
          data: { days, woCount: Number(countResult.rows[0]?.total ?? woCount), wasteCost: microToFixed(wasteCost, 4) },
        };
      },
    );
  } catch (error) {
    console.error('[finance] summarizeCompletedWoWasteCost failed', error);
    return { ok: false, reason: 'error' };
  }
}
