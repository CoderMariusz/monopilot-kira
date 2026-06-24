/**
 * Wave-shipping — Shipments list route (/shipping/shipments).
 *
 * Prototype parity: spec-driven (no JSX list-of-shipments screen); reuses the SO list
 * dense-table pattern (shipping/so-screens.jsx:92-168) that S2 translated. See
 * shipments-list-view.tsx for the per-region treatment + documented deviations (no
 * per-shipment weight feed in listShipments → "—" placeholder).
 *
 * Data: the reviewed listShipments action (imported, never authored), run inside
 * withOrgContext (RLS-scoped). RBAC (ship.dashboard.view) is enforced server-side
 * inside the action; a denied user gets { ok:false, error:'forbidden' } → a denied
 * panel (never a crash). The status filter is a client-side narrowing of the
 * org-scoped dataset.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (denied panel).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listShipments } from '../_actions/pack-actions';
import { ShipmentsListView, type ShipmentsListLabels } from './_components/shipments-list-view';
import { ShippingTabs } from './_components/shipping-tabs';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="shipments-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-56 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): ShipmentsListLabels {
  return {
    statusFilterLabel: t('list.statusFilterLabel'),
    allStatuses: t('list.allStatuses'),
    rowsCount: t('list.rowsCount'),
    status: {
      pending: t('status.pending'),
      packing: t('status.packing'),
      packed: t('status.packed'),
      manifested: t('status.manifested'),
      shipped: t('status.shipped'),
      delivered: t('status.delivered'),
      exception: t('status.exception'),
    },
    columns: {
      shipment: t('list.columns.shipment'),
      salesOrder: t('list.columns.salesOrder'),
      customer: t('list.columns.customer'),
      status: t('list.columns.status'),
      boxes: t('list.columns.boxes'),
      weight: t('list.columns.weight'),
      actions: t('list.columns.actions'),
    },
    view: t('list.view'),
    empty: { title: t('list.empty.title'), body: t('list.empty.body') },
    weightUnit: t('list.weightUnit'),
    noWeight: t('list.noWeight'),
  };
}

async function ListContent({ locale }: { locale: string }) {
  const t = await getTranslations('Shipping.shipments');
  const result = await listShipments({});

  if (!result.ok) {
    if (result.error === 'forbidden') {
      return (
        <div role="note" data-testid="shipments-list-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-800">
          {t('denied')}
        </div>
      );
    }
    return (
      <div role="alert" data-testid="shipments-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <ShipmentsListView
      locale={locale}
      shipments={result.data.map((sh) => ({ ...sh, weight: null }))}
      labels={buildLabels(t)}
    />
  );
}

export default async function ShipmentsListPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('Shipping.shipments');

  return (
    <main
      data-screen="shipping-shipments-list"
      data-prototype-label="ship_shipments_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.shipping'), href: `/${locale}/shipping` }, { label: t('breadcrumb.shipments') }]}
      />
      <ShippingTabs locale={locale} labels={{ salesOrders: t('tabs.salesOrders'), shipments: t('tabs.shipments'), customers: t('tabs.customers') }} />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
