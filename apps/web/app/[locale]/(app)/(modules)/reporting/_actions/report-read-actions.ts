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

import { withSiteContext } from '../../../../../../lib/auth/with-site-context';
import {
  RPT_DASHBOARD_VIEW_PERMISSION,
  RPT_EXPORT_CSV_PERMISSION,
  asDays,
  avgDays,
  hasReportingPermission,
  num,
  pct,
  toIso,
  type GrnReceiptRow,
  type InventorySnapshot,
  type ProcurementSummary,
  type ProductionSummary,
  type QualitySummary,
  type QueryClient,
  type ReceiptsSummary,
  type ReportingContext,
  type ReportingResult,
  type ShipmentsSummary,
} from './shared';
import { reportingWindowDays, type ReportingLineOption } from '../shared';

const MS_PER_DAY = 86_400_000;

type QtyByUomRow = { uom: string; qty: string };

export type SpendBySupplierRow = {
  supplierId: string;
  supplierName: string;
  totalSpend: number;
  lineCount: number;
};

/** PO statuses that represent committed spend (excludes draft + cancelled). */
const REAL_SPEND_PO_STATUSES = ['sent', 'confirmed', 'partially_received', 'received'] as const;

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

/**
 * Connection-pool note (2026-06-25 pool-pressure fix): each public action below
 * opens its own `withOrgContext` (= 1 app-pool connection). A `/reporting` load
 * historically fired ~7 of them CONCURRENTLY, which under modest traffic
 * exhausted the Supavisor pool (pool_size=15) → EMAXCONNSESSION. To fix that,
 * the inner body of every read is now an exported `XCore(ctx, input)` helper
 * that takes an already-open org-scoped ctx and does NOT open its own
 * connection. The public `X(input)` actions stay thin `withOrgContext` wrappers
 * (so existing tests + CSV-export call sites are unchanged), and the new
 * `reportingBundle` action runs all the cores SEQUENTIALLY on ONE shared
 * connection — turning ~7 connections into 1 per page load.
 */

/** rpt.export.csv probe so the page can render the CSV buttons honestly. */
export async function getReportingExportAccessCore(
  ctx: ReportingContext,
): Promise<ReportingResult<{ canExportCsv: boolean }>> {
  if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
    return { ok: false, reason: 'forbidden' };
  }
  const canExportCsv = await hasReportingPermission(ctx, RPT_EXPORT_CSV_PERMISSION);
  return { ok: true, data: { canExportCsv } };
}

/** rpt.export.csv probe so the page can render the CSV buttons honestly. */
export async function getReportingExportAccess(): Promise<
  ReportingResult<{ canExportCsv: boolean }>
> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      getReportingExportAccessCore({ userId, orgId, client: client as QueryClient }),
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
    return await withSiteContext({ mode: 'read' },
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
              and (app.current_site_id() is null or site_id is null or site_id = app.current_site_id())
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

export async function productionSummaryCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProductionSummary>> {
  const window = normalizeWindow(input, 7);
  {
    {
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
             left join public.production_lines pl
               on pl.org_id = wo.org_id and pl.id = wo.production_line_id
            where wo.org_id = app.current_org_id()
              and (app.current_site_id() is null or coalesce(wo.site_id, pl.site_id) = app.current_site_id())
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
             left join public.production_lines pl
               on pl.org_id = wo.org_id and pl.id = wo.production_line_id
            where o.org_id = app.current_org_id()
              and (app.current_site_id() is null or coalesce(wo.site_id, pl.site_id) = app.current_site_id())
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
             left join public.production_lines pl
               on pl.org_id = wo.org_id and pl.id = wo.production_line_id
            where w.org_id = app.current_org_id()
              and (app.current_site_id() is null or coalesce(wo.site_id, pl.site_id) = app.current_site_id())
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
              and (app.current_site_id() is null or d.site_id is null or d.site_id = app.current_site_id())
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
             left join public.production_lines pl
               on pl.org_id = wo.org_id and pl.id = wo.production_line_id
            where wo.org_id = app.current_org_id()
              and (app.current_site_id() is null or coalesce(wo.site_id, pl.site_id) = app.current_site_id())
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
    }
  }
}

export async function productionSummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProductionSummary>> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      productionSummaryCore({ userId, orgId, client: client as QueryClient }, input),
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
    const access = await withSiteContext({ mode: 'read' },
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

export async function inventorySnapshotCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<InventorySnapshot>> {
  const window = normalizeWindow(input, 7);
  {
    {
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
                           and (app.current_site_id() is null or lp_uom.site_id = app.current_site_id())
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
              and (app.current_site_id() is null or lp.site_id = app.current_site_id())
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
    }
  }
}

export async function inventorySnapshot(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<InventorySnapshot>> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      inventorySnapshotCore({ userId, orgId, client: client as QueryClient }, input),
    );
  } catch (error) {
    console.error('[reporting] inventorySnapshot failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function receiptsSummaryCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ReceiptsSummary>> {
  const window = normalizeWindow(input, 7);
  {
    {
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const res = await ctx.client.query<{
          grn_id: string;
          grn_number: string;
          source_type: string;
          po_id: string | null;
          to_id: string | null;
          supplier_id: string | null;
          supplier_name: string | null;
          warehouse_id: string;
          warehouse_code: string | null;
          warehouse_name: string | null;
          status: string;
          item_line_count: string;
          received_qty_by_uom: QtyByUomRow[] | string | null;
          receipt_date: string | Date;
          completed_at: string | Date | null;
        }>(
          `select g.id::text as grn_id,
                  g.grn_number,
                  g.source_type,
                  g.po_id::text,
                  g.to_id::text,
                  g.supplier_id::text,
                  s.name as supplier_name,
                  g.warehouse_id::text,
                  w.code as warehouse_code,
                  w.name as warehouse_name,
                  g.status,
                  coalesce(gi.item_line_count, 0)::text as item_line_count,
                  coalesce(gi.received_qty_by_uom, '[]'::jsonb) as received_qty_by_uom,
                  g.receipt_date,
                  g.completed_at
             from public.grns g
             left join public.warehouses w
               on w.org_id = app.current_org_id()
              and w.id = g.warehouse_id
             left join public.suppliers s
               on s.org_id = app.current_org_id()
              and s.id = g.supplier_id
             left join lateral (
               select (select count(*)::integer
                         from public.grn_items gi_count
                        where gi_count.org_id = app.current_org_id()
                          and gi_count.grn_id = g.id) as item_line_count,
                      (select jsonb_agg(
                        jsonb_build_object('uom', by_uom.uom, 'qty', by_uom.total_qty::text)
                        order by by_uom.uom
                      )
                         from (
                   select gi.uom, sum(gi.received_qty) as total_qty
                     from public.grn_items gi
                    where gi.org_id = app.current_org_id()
                      and gi.grn_id = g.id
                    group by gi.uom
                         ) by_uom) as received_qty_by_uom
             ) gi on true
            where g.org_id = app.current_org_id()
              and (app.current_site_id() is null or g.site_id is null or g.site_id = app.current_site_id())
              and g.receipt_date >= $1::timestamptz
              and g.receipt_date <= $2::timestamptz
              and ($3::text is null or g.grn_number ilike '%' || $3::text || '%')
            order by g.receipt_date desc, g.grn_number desc
            limit 50`,
          [window.fromIso, window.toIso, window.orderQuery],
        );

        const rows: GrnReceiptRow[] = res.rows.map((r) => ({
          grnId: r.grn_id,
          grnNumber: r.grn_number,
          sourceType: r.source_type,
          poId: r.po_id,
          toId: r.to_id,
          supplierId: r.supplier_id,
          supplierName: r.supplier_name,
          warehouseId: r.warehouse_id,
          warehouseCode: r.warehouse_code,
          warehouseName: r.warehouse_name,
          status: r.status,
          itemLineCount: num(r.item_line_count),
          receivedQtyByUom: parseQtyByUom(r.received_qty_by_uom),
          receiptDate: toIso(r.receipt_date) ?? '',
          completedAt: toIso(r.completed_at),
        }));

        const qtyTotals = new Map<string, number>();
        rows.forEach((row) => {
          row.receivedQtyByUom.forEach((qty) => {
            qtyTotals.set(qty.uom, (qtyTotals.get(qty.uom) ?? 0) + num(qty.qty));
          });
        });

        return {
          ok: true,
          data: {
            days: window.days,
            totals: {
              grnCount: rows.length,
              completedGrnCount: rows.filter((r) => r.status === 'completed').length,
              cancelledGrnCount: rows.filter((r) => r.status === 'cancelled').length,
              itemLineCount: rows.reduce((a, r) => a + r.itemLineCount, 0),
              receivedQtyByUom: [...qtyTotals.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([uom, qty]) => ({ uom, qty: qty.toFixed(3) })),
            },
            rows,
          },
        };
    }
  }
}

export async function receiptsSummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ReceiptsSummary>> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      receiptsSummaryCore({ userId, orgId, client: client as QueryClient }, input),
    );
  } catch (error) {
    console.error('[reporting] receiptsSummary failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function shipmentsSummaryCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ShipmentsSummary>> {
  const window = normalizeWindow(input, 7);
  {
    {
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const res = await ctx.client.query<{
          shipment_id: string;
          shipment_number: string | null;
          sales_order_number: string | null;
          customer_name: string | null;
          status: string;
          carrier: string | null;
          tracking_number: string | null;
          total_weight_kg: string | number | null;
          box_count: string | number | null;
          created_at: string | Date;
          shipped_at: string | Date | null;
          delivered_at: string | Date | null;
        }>(
          `select sh.id::text as shipment_id,
                  sh.shipment_number,
                  so.order_number as sales_order_number,
                  c.name as customer_name,
                  sh.status,
                  sh.carrier,
                  sh.tracking_number,
                  sh.total_weight_kg,
                  (
                    select count(*)::int
                      from public.shipment_boxes sb
                     where sb.org_id = app.current_org_id()
                       and sb.shipment_id = sh.id
                       and sb.deleted_at is null
                  ) as box_count,
                  sh.created_at,
                  sh.shipped_at,
                  sh.delivered_at
             from public.shipments sh
             left join public.sales_orders so on so.id = sh.sales_order_id and so.org_id = app.current_org_id()
             left join public.customers c on c.id = coalesce(sh.customer_id, so.customer_id) and c.org_id = app.current_org_id()
            where sh.org_id = app.current_org_id()
              and (app.current_site_id() is null or sh.site_id is null or sh.site_id = app.current_site_id())
              and sh.deleted_at is null
              and sh.created_at >= $1::timestamptz
              and sh.created_at <= $2::timestamptz
              and ($3::text is null or sh.shipment_number ilike '%' || $3::text || '%')
            order by sh.created_at desc, sh.shipment_number desc
            limit 50`,
          [window.fromIso, window.toIso, window.orderQuery],
        );

        const statusRes = await ctx.client.query<{ status: string; count: string | number }>(
          `select sh.status, count(*)::int as count
             from public.shipments sh
            where sh.org_id = app.current_org_id()
              and (app.current_site_id() is null or sh.site_id is null or sh.site_id = app.current_site_id())
              and sh.deleted_at is null
              and sh.created_at >= $1::timestamptz
              and sh.created_at <= $2::timestamptz
            group by sh.status
            order by sh.status`,
          [window.fromIso, window.toIso],
        );

        const rows: ShipmentsSummary['rows'] = res.rows.map((r) => ({
          shipmentId: r.shipment_id,
          shipmentNumber: r.shipment_number ?? '',
          salesOrderNumber: r.sales_order_number,
          customerName: r.customer_name,
          status: r.status,
          carrier: r.carrier,
          trackingNumber: r.tracking_number,
          totalWeightKg: r.total_weight_kg == null ? null : num(r.total_weight_kg),
          boxCount: num(r.box_count),
          createdAt: toIso(r.created_at) ?? '',
          shippedAt: toIso(r.shipped_at),
          deliveredAt: toIso(r.delivered_at),
        }));

        const byStatus = statusRes.rows.map((r) => ({ status: r.status, count: num(r.count) }));
        const statusCount = (s: string) => byStatus.find((r) => r.status === s)?.count ?? 0;

        return {
          ok: true,
          data: {
            days: window.days,
            totals: {
              shipmentCount: byStatus.reduce((a, r) => a + r.count, 0),
              packingCount: statusCount('packing'),
              shippedCount: statusCount('shipped'),
              deliveredCount: statusCount('delivered'),
            },
            byStatus,
            rows,
          },
        };
    }
  }
}

export async function shipmentsSummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ShipmentsSummary>> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      shipmentsSummaryCore({ userId, orgId, client: client as QueryClient }, input),
    );
  } catch (error) {
    console.error('[reporting] shipmentsSummary failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function qualitySummaryCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<QualitySummary>> {
  const window = normalizeWindow(input, 30);
  {
    {
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        // Future follow-up: quality intentionally ignores line/order filters;
        // only the selected date window is applied to windowed entities.
        const holds = await ctx.client.query<{ hold_status: string; count: string }>(
          `select h.hold_status, count(*)::text as count
             from public.quality_holds h
            where h.org_id = app.current_org_id()
              and (app.current_site_id() is null or h.site_id is null or h.site_id = app.current_site_id())
              and h.hold_status in ('open', 'investigating', 'quarantined', 'escalated')
            group by h.hold_status
            order by h.hold_status`,
        );

        const inspections = await ctx.client.query<{ status: string; count: string }>(
          `select qi.status, count(*)::text as count
             from public.quality_inspections qi
            where qi.org_id = app.current_org_id()
              and (app.current_site_id() is null or qi.site_id is null or qi.site_id = app.current_site_id())
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
            where n.org_id = app.current_org_id()
              and (app.current_site_id() is null or n.site_id is null or n.site_id = app.current_site_id())`,
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
    }
  }
}

export async function qualitySummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<QualitySummary>> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      qualitySummaryCore({ userId, orgId, client: client as QueryClient }, input),
    );
  } catch (error) {
    console.error('[reporting] qualitySummary failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function procurementSummaryCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProcurementSummary>> {
  const window = normalizeWindow(input, 30);
  {
    {
        if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const pos = await ctx.client.query<{ status: string; count: string }>(
          `select po.status, count(*)::text as count
             from public.purchase_orders po
            where po.org_id = app.current_org_id()
              and (app.current_site_id() is null or po.site_id is null or po.site_id = app.current_site_id())
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
              and (app.current_site_id() is null or po.site_id is null or po.site_id = app.current_site_id())
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
             left join public.warehouses wf
               on wf.org_id = app.current_org_id()
              and wf.id = t.from_warehouse_id
             left join public.warehouses wt
               on wt.org_id = app.current_org_id()
              and wt.id = t.to_warehouse_id
            where t.org_id = app.current_org_id()
              and (
                app.current_site_id() is null
                or wf.site_id = app.current_site_id()
                or wt.site_id = app.current_site_id()
              )
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
    }
  }
}

export async function procurementSummary(
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProcurementSummary>> {
  try {
    return await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      procurementSummaryCore({ userId, orgId, client: client as QueryClient }, input),
    );
  } catch (error) {
    console.error('[reporting] procurementSummary failed', error);
    return { ok: false, reason: 'error' };
  }
}

export async function getSpendBySupplierCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<SpendBySupplierRow[]>> {
  if (!(await hasReportingPermission(ctx, RPT_DASHBOARD_VIEW_PERMISSION))) {
    return { ok: false, reason: 'forbidden' };
  }

  const window = normalizeWindow(input, 30);

  const res = await ctx.client.query<{
    supplier_id: string;
    supplier_name: string | null;
    total_spend: string | null;
    line_count: string;
  }>(
    `select po.supplier_id::text as supplier_id,
            s.name as supplier_name,
            coalesce(sum(pol.qty * pol.unit_price), 0)::text as total_spend,
            count(pol.id)::text as line_count
       from public.purchase_orders po
       join public.purchase_order_lines pol
         on pol.org_id = app.current_org_id()
        and pol.po_id = po.id
       join public.suppliers s
         on s.org_id = app.current_org_id()
        and s.id = po.supplier_id
      where po.org_id = app.current_org_id()
        and (app.current_site_id() is null or po.site_id is null or po.site_id = app.current_site_id())
        and po.status = any($1::text[])
        and po.created_at >= $2::timestamptz
        and po.created_at <= $3::timestamptz
      group by po.supplier_id, s.name
      order by coalesce(sum(pol.qty * pol.unit_price), 0) desc, s.name asc`,
    [REAL_SPEND_PO_STATUSES, window.fromIso, window.toIso],
  );

  return {
    ok: true,
    data: res.rows.map((row) => ({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name ?? '',
      totalSpend: num(row.total_spend),
      lineCount: num(row.line_count),
    })),
  };
}

export async function getSpendBySupplier(): Promise<SpendBySupplierRow[]> {
  try {
    const result = await withSiteContext({ mode: 'read' },({ userId, orgId, client }) =>
      getSpendBySupplierCore({ userId, orgId, client: client as QueryClient }),
    );
    return result.ok ? result.data : [];
  } catch (error) {
    console.error('[reporting] getSpendBySupplier failed', error);
    return [];
  }
}

/**
 * Single-connection bundle for the `/reporting` page. Opens ONE `withOrgContext`
 * (= 1 app-pool connection) and runs every read-action core on that shared
 * `ctx.client` SEQUENTIALLY.
 *
 * Why sequentially: `ctx.client` is one `pg.PoolClient`. A PoolClient cannot run
 * queries concurrently — issuing a second `query()` before the first resolves
 * throws "another command is already in progress" (the pg protocol is one
 * in-flight statement per connection, and these cores fire multiple queries
 * each). So we await each core in series. This trades a little latency for going
 * from ~7 pooled connections per page load down to 1 — the connection-pool
 * exhaustion fix (EMAXCONNSESSION under load).
 *
 * The page consumes the same `ReportingResult` shapes the individual actions
 * return, so the forbidden / error handling in `loadReportingContent` is
 * unchanged. The individual public actions stay for the CSV exports + tests.
 */
export async function reportingBundle(input: ReportingLoaderInput = {}): Promise<{
  production: ReportingResult<ProductionSummary>;
  inventory: ReportingResult<InventorySnapshot>;
  quality: ReportingResult<QualitySummary>;
  procurement: ReportingResult<ProcurementSummary>;
  receipts: ReportingResult<ReceiptsSummary>;
  shipments: ReportingResult<ShipmentsSummary>;
  spendBySupplier: ReportingResult<SpendBySupplierRow[]>;
  exportAccess: ReportingResult<{ canExportCsv: boolean }>;
}> {
  // Production/procurement/receipts honour the line+order filters; inventory and
  // quality intentionally take only the date window (same scoping the page used
  // when it called the actions individually).
  const dateWindow: ReportingLoaderInput = { days: input.days, from: input.from, to: input.to };
  const withOrder: ReportingLoaderInput = { ...dateWindow, orderQuery: input.orderQuery };

  try {
    return await withSiteContext({ mode: 'read' },async ({ userId, orgId, client }) => {
      const ctx: ReportingContext = { userId, orgId, client: client as QueryClient };

      // SEQUENTIAL on the shared single PoolClient — see jsdoc above.
      const production = await productionSummaryCore(ctx, {
        ...withOrder,
        lineId: input.lineId,
      });
      const inventory = await inventorySnapshotCore(ctx, dateWindow);
      const quality = await qualitySummaryCore(ctx, dateWindow);
      const procurement = await procurementSummaryCore(ctx, withOrder);
      const receipts = await receiptsSummaryCore(ctx, withOrder);
      const shipments = await shipmentsSummaryCore(ctx, withOrder);
      const spendBySupplier = await getSpendBySupplierCore(ctx, dateWindow);
      const exportAccess = await getReportingExportAccessCore(ctx);

      return { production, inventory, quality, procurement, receipts, shipments, spendBySupplier, exportAccess };
    });
  } catch (error) {
    console.error('[reporting] reportingBundle failed', error);
    const err = { ok: false, reason: 'error' } as const;
    return {
      production: err,
      inventory: err,
      quality: err,
      procurement: err,
      receipts: err,
      shipments: err,
      spendBySupplier: err,
      exportAccess: err,
    };
  }
}
