/**
 * WAVE E9 — Supplier scorecard route (/planning/suppliers/[id]/scorecard).
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * planning(-ext)/ has no supplier-scorecard screen. Presentation follows the
 * locked MON-design-system Card/Badge KPI-tile + table conventions reused from
 * the planning dashboard, so prototype_match = false (spec-driven).
 *
 * Data: getSupplierScorecard (imported, never authored — owned by the E9 freight
 * backend lane) runs inside withOrgContext (RLS-scoped). The read is org-scoped,
 * so an out-of-org id returns not_found rather than another org's supplier.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found / invalid id (honest panel + back link), permission-denied (org-scoped
 * read → not_found for out-of-org ids), empty (no POs → honest empty table).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getSupplier } from '../../_actions/actions';
import { getSupplierScorecard } from '../../../_actions/freight-actions';
import { ScorecardView, type ScorecardLabels } from './_components/scorecard-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function ScorecardSkeleton() {
  return (
    <div data-testid="scorecard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): ScorecardLabels {
  return {
    kpis: {
      onTime: t('scorecard.kpis.onTime'),
      onTimeHint: t('scorecard.kpis.onTimeHint'),
      qtyVariance: t('scorecard.kpis.qtyVariance'),
      qtyVarianceHint: t('scorecard.kpis.qtyVarianceHint'),
      ncr: t('scorecard.kpis.ncr'),
      ncrHint: t('scorecard.kpis.ncrHint'),
      openNcr: t('scorecard.kpis.openNcr'),
      openNcrHint: t('scorecard.kpis.openNcrHint'),
    },
    recent: {
      title: t('scorecard.recent.title'),
      empty: t('scorecard.recent.empty'),
      columns: {
        po: t('scorecard.recent.columns.po'),
        status: t('scorecard.recent.columns.status'),
        expected: t('scorecard.recent.columns.expected'),
        received: t('scorecard.recent.columns.received'),
        onTime: t('scorecard.recent.columns.onTime'),
        variance: t('scorecard.recent.columns.variance'),
      },
      onTimeYes: t('scorecard.recent.onTimeYes'),
      onTimeNo: t('scorecard.recent.onTimeNo'),
      pending: t('scorecard.recent.pending'),
      none: t('scorecard.recent.none'),
    },
  };
}

async function ScorecardContent({ locale, id }: { locale: string; id: string }) {
  const t = await getTranslations('Planning');
  const [supplierResult, scorecardResult] = await Promise.all([getSupplier(id), getSupplierScorecard(id)]);

  // not-found / invalid id (org-scoped → out-of-org returns not_found, not a leak).
  if (!scorecardResult.ok) {
    if (scorecardResult.error === 'not_found' || scorecardResult.error === 'invalid_input') {
      return (
        <div
          role="note"
          data-testid="scorecard-not-found"
          className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
        >
          <p className="mb-3">{t('scorecard.notFound')}</p>
          <Link href={`/${locale}/planning/suppliers`} prefetch={false} className="text-blue-700 hover:underline">
            {t('scorecard.backToSuppliers')}
          </Link>
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="scorecard-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('scorecard.error')}
      </div>
    );
  }

  const supplierName = supplierResult.ok ? `${supplierResult.data.code} — ${supplierResult.data.name}` : id;
  const dateFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const formatDate = (iso: string) => dateFmt.format(new Date(iso));

  return (
    <>
      <div className="flex items-center justify-between" data-testid="scorecard-supplier-head">
        <div className="text-sm text-slate-600">
          {t('scorecard.forSupplier')} <span className="font-mono font-semibold text-slate-900">{supplierName}</span>
        </div>
        <Link
          href={`/${locale}/planning/suppliers/${id}`}
          prefetch={false}
          className="text-sm text-blue-700 hover:underline"
          data-testid="scorecard-back-to-supplier"
        >
          {t('scorecard.backToSupplier')}
        </Link>
      </div>
      <ScorecardView scorecard={scorecardResult.data} labels={buildLabels(t)} formatDate={formatDate} />
    </>
  );
}

export default async function SupplierScorecardPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('Planning');

  return (
    <main
      data-screen="planning-supplier-scorecard"
      data-testid="planning-supplier-scorecard-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('scorecard.title')}
        subtitle={t('scorecard.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('carriers.suppliersBreadcrumb'), href: `/${locale}/planning/suppliers` },
          { label: t('scorecard.breadcrumb') },
        ]}
      />
      <Suspense fallback={<ScorecardSkeleton />}>
        <ScorecardContent locale={locale} id={id} />
      </Suspense>
    </main>
  );
}
