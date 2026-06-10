/**
 * P2-PLANNING — Work Order detail route (/planning/work-orders/[id]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/planning/
 *   wo-detail.jsx:4-588 (plan_wo_detail) — 7-tab WO detail. See wo-detail-view.tsx
 *   for per-tab anchors + the honest "not live yet" treatment of the Reservations /
 *   Sequencing / D365 tabs (no data source in getPlanningWorkOrder).
 *
 * Data: the reviewed getPlanningWorkOrder action (imported, never authored), run
 * inside withOrgContext (RLS-scoped). The read is org-scoped, so a user from
 * another org gets not_found rather than another org's WO.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found / invalid id (404-style honest panel), permission-denied (org-scoped
 * read returns not_found for out-of-org ids). No client-trusted permissions.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getPlanningWorkOrder } from '../_actions/getPlanningWorkOrder';
import { WoDetailView, type WoDetailLabels } from '../_components/wo-detail-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="wo-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): WoDetailLabels {
  return {
    status: {
      draft: t('woStatus.draft'),
      released: t('woStatus.released'),
      in_progress: t('woStatus.in_progress'),
      on_hold: t('woStatus.on_hold'),
      completed: t('woStatus.completed'),
      closed: t('woStatus.closed'),
      cancelled: t('woStatus.cancelled'),
    },
    summary: {
      product: t('detail.summary.product'),
      qty: t('detail.summary.qty'),
      scheduledStart: t('detail.summary.scheduledStart'),
      scheduledEnd: t('detail.summary.scheduledEnd'),
      line: t('detail.summary.line'),
      priority: t('detail.summary.priority'),
      source: t('detail.summary.source'),
    },
    tabs: {
      overview: t('detail.tabs.overview'),
      outputs: t('detail.tabs.outputs'),
      dependencies: t('detail.tabs.dependencies'),
      reservations: t('detail.tabs.reservations'),
      sequencing: t('detail.tabs.sequencing'),
      history: t('detail.tabs.history'),
      d365: t('detail.tabs.d365'),
    },
    materials: {
      title: t('detail.materials.title'),
      seq: t('detail.materials.seq'),
      name: t('detail.materials.name'),
      required: t('detail.materials.required'),
      source: t('detail.materials.source'),
      empty: t('detail.materials.empty'),
    },
    operations: {
      title: t('detail.operations.title'),
      seq: t('detail.operations.seq'),
      op: t('detail.operations.op'),
      expDur: t('detail.operations.expDur'),
      expYield: t('detail.operations.expYield'),
      status: t('detail.operations.status'),
      empty: t('detail.operations.empty'),
    },
    outputs: {
      title: t('detail.outputs.title'),
      role: t('detail.outputs.role'),
      product: t('detail.outputs.product'),
      planned: t('detail.outputs.planned'),
      allocation: t('detail.outputs.allocation'),
      disposition: t('detail.outputs.disposition'),
      empty: t('detail.outputs.empty'),
    },
    dependencies: {
      title: t('detail.dependencies.title'),
      direction: t('detail.dependencies.direction'),
      wo: t('detail.dependencies.wo'),
      requiredQty: t('detail.dependencies.requiredQty'),
      materialLink: t('detail.dependencies.materialLink'),
      empty: t('detail.dependencies.empty'),
    },
    history: {
      title: t('detail.history.title'),
      from: t('detail.history.from'),
      to: t('detail.history.to'),
      timestamp: t('detail.history.timestamp'),
      user: t('detail.history.user'),
      action: t('detail.history.action'),
      empty: t('detail.history.empty'),
    },
    notLive: {
      reservations: t('detail.notLive.reservations'),
      sequencing: t('detail.notLive.sequencing'),
      d365: t('detail.notLive.d365'),
    },
    minutes: t('detail.minutes'),
  };
}

async function DetailContent({ locale, id }: { locale: string; id: string }) {
  const t = await getTranslations('Planning.workOrders');
  const result = await getPlanningWorkOrder({ id });

  if (!result.ok) {
    if (result.error === 'not_found' || result.error === 'invalid_input') {
      return (
        <div role="note" data-testid="wo-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p className="mb-3">{t('detail.notFound')}</p>
          <Link href={`/${locale}/planning/work-orders`} prefetch={false} className="text-blue-700 hover:underline">
            {t('detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="wo-detail-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return <WoDetailView workOrder={result.workOrder} labels={buildLabels(t)} locale={locale} />;
}

export default async function WorkOrderDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('Planning.workOrders');

  return (
    <main
      data-screen="planning-wo-detail"
      data-prototype-label="plan_wo_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('breadcrumb.workOrders'), href: `/${locale}/planning/work-orders` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} id={id} />
      </Suspense>
    </main>
  );
}
