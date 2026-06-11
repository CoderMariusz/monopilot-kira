'use client';

/**
 * WH-001 — Warehouse dashboard (client island: KPI strip + expiry summary top-5).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/warehouse/
 *   dashboard.jsx:3-213 (data-prototype-label: warehouse_dashboard):
 *     KPI strip                                   → dashboard.jsx:39-60
 *     expiry summary (red/amber cards + top-5)    → dashboard.jsx:93-128
 *
 * Presentational only: receives already-computed, org-scoped KPIs + the soonest-
 * expiring rows + resolved i18n labels from the RSC page. No data fetching, no
 * permission logic (both resolved server-side). The interactive bits of the
 * prototype (select-filter activity feed, alert dismissal) are out of LANE-D scope.
 *
 * DEVIATIONS (red-lines — see the omitted-cards note rendered below):
 *   - Inventory-value KPI (dashboard.jsx:30) is OMITTED — no valuation/costing
 *     field is exposed by the warehouse read actions, so there is no honest value
 *     to render. We refuse to fabricate one.
 *   - FEFO override-rate card (dashboard.jsx:189-207) is OMITTED — no FEFO-override
 *     telemetry source is exposed by the read actions.
 *   - Alerts panel, activity feed and intermediate-buffer widget (dashboard.jsx:
 *     66-91,130-208) are deferred to a later lane (no backing read in scope).
 */

import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type DashboardKpis = {
  activeLps: number;
  uniqueSkus: number;
  expiring7d: number;
  expiring30d: number;
  qcHold: number;
  blocked: number;
};

export type DashboardExpiryRow = {
  lpId: string;
  lpNumber: string;
  tier: 'red' | 'amber';
  itemCode: string | null;
  itemName: string | null;
  batchNumber: string | null;
  locationCode: string | null;
  warehouseCode: string | null;
  expiryDate: string;
  daysLeft: number;
  status: string;
};

export type DashboardLabels = {
  kpi: {
    activeLps: string;
    activeLpsSub: string;
    uniqueSkus: string;
    uniqueSkusSub: string;
    expiring7d: string;
    expiring7dSub: string;
    expiring30d: string;
    expiring30dSub: string;
    qcHold: string;
    qcHoldSub: string;
    blocked: string;
    blockedSub: string;
  };
  expiry: {
    title: string;
    open: string;
    redCard: string;
    redCardSub: string;
    amberCard: string;
    amberCardSub: string;
    top5Title: string;
    columns: { lp: string; product: string; batch: string; expiry: string; location: string; status: string };
    empty: string;
    daysLeft: string;
    expired: string;
    none: string;
  };
  omitted: { inventoryValue: string; fefoOverride: string };
  status: Record<string, string>;
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'info',
  allocated: 'info',
  received: 'secondary',
  quarantine: 'warning',
  blocked: 'danger',
};

type KpiAccent = 'blue' | 'red' | 'amber';

function KpiCard({
  testId,
  label,
  value,
  sub,
  accent,
  href,
}: {
  testId: string;
  label: string;
  value: number;
  sub: string;
  accent: KpiAccent;
  href: string;
}) {
  const accentBorder =
    accent === 'red' ? 'border-l-red-500' : accent === 'amber' ? 'border-l-amber-500' : 'border-l-sky-500';
  return (
    <Link
      href={href}
      data-testid={testId}
      className={`flex flex-col rounded-xl border border-slate-200 border-l-4 ${accentBorder} bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span data-testid={`${testId}-value`} className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-950">
        {value.toLocaleString()}
      </span>
      <span className="mt-0.5 text-[11px] text-slate-400">{sub}</span>
    </Link>
  );
}

function ExpiryDateCell({ row, labels }: { row: DashboardExpiryRow; labels: DashboardLabels }) {
  const date = row.expiryDate.slice(0, 10);
  const suffix =
    row.daysLeft < 0
      ? labels.expiry.expired.replace('{days}', String(Math.abs(row.daysLeft)))
      : labels.expiry.daysLeft.replace('{days}', String(row.daysLeft));
  const cls = row.daysLeft <= 7 ? 'text-red-700 font-medium' : 'text-amber-700';
  return (
    <span className={`font-mono text-xs ${cls}`}>
      {date}
      <span className="ml-1 text-[10px]">· {suffix}</span>
    </span>
  );
}

export function WarehouseDashboardClient({
  kpis,
  expiryRows,
  labels,
  locale,
}: {
  kpis: DashboardKpis;
  expiryRows: DashboardExpiryRow[];
  labels: DashboardLabels;
  locale: string;
}) {
  return (
    <div className="flex flex-col gap-6" data-testid="warehouse-dashboard">
      {/* KPI strip — parity dashboard.jsx:39-60 (6 computable cards; value + FEFO omitted). */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="wh-kpi-strip">
        <KpiCard
          testId="wh-kpi-activeLps"
          label={labels.kpi.activeLps}
          value={kpis.activeLps}
          sub={labels.kpi.activeLpsSub}
          accent="blue"
          href={`/${locale}/warehouse/license-plates`}
        />
        <KpiCard
          testId="wh-kpi-uniqueSkus"
          label={labels.kpi.uniqueSkus}
          value={kpis.uniqueSkus}
          sub={labels.kpi.uniqueSkusSub}
          accent="blue"
          href={`/${locale}/warehouse/inventory`}
        />
        <KpiCard
          testId="wh-kpi-expiring7d"
          label={labels.kpi.expiring7d}
          value={kpis.expiring7d}
          sub={labels.kpi.expiring7dSub}
          accent="red"
          href={`/${locale}/warehouse/expiry`}
        />
        <KpiCard
          testId="wh-kpi-expiring30d"
          label={labels.kpi.expiring30d}
          value={kpis.expiring30d}
          sub={labels.kpi.expiring30dSub}
          accent="amber"
          href={`/${locale}/warehouse/expiry`}
        />
        <KpiCard
          testId="wh-kpi-qcHold"
          label={labels.kpi.qcHold}
          value={kpis.qcHold}
          sub={labels.kpi.qcHoldSub}
          accent="amber"
          href={`/${locale}/warehouse/license-plates`}
        />
        <KpiCard
          testId="wh-kpi-blocked"
          label={labels.kpi.blocked}
          value={kpis.blocked}
          sub={labels.kpi.blockedSub}
          accent="red"
          href={`/${locale}/warehouse/license-plates`}
        />
      </div>

      {/* RED-LINE: inventory-value + FEFO-override-rate cards (dashboard.jsx:30,189-207)
          are OMITTED — no backing data is exposed by the warehouse read actions.
          Documented (sr-only) so the deviation is auditable, never fabricated. */}
      <p className="sr-only" data-testid="wh-kpi-omitted-value">
        {labels.omitted.inventoryValue}
      </p>
      <p className="sr-only" data-testid="wh-kpi-omitted-fefo">
        {labels.omitted.fefoOverride}
      </p>

      {/* Expiry summary — parity dashboard.jsx:93-128. */}
      <Card className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{labels.expiry.title}</h2>
          <Link
            href={`/${locale}/warehouse/expiry`}
            data-testid="wh-expiry-open"
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            {labels.expiry.open}
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/${locale}/warehouse/expiry`}
            data-testid="wh-expiry-card-red"
            className="flex flex-col rounded-lg border border-red-200 bg-red-50 p-4 transition hover:border-red-300"
          >
            <span data-testid="wh-expiry-card-red-count" className="font-mono text-3xl font-bold text-red-700">
              {kpis.expiring7d.toLocaleString()}
            </span>
            <span className="mt-1 text-sm font-medium text-red-800">{labels.expiry.redCard}</span>
            <span className="text-[11px] text-red-600">{labels.expiry.redCardSub}</span>
          </Link>
          <Link
            href={`/${locale}/warehouse/expiry`}
            data-testid="wh-expiry-card-amber"
            className="flex flex-col rounded-lg border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
          >
            <span data-testid="wh-expiry-card-amber-count" className="font-mono text-3xl font-bold text-amber-700">
              {kpis.expiring30d.toLocaleString()}
            </span>
            <span className="mt-1 text-sm font-medium text-amber-800">{labels.expiry.amberCard}</span>
            <span className="text-[11px] text-amber-600">{labels.expiry.amberCardSub}</span>
          </Link>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{labels.expiry.top5Title}</p>
          {expiryRows.length === 0 ? (
            <p data-testid="wh-expiry-top5-empty" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {labels.expiry.empty}
            </p>
          ) : (
            <Table aria-label={labels.expiry.top5Title} data-testid="wh-expiry-top5-table">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.expiry.columns.lp}</TableHead>
                  <TableHead scope="col">{labels.expiry.columns.product}</TableHead>
                  <TableHead scope="col">{labels.expiry.columns.batch}</TableHead>
                  <TableHead scope="col">{labels.expiry.columns.expiry}</TableHead>
                  <TableHead scope="col">{labels.expiry.columns.location}</TableHead>
                  <TableHead scope="col">{labels.expiry.columns.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiryRows.map((row) => (
                  <TableRow key={row.lpId} data-testid={`wh-expiry-top5-row-${row.lpId}`}>
                    <TableCell className="font-mono text-sm font-semibold text-sky-700">
                      <Link
                        href={`/${locale}/warehouse/license-plates/${row.lpId}`}
                        data-testid={`wh-expiry-top5-link-${row.lpId}`}
                        className="hover:underline"
                      >
                        {row.lpNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-900">{row.itemName ?? labels.expiry.none}</span>
                        {row.itemCode ? <span className="font-mono text-[11px] text-slate-500">{row.itemCode}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">{row.batchNumber ?? labels.expiry.none}</TableCell>
                    <TableCell>
                      <ExpiryDateCell row={row} labels={labels} />
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">
                      {row.locationCode ?? labels.expiry.none}
                      {row.warehouseCode ? <span className="text-slate-400"> · {row.warehouseCode}</span> : null}
                    </TableCell>
                    <TableCell>
                      {row.status ? (
                        <Badge variant={STATUS_VARIANT[row.status] ?? 'muted'} data-testid={`wh-expiry-top5-status-${row.lpId}`}>
                          {labels.status[row.status] ?? row.status}
                        </Badge>
                      ) : (
                        <span data-testid={`wh-expiry-top5-status-${row.lpId}`} className="text-slate-400">{labels.expiry.none}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
