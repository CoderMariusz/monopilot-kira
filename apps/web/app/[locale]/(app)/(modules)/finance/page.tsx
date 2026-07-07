import { Suspense } from 'react';
import Link from 'next/link';

import { getTranslations } from 'next-intl/server';

import { listCompletedWoCosts, summarizeCompletedWoWasteCost } from './_actions/wo-cost-actions';
import { FinanceWoCostTable, type FinanceWoCostLabels } from './_components/wo-cost-table.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ days?: string; page?: string }>;
};

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function FinanceSkeleton({ labels }: { labels: FinanceWoCostLabels }) {
  return <FinanceWoCostTable result={{ state: 'loading' }} labels={labels} />;
}

function parseWindowDays(value: string | undefined): 30 | 90 | 365 {
  const days = Number(value);
  return days === 90 || days === 365 ? days : 30;
}

async function buildLabels(): Promise<FinanceWoCostLabels> {
  const t = await getTranslations('Finance.woCosts');
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    refresh: t('refresh'),
    refreshing: t('refreshing'),
    permissionDenied: t('permissionDenied'),
    empty: t('empty'),
    error: t('error'),
    loading: t('loading'),
    notAvailable: t('notAvailable'),
    columns: {
      wo: t('columns.wo'),
      product: t('columns.product'),
      outputKg: t('columns.outputKg'),
      materials: t('columns.materials'),
      labor: t('columns.labor'),
      total: t('columns.total'),
      costPerKg: t('columns.costPerKg'),
    },
    breakdown: {
      title: t('breakdown.title'),
      item: t('breakdown.item'),
      qtyKg: t('breakdown.qtyKg'),
      costPerKg: t('breakdown.costPerKg'),
      cost: t('breakdown.cost'),
      noLabor: t('breakdown.noLabor'),
      setup: t('breakdown.setup'),
      machine: t('breakdown.machine'),
      waste: t('breakdown.waste'),
    },
    pagination: {
      showing: t('pagination.showing'),
      previous: t('pagination.previous'),
      next: t('pagination.next'),
    },
  };
}

async function FinanceContent({
  labels,
  windowDays,
  page,
}: {
  labels: FinanceWoCostLabels;
  windowDays: 30 | 90 | 365;
  page: number;
}) {
  const [result, wasteSummary] = await Promise.all([
    listCompletedWoCosts({ days: windowDays, page }),
    summarizeCompletedWoWasteCost({ days: windowDays }),
  ]);
  const wasteCost =
    wasteSummary.ok
      ? wasteSummary.data.wasteCost
      : 'reason' in wasteSummary && wasteSummary.reason === 'forbidden'
        ? 'Permission denied'
        : 'Not available';

  if (result.ok) {
    return (
      <section className="space-y-4">
        <div className="rounded border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Scrap / waste cost</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-950" data-testid="finance-waste-cost-summary">
            {wasteCost}
          </p>
          <p className="mt-1 text-sm text-slate-500">Completed WOs in selected period</p>
        </div>
        <FinanceWoCostTable result={{ state: 'ready', summary: result.data }} labels={labels} />
      </section>
    );
  }
  if ('reason' in result && result.reason === 'forbidden') {
    return <FinanceWoCostTable result={{ state: 'permission-denied' }} labels={labels} />;
  }
  return <FinanceWoCostTable result={{ state: 'error' }} labels={labels} />;
}

export default async function FinanceRoutePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp: { days?: string; page?: string } = searchParams ? await searchParams : {};
  const windowDays = parseWindowDays(sp.days);
  const page = parsePage(sp.page);
  const [labels, tValuation] = await Promise.all([buildLabels(), getTranslations('Finance.valuation')]);
  const valuationLinkLabel = tValuation('navLink');

  return (
    <main data-testid="module-landing-finance" className="p-6 lg:p-8" aria-labelledby="finance-title">
      <div className="mb-6">
        <h1 id="finance-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {labels.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{labels.subtitle}</p>
        <Link
          href={`/${locale}/finance/valuation`}
          prefetch={false}
          className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          {valuationLinkLabel}
        </Link>
      </div>
      <Suspense key={`${windowDays}-${page}`} fallback={<FinanceSkeleton labels={labels} />}>
        <FinanceContent labels={labels} windowDays={windowDays} page={page} />
      </Suspense>
    </main>
  );
}
