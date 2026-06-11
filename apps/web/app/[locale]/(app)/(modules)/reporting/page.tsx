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

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getReportingExportAccess,
  inventorySnapshot,
  procurementSummary,
  productionSummary,
  qualitySummary,
} from './_actions/report-read-actions';
import {
  ReportingOverviewClient,
  type ReportingLabels,
} from './_components/reporting-overview.client';
import { getRptTranslator } from './rpt-labels';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

const PRODUCTION_DAYS = 7;
const QUALITY_DAYS = 30;
const PROCUREMENT_DAYS = 30;

type PageProps = {
  params: Promise<{ locale: string }>;
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

function buildLabels(locale: string): ReportingLabels {
  const t = getRptTranslator(locale);
  return {
    page: {
      exportCsv: t('page.exportCsv'),
      exportCsvDenied: t('page.exportCsvDenied'),
      windowDays: t('page.windowDays', { days: PRODUCTION_DAYS }),
      asOfNow: t('page.asOfNow'),
      notAvailable: t('page.notAvailable'),
    },
    production: {
      title: t('production.title'),
      window: t('page.windowDays', { days: PRODUCTION_DAYS }),
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
        expired: t('inventory.columns.expired'),
        expiring7d: t('inventory.columns.expiring7d'),
      },
      empty: t('inventory.empty'),
    },
    quality: {
      title: t('quality.title'),
      window: t('page.windowDays', { days: QUALITY_DAYS }),
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
      columns: {
        entity: t('quality.columns.entity'),
        status: t('quality.columns.status'),
        count: t('quality.columns.count'),
      },
      empty: t('quality.empty'),
    },
    procurement: {
      title: t('procurement.title'),
      window: t('page.windowDays', { days: PROCUREMENT_DAYS }),
      kpi: {
        posInWindow: t('procurement.kpi.posInWindow'),
        confirmedToGrn: t('procurement.kpi.confirmedToGrn'),
        createdToGrn: t('procurement.kpi.createdToGrn'),
        openTos: t('procurement.kpi.openTos'),
      },
      confirmedToGrnNote: t('procurement.confirmedToGrnNote'),
      createdToGrnNote: t('procurement.createdToGrnNote'),
      columns: {
        status: t('procurement.columns.status'),
        count: t('procurement.columns.count'),
      },
      empty: t('procurement.empty'),
    },
  };
}

async function ReportingContent({ locale }: { locale: string }) {
  const t = getRptTranslator(locale);

  const [production, inventory, quality, procurement, exportAccess] = await Promise.all([
    productionSummary({ days: PRODUCTION_DAYS }),
    inventorySnapshot(),
    qualitySummary({ days: QUALITY_DAYS }),
    procurementSummary({ days: PROCUREMENT_DAYS }),
    getReportingExportAccess(),
  ]);

  const results = [production, inventory, quality, procurement] as const;

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
  if (!production.ok || !inventory.ok || !quality.ok || !procurement.ok) {
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

  return (
    <ReportingOverviewClient
      production={production.data}
      inventory={inventory.data}
      quality={quality.data}
      procurement={procurement.data}
      canExportCsv={canExportCsv}
      labels={buildLabels(locale)}
    />
  );
}

export default async function ReportingRoutePage({ params }: PageProps) {
  const { locale } = await params;
  const t = getRptTranslator(locale);

  return (
    <main
      data-screen="reporting-overview"
      data-prototype-label="rpt_home_condensed_overview"
      data-prototype-anchor="prototypes/design/Monopilot Design System/reporting/kpi-screens.jsx:5-175"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      <Suspense fallback={<ReportingSkeleton />}>
        <ReportingContent locale={locale} />
      </Suspense>
    </main>
  );
}
