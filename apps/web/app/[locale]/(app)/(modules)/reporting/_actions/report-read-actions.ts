'use server';

/**
 * W9-M3 — 12-Reporting read-only slice: four org-scoped summary reads.
 *
 * READ-ONLY by contract: every statement is a SELECT against existing tables
 * (no new tables, no mutations, no outbox). All queries are org-scoped via
 * `app.current_org_id()` inside the RLS transaction opened by `withOrgContext`,
 * with explicit `org_id = app.current_org_id()` predicates on every relation
 * (belt + braces, matching the warehouse read actions).
 *
 * RBAC: `rpt.dashboard.view` (seeded by migration 214, previously enforced
 * NOWHERE — audit finding #9), fail-closed. CSV export gating uses
 * `rpt.export.csv` via getReportingExportAccess().
 *
 * Source tables + honest gaps (see shared.ts payload docs for the full notes):
 *   productionSummary  — work_orders, wo_outputs, wo_waste_log, downtime_events
 *   inventorySnapshot  — license_plates ⋈ warehouses
 *   qualitySummary     — quality_holds, quality_inspections (mig 272), ncr_reports
 *   procurementSummary — purchase_orders, grns, transfer_orders
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  RPT_DASHBOARD_VIEW_PERMISSION,
  RPT_EXPORT_CSV_PERMISSION,
  asDays,
  avgDays,
  hasReportingPermission,
  num,
  pct,
  toIso,
  type InventorySnapshot,
  type ProcurementSummary,
  type ProductionSummary,
  type QualitySummary,
  type QueryClient,
  type ReportingContext,
  type ReportingResult,
} from './shared';
import { reportingWindowDays, type ReportingLineOption } from '../shared';

const MS_PER_DAY = 86_400_000;

type QtyByUomRow = { uom: string; qty: string };

type ReportingLoaderInput = {
  days?: number;
  from?: Date;
  to?: Date;
  lineId?: string;
  orderQuery?: string;
};

type ProductionSummaryCsvInput = {
  from?: string;
  to?: string;
  lineId?: string;
  orderQuery?: string;
};

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function normalizeWindow(input: ReportingLoaderInput, fallbackDays: number) {
  const fallback = asDays(input.days, fallbackDays);
  let from: Date;
  let to: Date;

  if (isValidDate(input.from) && isValidDate(input.to) && input.from <= input.to) {
    from = input.from;
    to = input.to;
  } else {
    to = new Date();
    from = new Date(to.getTime() - fallback * MS_PER_DAY);
  }

  const window = { from, to };

  return {
    ...window,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    days: reportingWindowDays(window),
    lineId: cleanText(input.lineId),
    orderQuery: cleanText(input.orderQuery),
  };
}

function parseQtyByUom(value: unknown): QtyByUomRow[] {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row) => {
    if (
      row &&
      typeof row === 'object' &&
      typeof (row as { uom?: unknown }).uom === 'string' &&
      typeof (row as { qty?: unknown }).qty === 'string'
    ) {
      return [{ uom: (row as { uom: string }).uom, qty: (row as { qty: string }).qty }];
    }
    return [];
  });
}

function parseExportDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return isValidDate(parsed) ? parsed : undefined;
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function dateStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** rpt.export.csv probe so the page can render the CSV buttons honestly. */
export async function getReportingExportAccess(): Promise<
  ReportingResult<{ canExportCsv: boolean }>
> {
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<{ canExportCsv: boolean }>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }
        const canExportCsv = await hasReportingPermission(ctx, RPT_EXPORT_CSV_PERMISSION);
        return { ok: true, data: { canExportCsv } };
      },
    );
  } catch (error) {
    console.error('[reporting] getReportingExportAccess failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function reportingProductionLines(): Promise<
  ReportingResult<ReportingLineOption[]>
> {
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<ReportingLineOption[]>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const res = await ctx.client.query<ReportingLineOption>(
          `select id::text, code, name
             from public.production_lines
            where org_id = app.current_org_id()
              and status = 'active'
            order by lower(name), lower(code)`,
        );

        return { ok: true, data: res.rows };
      },
    );
  } catch (error) {
    console.error('[reporting] reportingProductionLines failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function productionSummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProductionSummary>> {
  const window = normalizeWindow(input, 7);
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<ProductionSummary>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const agg = await ctx.client.query<{
          wos_completed: string;
          avg_yield: string | null;
        }>(
          `select count(*)::text as wos_completed,
                  avg(wo.yield_percent)::text as avg_yield
             from public.work_orders wo
            where wo.org_id = app.current_org_id()
              and wo.status in ('COMPLETED', 'CLOSED')
              and wo.completed_at is not null
              and wo.completed_at >= $1::timestamptz
              and wo.completed_at <= $2::timestamptz
              and ($3::text is null or wo.production_line_id::text = $3::text)
              and ($4::text is null or wo.wo_number ilike '%' || $4::text || '%')`,
          [window.fromIso, window.toIso, window.lineId, window.orderQuery],
        );

        const output = await ctx.client.query<{ output_kg: string | null }>(
          `select sum(o.qty_kg)::text as output_kg
             from public.wo_outputs o
             join public.work_orders wo
               on wo.org_id = app.current_org_id()
              and wo.id = o.wo_id
            where o.org_id = app.current_org_id()
              and o.registered_at >= $1::timestamptz
              and o.registered_at <= $2::timestamptz
              and ($3::text is null or wo.production_line_id::text = $3::text)
              and ($4::text is null or wo.wo_number ilike '%' || $4::text || '%')`,
          [window.fromIso, window.toIso, window.lineId, window.orderQuery],
        );

        const waste = await ctx.client.query<{ waste_kg: string | null }>(
          `select sum(w.qty_kg)::text as waste_kg
             from public.wo_waste_log w
             join public.work_orders wo
               on wo.org_id = app.current_org_id()
              and wo.id = w.wo_id
            where w.org_id = app.current_org_id()
              and w.recorded_at >= $1::timestamptz
              and w.recorded_at <= $2::timestamptz
              and ($3::text is null or wo.production_line_id::text = $3::text)
              and ($4::text is null or wo.wo_number ilike '%' || $4::text || '%')`,
          [window.fromIso, window.toIso, window.lineId, window.orderQuery],
        );

        // duration_min is GENERATED, NULL while an event is still open — open
        // downtime is honestly excluded (documented in shared.ts).
        const downtime = await ctx.client.query<{ downtime_min: string | null }>(
          `select sum(d.duration_min)::text as downtime_min
             from public.downtime_events d
             left join public.work_orders wo
               on wo.org_id = app.current_org_id()
              and wo.id = d.wo_id
            where d.org_id = app.current_org_id()
              and d.started_at >= $1::timestamptz
              and d.started_at <= $2::timestamptz
              and ($3::text is null or d.line_id = $3::text)
              and ($4::text is null or wo.wo_number ilike '%' || $4::text || '%')`,
          [window.fromIso, window.toIso, window.lineId, window.orderQuery],
        );

        const woRows = await ctx.client.query<{
          wo_number: string;
          item_code: string | null;
          item_name: string | null;
          planned_qty: string;
          actual_qty: string | null;
          uom: string;
          yield_percent: string | null;
          completed_at: string | Date | null;
        }>(
          `select wo.wo_number,
                  i.item_code,
                  i.name as item_name,
                  wo.planned_quantity::text as planned_qty,
                  wo.actual_qty::text as actual_qty,
                  wo.uom,
                  wo.yield_percent::text as yield_percent,
                  wo.completed_at
             from public.work_orders wo
             left join public.items i
               on i.org_id = app.current_org_id()
              and i.id = wo.product_id
            where wo.org_id = app.current_org_id()
              and wo.status in ('COMPLETED', 'CLOSED')
              and wo.completed_at is not null
              and wo.completed_at >= $1::timestamptz
              and wo.completed_at <= $2::timestamptz
              and ($3::text is null or wo.production_line_id::text = $3::text)
              and ($4::text is null or wo.wo_number ilike '%' || $4::text || '%')
            order by wo.completed_at desc, wo.wo_number desc
            limit 20`,
          [window.fromIso, window.toIso, window.lineId, window.orderQuery],
        );

        const outputKg = num(output.rows[0]?.output_kg);
        const wasteKg = num(waste.rows[0]?.waste_kg);
        const avgYieldRaw = agg.rows[0]?.avg_yield;

        return {
          ok: true,
          data: {
            days: window.days,
            wosCompleted: num(agg.rows[0]?.wos_completed),
            outputKg: outputKg.toFixed(3),
            wasteKg: wasteKg.toFixed(3),
            wastePct: pct(wasteKg, outputKg + wasteKg),
            // yield_percent is a 0..1 fraction (actual/planned) — ×100 for display.
            avgYieldPct: avgYieldRaw == null ? null : (num(avgYieldRaw) * 100).toFixed(2),
            downtimeMinutes: num(downtime.rows[0]?.downtime_min),
            rows: woRows.rows.map((r) => ({
              woNumber: r.wo_number,
              itemCode: r.item_code,
              itemName: r.item_name,
              plannedQty: String(r.planned_qty),
              actualQty: r.actual_qty == null ? null : String(r.actual_qty),
              uom: r.uom,
              yieldPct: r.yield_percent == null ? null : (num(r.yield_percent) * 100).toFixed(2),
              completedAt: toIso(r.completed_at),
            })),
          },
        };
      },
    );
  } catch (error) {
    console.error('[reporting] productionSummary failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function exportProductionSummaryCsv(
  input: ProductionSummaryCsvInput = {},
): Promise<{ csv: string; filename: string }> {
  const from = parseExportDate(input.from);
  const to = parseExportDate(input.to);

  try {
    const access = await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<{ canExport: boolean }>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }
        if (!(await hasReportingPermission(ctx, RPT_EXPORT_CSV_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }
        return { ok: true, data: { canExport: true } };
      },
    );

    if (!access.ok) {
      throw new Error(access.reason === 'forbidden' ? 'REPORTING_EXPORT_FORBIDDEN' : 'REPORTING_EXPORT_FAILED');
    }

    const summary = await productionSummary({
      from,
      to,
      lineId: input.lineId,
      orderQuery: input.orderQuery,
    });

    if (!summary.ok) {
      throw new Error(summary.reason === 'forbidden' ? 'REPORTING_EXPORT_FORBIDDEN' : 'REPORTING_EXPORT_FAILED');
    }

    const csv = toCsv(
      ['WO', 'Item code', 'Item name', 'Planned qty', 'Actual qty', 'UOM', 'Yield %', 'Completed at'],
      summary.data.rows.map((r) => [
        r.woNumber,
        r.itemCode,
        r.itemName,
        r.plannedQty,
        r.actualQty,
        r.uom,
        r.yieldPct,
        r.completedAt,
      ]),
    );

    return { csv, filename: `reporting-production-${dateStamp()}.csv` };
  } catch (error) {
    console.error('[reporting] exportProductionSummaryCsv failed', error);
    throw error;
  }
}

export async function inventorySnapshot(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<InventorySnapshot>> {
  const window = normalizeWindow(input, 7);
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<InventorySnapshot>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        // On-hand = received/available/reserved/allocated (active family) +
        // blocked/quarantine (blocked family). consumed/merged/shipped/returned
        // LPs are gone from stock and excluded entirely.
        // Future follow-up: inventory intentionally ignores line/order filters;
        // the selected period only anchors expiry aging via its `to` timestamp.
        const res = await ctx.client.query<{
          warehouse_id: string;
          warehouse_code: string | null;
          warehouse_name: string | null;
          lp_count: string;
          active_lp_count: string;
          blocked_lp_count: string;
          qty_kg: string | null;
          qty_by_uom: QtyByUomRow[] | string | null;
          expired_count: string;
          expiring_7d_count: string;
        }>(
          `select lp.warehouse_id::text as warehouse_id,
                  w.code as warehouse_code,
                  w.name as warehouse_name,
                  count(*)::text as lp_count,
                  count(*) filter (
                    where lp.status in ('received', 'available', 'reserved', 'allocated')
                  )::text as active_lp_count,
                  count(*) filter (
                    where lp.status in ('blocked', 'quarantine')
                  )::text as blocked_lp_count,
                  sum(lp.quantity) filter (where lp.uom = 'kg')::text as qty_kg,
                  coalesce((
                    select jsonb_agg(
                             jsonb_build_object('uom', lp2.uom, 'qty', lp2.total_qty::text)
                             order by lp2.uom
                           )
                      from (
                        select lp_uom.uom, sum(lp_uom.quantity) as total_qty
                          from public.license_plates lp_uom
                         where lp_uom.org_id = app.current_org_id()
                           and lp_uom.warehouse_id = lp.warehouse_id
                           and lp_uom.status in ('received', 'available', 'reserved', 'allocated', 'blocked', 'quarantine')
                         group by lp_uom.uom
                      ) lp2
                  ), '[]'::jsonb) as qty_by_uom,
                  count(*) filter (
                    where lp.expiry_date is not null
                      and lp.expiry_date < $1::timestamptz
                  )::text as expired_count,
                  count(*) filter (
                    where lp.expiry_date is not null
                      and lp.expiry_date >= $1::timestamptz
                      and lp.expiry_date < $1::timestamptz + interval '7 days'
                  )::text as expiring_7d_count
             from public.license_plates lp
             left join public.warehouses w
               on w.org_id = app.current_org_id()
              and w.id = lp.warehouse_id
            where lp.org_id = app.current_org_id()
              and lp.status in ('received', 'available', 'reserved', 'allocated', 'blocked', 'quarantine')
            group by lp.warehouse_id, w.code, w.name
            order by w.code nulls last`,
          [window.toIso],
        );

        const rows = res.rows.map((r) => ({
          warehouseId: r.warehouse_id,
          warehouseCode: r.warehouse_code,
          warehouseName: r.warehouse_name,
          lpCount: num(r.lp_count),
          activeLpCount: num(r.active_lp_count),
          blockedLpCount: num(r.blocked_lp_count),
          qtyKg: num(r.qty_kg).toFixed(3),
          qtyByUom: parseQtyByUom(r.qty_by_uom),
          expiredCount: num(r.expired_count),
          expiring7dCount: num(r.expiring_7d_count),
        }));

        return {
          ok: true,
          data: {
            totals: {
              lpCount: rows.reduce((a, r) => a + r.lpCount, 0),
              activeLpCount: rows.reduce((a, r) => a + r.activeLpCount, 0),
              blockedLpCount: rows.reduce((a, r) => a + r.blockedLpCount, 0),
              qtyKg: rows.reduce((a, r) => a + num(r.qtyKg), 0).toFixed(3),
              expiredCount: rows.reduce((a, r) => a + r.expiredCount, 0),
              expiring7dCount: rows.reduce((a, r) => a + r.expiring7dCount, 0),
            },
            rows,
          },
        };
      },
    );
  } catch (error) {
    console.error('[reporting] inventorySnapshot failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function qualitySummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<QualitySummary>> {
  const window = normalizeWindow(input, 30);
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<QualitySummary>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        // Future follow-up: quality intentionally ignores line/order filters;
        // only the selected date window is applied to windowed entities.
        const holds = await ctx.client.query<{ hold_status: string; count: string }>(
          `select h.hold_status, count(*)::text as count
             from public.quality_holds h
            where h.org_id = app.current_org_id()
              and h.hold_status in ('open', 'investigating', 'quarantined', 'escalated')
            group by h.hold_status
            order by h.hold_status`,
        );

        const inspections = await ctx.client.query<{ status: string; count: string }>(
          `select qi.status, count(*)::text as count
             from public.quality_inspections qi
            where qi.org_id = app.current_org_id()
              and qi.created_at >= $1::timestamptz
              and qi.created_at <= $2::timestamptz
            group by qi.status
            order by qi.status`,
          [window.fromIso, window.toIso],
        );

        const ncrs = await ctx.client.query<{ open_count: string; closed_in_window: string }>(
          `select count(*) filter (
                    where n.status in ('open', 'investigating', 'awaiting_capa', 'reopened')
                  )::text as open_count,
                  count(*) filter (
                    where n.closed_at is not null
                      and n.closed_at >= $1::timestamptz
                      and n.closed_at <= $2::timestamptz
                  )::text as closed_in_window
             from public.ncr_reports n
            where n.org_id = app.current_org_id()`,
          [window.fromIso, window.toIso],
        );

        const holdRows = holds.rows.map((r) => ({
          entity: 'hold' as const,
          status: r.hold_status,
          count: num(r.count),
        }));
        const inspectionRows = inspections.rows.map((r) => ({
          entity: 'inspection' as const,
          status: r.status,
          count: num(r.count),
        }));
        const ncrOpen = num(ncrs.rows[0]?.open_count);
        const ncrClosedInWindow = num(ncrs.rows[0]?.closed_in_window);

        return {
          ok: true,
          data: {
            days: window.days,
            openHolds: holdRows.reduce((a, r) => a + r.count, 0),
            inspectionsByStatus: inspectionRows.map(({ status, count }) => ({ status, count })),
            ncrOpen,
            ncrClosedInWindow,
            rows: [
              ...holdRows,
              ...inspectionRows,
              { entity: 'ncr' as const, status: 'open', count: ncrOpen },
              { entity: 'ncr' as const, status: 'closed_in_window', count: ncrClosedInWindow },
            ],
          },
        };
      },
    );
  } catch (error) {
    console.error('[reporting] qualitySummary failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function procurementSummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProcurementSummary>> {
  const window = normalizeWindow(input, 30);
  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<ReportingResult<ProcurementSummary>> => {
        const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const pos = await ctx.client.query<{ status: string; count: string }>(
          `select po.status, count(*)::text as count
             from public.purchase_orders po
            where po.org_id = app.current_org_id()
              and po.created_at >= $1::timestamptz
              and po.created_at <= $2::timestamptz
              and ($3::text is null or po.po_number ilike '%' || $3::text || '%')
            group by po.status
            order by po.status`,
          [window.fromIso, window.toIso, window.orderQuery],
        );

        // HONEST GAP: purchase_orders has no confirmed_at and status changes are
        // not timestamped, so "confirmed → first GRN" is NOT computable. We
        // compute the labeled proxy created_at → earliest grns.receipt_date.
        const cycles = await ctx.client.query<{
          created_at: string | Date;
          first_grn_at: string | Date;
        }>(
          `select po.created_at,
                  min(g.receipt_date) as first_grn_at
             from public.purchase_orders po
             join public.grns g
               on g.org_id = app.current_org_id()
              and g.po_id = po.id
            where po.org_id = app.current_org_id()
              and po.created_at >= $1::timestamptz
              and po.created_at <= $2::timestamptz
              and ($3::text is null or po.po_number ilike '%' || $3::text || '%')
              -- R3 A3 — a GRN whose every line was cancelled (mig-298
              -- cancelled_at) is no longer a received GRN: it must not anchor
              -- the created→first-GRN cycle.
              and exists (
                select 1
                  from public.grn_items gi
                 where gi.org_id = app.current_org_id()
                   and gi.grn_id = g.id
                   and gi.cancelled_at is null
              )
            group by po.id, po.created_at`,
          [window.fromIso, window.toIso, window.orderQuery],
        );

        const tos = await ctx.client.query<{ open_count: string }>(
          `select count(*)::text as open_count
             from public.transfer_orders t
            where t.org_id = app.current_org_id()
              and t.status in ('draft', 'in_transit')`,
        );

        return {
          ok: true,
          data: {
            days: window.days,
            posByStatus: pos.rows.map((r) => ({ status: r.status, count: num(r.count) })),
            avgConfirmedToFirstGrnDays: null,
            avgCreatedToFirstGrnDays: avgDays(
              cycles.rows.map((r) => ({
                fromMs: new Date(r.created_at).getTime(),
                toMs: new Date(r.first_grn_at).getTime(),
              })),
            ),
            openToCount: num(tos.rows[0]?.open_count),
          },
        };
      },
    );
  } catch (error) {
    console.error('[reporting] procurementSummary failed', error);
    return { ok: false, reason: 'error' };
  }
}
