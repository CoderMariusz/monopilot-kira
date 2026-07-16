import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { approveRma, closeRma, getRma, processRma, receiveRma } from '../../_actions/rma-actions';
import { ShippingTabs } from '../../shipments/_components/shipping-tabs';
import { RmaDetailView, type RmaDetailLabels } from '../_components/rma-detail-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; rmaId: string }>;
};

function DetailSkeleton() {
  return <div data-testid="rma-detail-loading" aria-busy="true" className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />;
}

function buildDetailLabels(t: Awaited<ReturnType<typeof getTranslations>>): RmaDetailLabels {
  return {
    backToList: t('detail.backToList'),
    summaryTitle: t('detail.summaryTitle'),
    linesTitle: t('detail.linesTitle'),
    fields: {
      rma: t('detail.fields.rma'),
      customer: t('detail.fields.customer'),
      salesOrder: t('detail.fields.salesOrder'),
      reason: t('detail.fields.reason'),
      status: t('detail.fields.status'),
      disposition: t('detail.fields.disposition'),
      totalValue: t('detail.fields.totalValue'),
      notes: t('detail.fields.notes'),
      created: t('detail.fields.created'),
    },
    status: {
      pending: t('status.pending'),
      approved: t('status.approved'),
      receiving: t('status.receiving'),
      received: t('status.received'),
      processed: t('status.processed'),
      closed: t('status.closed'),
    },
    disposition: {
      none: t('disposition.none'),
      restock: t('disposition.restock'),
      scrap: t('disposition.scrap'),
      quality_hold: t('disposition.quality_hold'),
    },
    lineColumns: {
      product: t('detail.lineColumns.product'),
      expected: t('detail.lineColumns.expected'),
      received: t('detail.lineColumns.received'),
      lot: t('detail.lineColumns.lot'),
      notes: t('detail.lineColumns.notes'),
    },
    actions: {
      approve: t('detail.actions.approve'),
      receive: t('detail.actions.receive'),
      processRestock: t('detail.actions.processRestock'),
      processScrap: t('detail.actions.processScrap'),
      processQualityHold: t('detail.actions.processQualityHold'),
      close: t('detail.actions.close'),
      pending: t('detail.actions.pending'),
    },
    errors: {
      invalid_state: t('errors.invalid_state'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}

async function DetailContent({ locale, rmaId }: { locale: string; rmaId: string }) {
  const t = await getTranslations('Shipping.rma');
  const result = await getRma(rmaId);

  if (!result.ok) {
    if (result.error === 'not_found') {
      return (
        <div data-testid="rma-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600">
          <p>{t('detail.notFound')}</p>
          <Link href={`/${locale}/shipping/rma`} className="mt-3 inline-block text-blue-700 hover:underline">
            {t('detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="rma-detail-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <RmaDetailView
      locale={locale}
      rma={result.data}
      labels={buildDetailLabels(t)}
      approveRmaAction={approveRma}
      receiveRmaAction={receiveRma}
      processRmaAction={processRma}
      closeRmaAction={closeRma}
    />
  );
}

export default async function RmaDetailPage({ params }: PageProps) {
  const { locale, rmaId } = await params;
  const t = await getTranslations('Shipping.rma');
  const tShip = await getTranslations('Shipping.shipments');

  return (
    <main data-screen="shipping-rma-detail" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('detail.title')}
        subtitle={t('detail.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.shipping'), href: `/${locale}/shipping` },
          { label: t('breadcrumb.rma'), href: `/${locale}/shipping/rma` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <ShippingTabs
        locale={locale}
        labels={{
          salesOrders: tShip('tabs.salesOrders'),
          shipments: tShip('tabs.shipments'),
          customers: tShip('tabs.customers'),
          rma: tShip('tabs.rma'),
        }}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} rmaId={rmaId} />
      </Suspense>
    </main>
  );
}
