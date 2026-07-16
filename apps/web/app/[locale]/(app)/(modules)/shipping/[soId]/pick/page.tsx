import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getPickListForSalesOrder, pickLine, reassignPickLine } from '../../_actions/pick-actions';
import { PickView, type PickViewLabels } from '../../_components/pick-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; soId: string }>;
};

function PickSkeleton() {
  return (
    <div data-testid="pick-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): PickViewLabels {
  return {
    title: t('title'),
    pickList: t('summary.pickList'),
    salesOrder: t('summary.salesOrder'),
    status: t('summary.status'),
    lines: {
      title: t('lines.title'),
      seq: t('lines.seq'),
      item: t('lines.item'),
      licensePlate: t('lines.licensePlate'),
      qtyToPick: t('lines.qtyToPick'),
      qtyPicked: t('lines.qtyPicked'),
      status: t('lines.status'),
      pick: t('lines.pick'),
      pending: t('lines.pending'),
      empty: t('lines.empty'),
      qtyLabel: t('lines.qtyLabel'),
      reasonLabel: t('lines.reasonLabel'),
      reasonPlaceholder: t('lines.reasonPlaceholder'),
      reassignLabel: t('lines.reassignLabel'),
      reassignPlaceholder: t('lines.reassignPlaceholder'),
      reassign: t('lines.reassign'),
      reassignPending: t('lines.reassignPending'),
    },
    lineStatus: {
      pending: t('lineStatus.pending'),
      picked: t('lineStatus.picked'),
      short: t('lineStatus.short'),
    },
    errors: {
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      invalid_state: t('errors.invalid_state'),
      allocation_not_found: t('errors.allocation_not_found'),
      lp_blocked_for_pick: t('errors.lp_blocked_for_pick'),
      short_pick_reason_required: t('errors.short_pick_reason_required'),
      reassign_required: t('errors.reassign_required'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}

async function pickLineAction(
  lineId: string,
  input: { quantityPicked: string; shortPickReason?: string },
) {
  'use server';
  return pickLine(lineId, input);
}

async function reassignPickLineAction(lineId: string, licensePlateId: string) {
  'use server';
  return reassignPickLine(lineId, { licensePlateId });
}

async function PickContent({ locale, soId }: { locale: string; soId: string }) {
  const t = await getTranslations('Shipping.pick');
  const pickResult = await getPickListForSalesOrder(soId);

  if (!pickResult.ok) {
    return (
      <div role="note" data-testid="pick-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-800">
        {t('denied')}
      </div>
    );
  }

  const pickList = pickResult.data;
  if (!pickList) {
    return (
      <div role="note" data-testid="pick-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        <p className="mb-3">{t('notFound')}</p>
        <Link href={`/${locale}/shipping/${soId}`} prefetch={false} className="text-blue-700 hover:underline">
          {t('backToSo')}
        </Link>
      </div>
    );
  }

  return (
    <PickView
      pickList={pickList}
      labels={buildLabels(t)}
      canPick={pickResult.ok ? pickResult.canPick : false}
      pickLineAction={pickLineAction}
      reassignPickLineAction={reassignPickLineAction}
    />
  );
}

export default async function SalesOrderPickPage({ params }: PageProps) {
  const { locale, soId } = await params;
  const t = await getTranslations('Shipping.pick');

  return (
    <main
      data-screen="shipping-so-pick"
      data-prototype-label="ship_so_pick"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('pageTitle')}
        breadcrumb={[
          { label: t('breadcrumb.shipping'), href: `/${locale}/shipping` },
          { label: t('breadcrumb.salesOrders'), href: `/${locale}/shipping` },
          { label: t('breadcrumb.current'), href: `/${locale}/shipping/${soId}` },
          { label: t('breadcrumb.pick') },
        ]}
      />
      <Suspense fallback={<PickSkeleton />}>
        <PickContent locale={locale} soId={soId} />
      </Suspense>
    </main>
  );
}
