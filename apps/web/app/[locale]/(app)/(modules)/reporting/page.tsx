/**
 * W9-M3 — `/reporting` read-only overview (replaces the Wave-0 module stub).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/reporting/
 *   dashboard.jsx:1-110 (RPT-HOME framing) + kpi-screens.jsx:5-175 (RptQcHolds
 *   KPI-row / dense-table / EmptyState vocabulary). DEVIATION (documented in
 *   reporting-overview.client.tsx): the prototype home is a 10-dashboard
 *   catalog with per-dashboard drill screens; this first slice condenses four
 *   honest read-only summaries onto one page — no catalog, no presets, no
 *   schedules (no backing read models in scope).
 *
 * Server Component: reads org-scoped data via the four read actions in
 * _actions/report-read-actions.ts. RBAC (rpt.dashboard.view — the seeded-but-
 * never-enforced family from migration 214, audit finding #9) is enforced
 * INSIDE each action; this page surfaces `forbidden` as the denied panel and
 * never trusts a client flag. CSV buttons are gated on rpt.export.csv
 * (getReportingExportAccess) and render disabled when denied.
 *
 * i18n: the `reporting` namespace is not yet merged into next-intl, so labels
 * resolve server-side from the staged bundle (_meta/i18n-staging/reporting.json,
 * en + pl real) via getRptTranslator and are passed down as plain props.
 *
 * UI states: loading (Suspense skeleton), empty (per-section honest empty copy),
 * error (failed live read → banner, never a 500), permission-denied (forbidden →
 * denied panel, nothing privileged rendered).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  reportingBundle,
  reportingProductionLines,
} from './_actions/report-read-actions';
import {
  PeriodSelector,
  type PeriodSelectorLabels,
} from './_components/period-selector.client';
import {
  ReportingOverviewClient,
  type ReportingLabels,
} from './_components/reporting-overview.client';
import { getRptTranslator } from './rpt-labels';
import {
  type ReportingFilters,
  parseReportingFilters,
} from './shared';
import {
  reportingWindowDays,
  type ReportingSearchParams,
  type ReportingWindow,
} from './_lib/period';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<ReportingSearchParams>;
};

function ReportingSkeleton() {
  return (
    <div data-testid="reporting-loading" aria-busy="true" className="flex flex-col gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}

function formatWindowLabel(window: ReportingWindow): string {
  return `${window.from.toISOString().slice(0, 10)} - ${window.to.toISOString().slice(0, 10)}`;
}

async function buildLabels(locale: string, window: ReportingWindow): Promise<ReportingLabels> {
  const t = getRptTranslator(locale);
  const liveT = await getTranslations({ locale, namespace: 'reporting' });
  const windowLabel = formatWindowLabel(window);
  return {
    page: {
      exportCsv: t('page.exportCsv'),
      exportCsvDenied: t('page.exportCsvDenied'),
      windowDays: t('page.windowDays', { days: reportingWindowDays(window) }),
      asOfNow: t('page.asOfNow'),
      notAvailable: t('page.notAvailable'),
    },
    production: {
      title: t('production.title'),
      window: windowLabel,
      kpi: {
        wosCompleted: t('production.kpi.wosCompleted'),
        outputKg: t('production.kpi.outputKg'),
        wasteKg: t('production.kpi.wasteKg'),
        wastePct: t('production.kpi.wastePct'),
        avgYieldPct: t('production.kpi.avgYieldPct'),
        downtimeMinutes: t('production.kpi.downtimeMinutes'),
      },
      downtimeNote: t('production.downtimeNote'),
      columns: {
        wo: t('production.columns.wo'),
        item: t('production.columns.item'),
        planned: t('production.columns.planned'),
        actual: t('production.columns.actual'),
        uom: t('production.columns.uom'),
        yield: t('production.columns.yield'),
        completedAt: t('production.columns.completedAt'),
      },
      empty: t('production.empty'),
    },
    inventory: {
      title: t('inventory.title'),
      window: t('page.asOfNow'),
      kpi: {
        lpCount: t('inventory.kpi.lpCount'),
        qtyKg: t('inventory.kpi.qtyKg'),
        blockedLpCount: t('inventory.kpi.blockedLpCount'),
        expiredCount: t('inventory.kpi.expiredCount'),
        expiring7dCount: t('inventory.kpi.expiring7dCount'),
      },
      qtyNote: t('inventory.qtyNote'),
      columns: {
        warehouse: t('inventory.columns.warehouse'),
        lps: t('inventory.columns.lps'),
        active: t('inventory.columns.active'),
        blocked: t('inventory.columns.blocked'),
        qtyKg: t('inventory.columns.qtyKg'),
        qtyByUom: liveT('inventory.columns.qtyByUom'),
        expired: t('inventory.columns.expired'),
        expiring7d: t('inventory.columns.expiring7d'),
      },
      empty: t('inventory.empty'),
    },
    quality: {
      title: t('quality.title'),
      window: windowLabel,
      kpi: {
        openHolds: t('quality.kpi.openHolds'),
        inspections: t('quality.kpi.inspections'),
        ncrOpen: t('quality.kpi.ncrOpen'),
        ncrClosed: t('quality.kpi.ncrClosed'),
      },
      entity: {
        hold: t('quality.entity.hold'),
        inspection: t('quality.entity.inspection'),
        ncr: t('quality.entity.ncr'),
      },
      status: {
        open: t('quality.status.open'),
        pending: t('quality.status.pending'),
        passed: t('quality.status.passed'),
        failed: t('quality.status.failed'),
        on_hold: t('quality.status.on_hold'),
        closed_in_window: t('quality.status.closed_in_window'),
      },
      columns: {
        entity: t('quality.columns.entity'),
        status: t('quality.columns.status'),
        count: t('quality.columns.count'),
      },
      empty: t('quality.empty'),
    },
    procurement: {
      title: t('procurement.title'),
      window: windowLabel,
      kpi: {
        posInWindow: t('procurement.kpi.posInWindow'),
        confirmedToGrn: t('procurement.kpi.confirmedToGrn'),
        createdToGrn: t('procurement.kpi.createdToGrn'),
        openTos: t('procurement.kpi.openTos'),
      },
      confirmedToGrnNote: t('procurement.confirmedToGrnNote'),
      createdToGrnNote: t('procurement.createdToGrnNote'),
      status: {
        cancelled: t('procurement.status.cancelled'),
        draft: t('procurement.status.draft'),
        partially_received: t('procurement.status.partially_received'),
        received: t('procurement.status.received'),
        sent: t('procurement.status.sent'),
        confirmed: t('procurement.status.confirmed'),
      },
      columns: {
        status: t('procurement.columns.status'),
        count: t('procurement.columns.count'),
      },
      empty: t('procurement.empty'),
    },
    receipts: {
      title: t('receipts.title'),
      window: windowLabel,
      kpi: {
        grnCount: t('receipts.kpi.grnCount'),
        completedGrnCount: t('receipts.kpi.completedGrnCount'),
        itemLineCount: t('receipts.kpi.itemLineCount'),
        receivedQty: t('receipts.kpi.receivedQty'),
      },
      qtyNote: t('receipts.qtyNote'),
      status: {
        draft: t('receipts.status.draft'),
        completed: t('receipts.status.completed'),
        cancelled: t('receipts.status.cancelled'),
        posted: t('receipts.status.posted'),
      },
      columns: {
        grn: t('receipts.columns.grn'),
        supplier: t('receipts.columns.supplier'),
        warehouse: t('receipts.columns.warehouse'),
        status: t('receipts.columns.status'),
        lines: t('receipts.columns.lines'),
        qtyByUom: t('receipts.columns.qtyByUom'),
        receiptDate: t('receipts.columns.receiptDate'),
      },
      empty: t('receipts.empty'),
    },
    shipments: {
      title: t('shipments.title'),
      window: windowLabel,
      kpi: {
        shipmentCount: t('shipments.kpi.shipmentCount'),
        packingCount: t('shipments.kpi.packingCount'),
        shippedCount: t('shipments.kpi.shippedCount'),
        deliveredCount: t('shipments.kpi.deliveredCount'),
      },
      status: {
        pending: t('shipments.status.pending'),
        packing: t('shipments.status.packing'),
        packed: t('shipments.status.packed'),
        manifested: t('shipments.status.manifested'),
        shipped: t('shipments.status.shipped'),
        delivered: t('shipments.status.delivered'),
        exception: t('shipments.status.exception'),
      },
      columns: {
        shipment: t('shipments.columns.shipment'),
        salesOrder: t('shipments.columns.salesOrder'),
        customer: t('shipments.columns.customer'),
        status: t('shipments.columns.status'),
        boxes: t('shipments.columns.boxes'),
        shippedAt: t('shipments.columns.shippedAt'),
        createdAt: t('shipments.columns.createdAt'),
      },
      empty: t('shipments.empty'),
    },
  };
}

async function buildSelectorLabels(locale: string): Promise<PeriodSelectorLabels> {
  const t = await getTranslations({ locale, namespace: 'reporting' });
  return {
    today: t('period.today'),
    week: t('period.week'),
    month: t('period.month'),
    quarter: t('period.quarter'),
    last7d: t('period.last7d'),
    last30d: t('period.last30d'),
    custom: t('period.custom'),
    line: t('filter.line'),
    search: t('filter.search'),
    allLines: t('filter.allLines'),
    from: t('filter.from'),
    to: t('filter.to'),
    ariaLabel: t('filter.ariaLabel'),
    periodGroupLabel: t('period.groupLabel'),
  };
}

async function loadReportingContent({
  locale,
  filters,
}: {
  locale: string;
  filters: ReportingFilters;
}) {
  const t = getRptTranslator(locale);
  const { from, to } = filters.window;

  // Pool-pressure fix (2026-06-25): a single bundle action opens ONE
  // withOrgContext (1 app-pool connection) and runs all six summary cores +
  // export-access core SEQUENTIALLY on that shared connection, instead of the
  // previous 7-way Promise.all (which fanned out 7 concurrent withOrgContext
  // calls = 7 connections and exhausted the Supavisor pool under load). Same
  // line/order-vs-date-window scoping as before; line/order filters apply to
  // production/procurement/receipts, inventory + quality take only the window.
  const {
    production,
    inventory,
    quality,
    procurement,
    receipts,
    shipments,
    spendBySupplier = { ok: true, data: [] },
    exportAccess,
  } =
    await reportingBundle({ from, to, lineId: filters.lineId, orderQuery: filters.orderQuery });

  const results = [production, inventory, quality, procurement, receipts, shipments, spendBySupplier] as const;

  // ── Permission-denied state (server-resolved by the actions) ────────────────
  if (results.some((r) => !r.ok && r.reason === 'forbidden')) {
    return (
      <div
        role="note"
        data-testid="reporting-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('page.denied')}
      </div>
    );
  }

  // ── Error state (failed live read → banner, never a 500) ────────────────────
  if (
    !production.ok ||
    !inventory.ok ||
    !quality.ok ||
    !procurement.ok ||
    !receipts.ok ||
    !shipments.ok ||
    !spendBySupplier.ok
  ) {
    return (
      <div
        role="alert"
        data-testid="reporting-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('page.error')}
      </div>
    );
  }

  const canExportCsv = exportAccess.ok && exportAccess.data.canExportCsv;
  const labels = await buildLabels(locale, filters.window);

  return (
    <ReportingOverviewClient
      production={production.data}
      inventory={inventory.data}
      quality={quality.data}
      procurement={procurement.data}
      receipts={receipts.data}
      shipments={shipments.data}
      spendBySupplier={spendBySupplier.data}
      productionExportInput={{
        from: from.toISOString(),
        to: to.toISOString(),
        lineId: filters.lineId,
        orderQuery: filters.orderQuery,
      }}
      canExportCsv={canExportCsv}
      labels={labels}
    />
  );
}

export default async function ReportingRoutePage({ params, searchParams }: PageProps) {
  const [{ locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const t = getRptTranslator(locale);
  const filters = parseReportingFilters(rawSearchParams);
  const [selectorLabels, lineOptions, content] = await Promise.all([
    buildSelectorLabels(locale),
    reportingProductionLines(),
    loadReportingContent({ locale, filters }),
  ]);
  const lines = lineOptions.ok ? lineOptions.data : [];

  return (
    <main
      data-screen="reporting-overview"
      data-prototype-label="rpt_home_condensed_overview"
      data-prototype-anchor="prototypes/design/Monopilot Design System/reporting/kpi-screens.jsx:5-175"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      <PeriodSelector
        period={filters.period}
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        lineId={filters.lineId}
        orderQuery={filters.orderQuery}
        lines={lines}
        labels={selectorLabels}
      />
      <Suspense
        key={[
          filters.period,
          filters.fromDate,
          filters.toDate,
          filters.lineId ?? '',
          filters.orderQuery ?? '',
        ].join(':')}
        fallback={<ReportingSkeleton />}
      >
        {content}
      </Suspense>
    </main>
  );
}
