/**
 * Wave-shipping — Customers master list route (/shipping/customers).
 *
 * Closes an L2: public.customers existed (mig 211/288) and the SO create flow READ
 * it (listSoCustomers), but nothing could WRITE one — so a clean org could never
 * raise a sales order. This screen adds the missing admin surface.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/shipping/
 *   customer-screens.jsx:3-129 (ShCustomerList) — page head + "＋ Create customer",
 *   KPI strip, status tabs + counts, search, dense table. The create modal mirrors
 *   modals.jsx:36-66 (M-01 customer create). See customer-list-view.tsx /
 *   create-customer-modal.tsx for the per-region anchors + documented deviations
 *   (no-source bulk-CSV / payment-terms / allergen-profile / open-orders columns).
 *
 * Placement: a "Customers" TAB on the shipping landing (the parity-policy-allowed
 * alternative to a sidebar sub-entry, exactly like the existing Shipments tab),
 * because customers are a Shipping-owned master read by the SO create flow.
 *
 * Data: the reviewed listCustomers / createCustomer actions (this lane authors them
 * — no T2 owner exists) over public.customers, run inside withOrgContext
 * (RLS-scoped). RBAC for create is enforced server-side inside createCustomer
 * (ship.so.create — the SO-create prerequisite gate); this page never trusts a
 * client flag. The list read is RLS-scoped so a denied user simply sees an empty
 * org-scoped list.
 *
 * Deep-link: ?new=1 auto-opens the create modal.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (RLS-scoped
 * read → empty list; create surfaces forbidden inline), optimistic (create pending
 * in the modal).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listCustomers, createCustomer } from './_actions/customer-actions';
import { CustomerListView } from './_components/customer-list-view';
import { buildCustomerListLabels } from './_components/customer-labels';
import type { Customer, CreateCustomerInput } from './_components/customer-types';
import { ShippingTabs } from '../shipments/_components/shipping-tabs';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="customer-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

// Cast seam: the 'use server' createCustomer exports as (rawInput: unknown) but the
// view types it structurally — same runtime contract, just a narrower signature.
type CreateCustomerSeam = (input: CreateCustomerInput) => ReturnType<typeof createCustomer>;

async function ListContent({ locale, autoOpenCreate }: { locale: string; autoOpenCreate: boolean }) {
  const t = await getTranslations('Shipping.customers');
  const result = await listCustomers({ limit: 200 });

  if (!result.ok) {
    return (
      <div role="alert" data-testid="customer-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <CustomerListView
      locale={locale}
      customers={result.data as Customer[]}
      autoOpenCreate={autoOpenCreate}
      labels={buildCustomerListLabels((key) => t(key))}
      createCustomerAction={createCustomer as CreateCustomerSeam}
    />
  );
}

export default async function ShippingCustomersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const t = await getTranslations('Shipping.customers');
  const tShip = await getTranslations('Shipping.shipments');

  return (
    <main
      data-screen="shipping-customer-list"
      data-prototype-label="customer_list_page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.shipping'), href: `/${locale}/shipping` }, { label: t('breadcrumb.customers') }]}
      />
      <ShippingTabs
        locale={locale}
        labels={{ salesOrders: tShip('tabs.salesOrders'), shipments: tShip('tabs.shipments'), customers: tShip('tabs.customers'), rma: tShip('tabs.rma') }}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} />
      </Suspense>
    </main>
  );
}
