import { Suspense } from 'react';

import { getTranslations } from 'next-intl/server';

import { listCompletedWoCosts } from './_actions/wo-cost-actions';
import { FinanceWoCostTable, type FinanceWoCostLabels } from './_components/wo-cost-table.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ days?: string }>;
};

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
  };
}

async function FinanceContent({ labels, windowDays }: { labels: FinanceWoCostLabels; windowDays: 30 | 90 | 365 }) {
  const result = await listCompletedWoCosts({ days: windowDays });
  if (result.ok) {
    return <FinanceWoCostTable result={{ state: 'ready', summary: result.data }} labels={labels} />;
  }
  if ('reason' in result && result.reason === 'forbidden') {
    return <FinanceWoCostTable result={{ state: 'permission-denied' }} labels={labels} />;
  }
  return <FinanceWoCostTable result={{ state: 'error' }} labels={labels} />;
}

export default async function FinanceRoutePage({ searchParams }: PageProps) {
  const sp: { days?: string } = searchParams ? await searchParams : {};
  const windowDays = parseWindowDays(sp.days);
  const labels = await buildLabels();

  return (
    <main data-testid="module-landing-finance" className="p-6 lg:p-8" aria-labelledby="finance-title">
      <div className="mb-6">
        <h1 id="finance-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {labels.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{labels.subtitle}</p>
      </div>
      <Suspense key={windowDays} fallback={<FinanceSkeleton labels={labels} />}>
        <FinanceContent labels={labels} windowDays={windowDays} />
      </Suspense>
    </main>
  );
}
