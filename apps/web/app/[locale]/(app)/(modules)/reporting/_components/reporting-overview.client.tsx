'use client';

/**
 * W9-M3 — 12-Reporting read-only overview (client island).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/reporting/
 *   kpi-screens.jsx:5-175 (RptQcHolds — the canonical per-dashboard layout):
 *     KPI tile row (kpi-row-4: kpi-label / kpi-value / kpi-sub) → kpi-screens.jsx:60-69
 *     card + card-head/card-title + dense table                → kpi-screens.jsx:89-130
 *     EmptyState inside a card when no rows                    → kpi-screens.jsx:80-87
 *     Export action in the page head (ExportDropdown)          → kpi-screens.jsx:43
 *   plus dashboard.jsx:1-110 (RptHome) for the module framing. DEVIATION
 *   (documented): the prototype's home is a 10-dashboard catalog grid backed by
 *   reporting_dashboards config + per-dashboard drill screens; this first slice
 *   condenses FOUR honest read-only summaries (production / inventory / quality
 *   / procurement) onto one page — same KPI-row + dense-table + EmptyState
 *   vocabulary, no catalog, no week selector / freshness strip / save-preset
 *   (no backing read model in scope). CSV export is per-section (client-side
 *   RFC-4180 via lib/shared/download, gated on rpt.export.csv) instead of the
 *   prototype's modal ExportDropdown (rpt.export.* schedule/PDF not in scope).
 *
 * Receives already-loaded org-scoped summaries + resolved i18n labels from the
 * RSC page. Permission logic stays server-side: `canExportCsv` controls disabled
 * button state, and production CSV export revalidates RBAC in its Server Action.
 */

import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../lib/shared/download';
import { exportProductionSummaryCsv } from '../_actions/report-read-actions';
import type {
  InventorySnapshot,
  ProcurementSummary,
  ProductionSummary,
  QualitySummary,
} from '../_actions/shared';

export type ReportingLabels = {
  page: {
    exportCsv: string;
    exportCsvDenied: string;
    windowDays: string; // pre-interpolated per section by the page
    asOfNow: string;
    notAvailable: string;
  };
  production: {
    title: string;
    window: string;
    kpi: {
      wosCompleted: string;
      outputKg: string;
      wasteKg: string;
      wastePct: string;
      avgYieldPct: string;
      downtimeMinutes: string;
    };
    downtimeNote: string;
    columns: {
      wo: string;
      item: string;
      planned: string;
      actual: string;
      uom: string;
      yield: string;
      completedAt: string;
    };
    empty: string;
  };
  inventory: {
    title: string;
    window: string;
    kpi: {
      lpCount: string;
      qtyKg: string;
      blockedLpCount: string;
      expiredCount: string;
      expiring7dCount: string;
    };
    qtyNote: string;
    columns: {
      warehouse: string;
      lps: string;
      active: string;
      blocked: string;
      qtyKg: string;
      expired: string;
      expiring7d: string;
    };
    empty: string;
  };
  quality: {
    title: string;
    window: string;
    kpi: { openHolds: string; inspections: string; ncrOpen: string; ncrClosed: string };
    entity: { hold: string; inspection: string; ncr: string };
    columns: { entity: string; status: string; count: string };
    empty: string;
  };
  procurement: {
    title: string;
    window: string;
    kpi: { posInWindow: string; confirmedToGrn: string; createdToGrn: string; openTos: string };
    confirmedToGrnNote: string;
    createdToGrnNote: string;
    columns: { status: string; count: string };
    empty: string;
  };
};

export type ReportingOverviewProps = {
  production: ProductionSummary;
  inventory: InventorySnapshot;
  quality: QualitySummary;
  procurement: ProcurementSummary;
  productionExportInput: {
    from: string;
    to: string;
    lineId?: string;
    orderQuery?: string;
  };
  canExportCsv: boolean;
  labels: ReportingLabels;
};

// ── Shared section primitives (prototype kpi-row / card vocabulary) ───────────

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      data-testid="rpt-kpi"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-0.5 min-h-4 text-[11px] text-slate-500">{sub ?? ' '}</div>
    </div>
  );
}

function ExportButton({
  onExport,
  canExportCsv,
  label,
  deniedTitle,
  testId,
  pending = false,
}: {
  onExport: () => unknown;
  canExportCsv: boolean;
  label: string;
  deniedTitle: string;
  testId: string;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={!canExportCsv || pending}
      title={canExportCsv ? undefined : deniedTitle}
      onClick={onExport}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      ⇪ {label}
    </button>
  );
}

function SectionEmpty({ message, testId }: { message: string; testId: string }) {
  return (
    <div data-testid={testId} className="px-6 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function na(value: string | null | undefined, placeholder: string): string {
  return value == null || value === '' ? placeholder : value;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// ── Section: production ───────────────────────────────────────────────────────

function ProductionSection({
  data,
  labels,
  canExportCsv,
  notAvailable,
  exportLabel,
  exportDenied,
  exportInput,
}: {
  data: ProductionSummary;
  labels: ReportingLabels['production'];
  canExportCsv: boolean;
  notAvailable: string;
  exportLabel: string;
  exportDenied: string;
  exportInput: ReportingOverviewProps['productionExportInput'];
}) {
  const [pending, startTransition] = React.useTransition();
  const c = labels.columns;
  const exportRows = () => {
    startTransition(() => {
      void exportProductionSummaryCsv(exportInput).then((result) => {
        downloadCsv(result.csv, result.filename);
      });
    });
  };

  return (
    <Card data-testid="rpt-section-production">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{labels.title}</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">{labels.window}</p>
        </div>
        <ExportButton
          onExport={exportRows}
          canExportCsv={canExportCsv}
          label={exportLabel}
          deniedTitle={exportDenied}
          testId="rpt-export-production"
          pending={pending}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KpiTile label={labels.kpi.wosCompleted} value={String(data.wosCompleted)} />
          <KpiTile label={labels.kpi.outputKg} value={data.outputKg} />
          <KpiTile label={labels.kpi.wasteKg} value={data.wasteKg} />
          <KpiTile label={labels.kpi.wastePct} value={na(data.wastePct, notAvailable)} />
          <KpiTile label={labels.kpi.avgYieldPct} value={na(data.avgYieldPct, notAvailable)} />
          <KpiTile
            label={labels.kpi.downtimeMinutes}
            value={String(data.downtimeMinutes)}
            sub={labels.downtimeNote}
          />
        </div>
        {data.rows.length === 0 ? (
          <SectionEmpty message={labels.empty} testId="rpt-empty-production" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{c.wo}</TableHead>
                <TableHead>{c.item}</TableHead>
                <TableHead className="text-right">{c.planned}</TableHead>
                <TableHead className="text-right">{c.actual}</TableHead>
                <TableHead>{c.uom}</TableHead>
                <TableHead className="text-right">{c.yield}</TableHead>
                <TableHead>{c.completedAt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.woNumber}>
                  <TableCell className="font-mono text-xs font-semibold">{r.woNumber}</TableCell>
                  <TableCell className="text-xs">
                    {r.itemCode ? `${r.itemCode} — ${r.itemName ?? ''}` : (r.itemName ?? notAvailable)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.plannedQty}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{na(r.actualQty, notAvailable)}</TableCell>
                  <TableCell className="text-xs">{r.uom}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{na(r.yieldPct, notAvailable)}</TableCell>
                  <TableCell className="font-mono text-xs">{shortDate(r.completedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section: inventory ────────────────────────────────────────────────────────

function InventorySection({
  data,
  labels,
  canExportCsv,
  asOfNow,
  exportLabel,
  exportDenied,
  notAvailable,
}: {
  data: InventorySnapshot;
  labels: ReportingLabels['inventory'];
  canExportCsv: boolean;
  asOfNow: string;
  exportLabel: string;
  exportDenied: string;
  notAvailable: string;
}) {
  const c = labels.columns;
  const exportRows = () =>
    downloadCsv(
      toCsv(
        [c.warehouse, c.lps, c.active, c.blocked, c.qtyKg, c.expired, c.expiring7d],
        data.rows.map((r) => [
          r.warehouseCode ?? r.warehouseId,
          r.lpCount,
          r.activeLpCount,
          r.blockedLpCount,
          r.qtyKg,
          r.expiredCount,
          r.expiring7dCount,
        ]),
      ),
      `reporting-inventory-${isoDateStamp()}.csv`,
    );

  return (
    <Card data-testid="rpt-section-inventory">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{labels.title}</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">{labels.window}</p>
        </div>
        <ExportButton
          onExport={exportRows}
          canExportCsv={canExportCsv}
          label={exportLabel}
          deniedTitle={exportDenied}
          testId="rpt-export-inventory"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiTile label={labels.kpi.lpCount} value={String(data.totals.lpCount)} />
          <KpiTile label={labels.kpi.qtyKg} value={data.totals.qtyKg} sub={labels.qtyNote} />
          <KpiTile label={labels.kpi.blockedLpCount} value={String(data.totals.blockedLpCount)} />
          <KpiTile label={labels.kpi.expiredCount} value={String(data.totals.expiredCount)} />
          <KpiTile label={labels.kpi.expiring7dCount} value={String(data.totals.expiring7dCount)} />
        </div>
        {data.rows.length === 0 ? (
          <SectionEmpty message={labels.empty} testId="rpt-empty-inventory" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{c.warehouse}</TableHead>
                <TableHead className="text-right">{c.lps}</TableHead>
                <TableHead className="text-right">{c.active}</TableHead>
                <TableHead className="text-right">{c.blocked}</TableHead>
                <TableHead className="text-right">{c.qtyKg}</TableHead>
                <TableHead className="text-right">{c.expired}</TableHead>
                <TableHead className="text-right">{c.expiring7d}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.warehouseId}>
                  <TableCell className="text-xs">
                    <span className="font-mono font-semibold">{r.warehouseCode ?? notAvailable}</span>
                    {r.warehouseName ? <span className="ml-2 text-slate-500">{r.warehouseName}</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.lpCount}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.activeLpCount}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.blockedLpCount}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.qtyKg}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.expiredCount}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.expiring7dCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-[11px] text-slate-400">{asOfNow}</p>
      </CardContent>
    </Card>
  );
}

// ── Section: quality ──────────────────────────────────────────────────────────

function QualitySection({
  data,
  labels,
  canExportCsv,
  exportLabel,
  exportDenied,
}: {
  data: QualitySummary;
  labels: ReportingLabels['quality'];
  canExportCsv: boolean;
  exportLabel: string;
  exportDenied: string;
}) {
  const c = labels.columns;
  const inspectionsTotal = data.inspectionsByStatus.reduce((a, r) => a + r.count, 0);
  const entityLabel = (entity: 'hold' | 'inspection' | 'ncr') => labels.entity[entity];
  const exportRows = () =>
    downloadCsv(
      toCsv(
        [c.entity, c.status, c.count],
        data.rows.map((r) => [entityLabel(r.entity), r.status, r.count]),
      ),
      `reporting-quality-${isoDateStamp()}.csv`,
    );

  return (
    <Card data-testid="rpt-section-quality">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{labels.title}</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">{labels.window}</p>
        </div>
        <ExportButton
          onExport={exportRows}
          canExportCsv={canExportCsv}
          label={exportLabel}
          deniedTitle={exportDenied}
          testId="rpt-export-quality"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label={labels.kpi.openHolds} value={String(data.openHolds)} />
          <KpiTile label={labels.kpi.inspections} value={String(inspectionsTotal)} />
          <KpiTile label={labels.kpi.ncrOpen} value={String(data.ncrOpen)} />
          <KpiTile label={labels.kpi.ncrClosed} value={String(data.ncrClosedInWindow)} />
        </div>
        {data.rows.every((r) => r.count === 0) ? (
          <SectionEmpty message={labels.empty} testId="rpt-empty-quality" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{c.entity}</TableHead>
                <TableHead>{c.status}</TableHead>
                <TableHead className="text-right">{c.count}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={`${r.entity}-${r.status}`}>
                  <TableCell className="text-xs">{entityLabel(r.entity)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.status}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section: procurement ──────────────────────────────────────────────────────

function ProcurementSection({
  data,
  labels,
  canExportCsv,
  notAvailable,
  exportLabel,
  exportDenied,
}: {
  data: ProcurementSummary;
  labels: ReportingLabels['procurement'];
  canExportCsv: boolean;
  notAvailable: string;
  exportLabel: string;
  exportDenied: string;
}) {
  const c = labels.columns;
  const posTotal = data.posByStatus.reduce((a, r) => a + r.count, 0);
  const exportRows = () =>
    downloadCsv(
      toCsv(
        [c.status, c.count],
        data.posByStatus.map((r) => [r.status, r.count]),
      ),
      `reporting-procurement-${isoDateStamp()}.csv`,
    );

  return (
    <Card data-testid="rpt-section-procurement">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{labels.title}</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">{labels.window}</p>
        </div>
        <ExportButton
          onExport={exportRows}
          canExportCsv={canExportCsv}
          label={exportLabel}
          deniedTitle={exportDenied}
          testId="rpt-export-procurement"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label={labels.kpi.posInWindow} value={String(posTotal)} />
          <KpiTile
            label={labels.kpi.confirmedToGrn}
            value={notAvailable}
            sub={labels.confirmedToGrnNote}
          />
          <KpiTile
            label={labels.kpi.createdToGrn}
            value={na(data.avgCreatedToFirstGrnDays, notAvailable)}
            sub={labels.createdToGrnNote}
          />
          <KpiTile label={labels.kpi.openTos} value={String(data.openToCount)} />
        </div>
        {data.posByStatus.length === 0 ? (
          <SectionEmpty message={labels.empty} testId="rpt-empty-procurement" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{c.status}</TableHead>
                <TableHead className="text-right">{c.count}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.posByStatus.map((r) => (
                <TableRow key={r.status}>
                  <TableCell className="font-mono text-xs">{r.status}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function ReportingOverviewClient({
  production,
  inventory,
  quality,
  procurement,
  productionExportInput,
  canExportCsv,
  labels,
}: ReportingOverviewProps) {
  return (
    <div className="flex flex-col gap-6" data-testid="reporting-overview">
      <ProductionSection
        data={production}
        labels={labels.production}
        canExportCsv={canExportCsv}
        notAvailable={labels.page.notAvailable}
        exportLabel={labels.page.exportCsv}
        exportDenied={labels.page.exportCsvDenied}
        exportInput={productionExportInput}
      />
      <InventorySection
        data={inventory}
        labels={labels.inventory}
        canExportCsv={canExportCsv}
        asOfNow={labels.page.asOfNow}
        exportLabel={labels.page.exportCsv}
        exportDenied={labels.page.exportCsvDenied}
        notAvailable={labels.page.notAvailable}
      />
      <QualitySection
        data={quality}
        labels={labels.quality}
        canExportCsv={canExportCsv}
        exportLabel={labels.page.exportCsv}
        exportDenied={labels.page.exportCsvDenied}
      />
      <ProcurementSection
        data={procurement}
        labels={labels.procurement}
        canExportCsv={canExportCsv}
        notAvailable={labels.page.notAvailable}
        exportLabel={labels.page.exportCsv}
        exportDenied={labels.page.exportCsvDenied}
      />
    </div>
  );
}
