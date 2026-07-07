/**
 * Wave-shipping — Sales Orders list + create route (/shipping).
 *
 * Replaces the prior ModuleDataPanel count stub with the real SO list.
 *
 * Prototype parity: shipping/so-screens.jsx:1-185 (ShSOList) — page head + "＋ Create
 * SO", status tabs with counts, search + customer filter, dense table (SO# / customer
 * / status / target ship / lines / total) + per-row View. The create-SO modal mirrors
 * shipping/modals.jsx:115-271 (so_create_wizard_modal) collapsed to the reviewed
 * createSalesOrder input. See so-list-view.tsx / create-so-modal.tsx for per-region
 * anchors + documented deviations (no bulk toolbar / GHA grouping / holds-carrier
 * filters / pagination — no backing data in the reviewed actions).
 *
 * Data: the reviewed listSalesOrders / createSalesOrder actions (imported, never
 * authored) + the small listSoCustomers / searchSoItems read helpers in
 * _actions/so-form-data.ts. All run inside withOrgContext (RLS-scoped). RBAC for
 * create is enforced server-side in createSalesOrder (ship.so.create); this page
 * never trusts a client flag.
 *
 * Deep-link: ?new=1 auto-opens the create modal.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty-with-CTA (EmptyState in the
 * view), error (failed live read → banner, never a 500), permission-denied (the read
 * returns { ok:false, error:'forbidden' } → a denied panel, never a crash).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listSalesOrders, createSalesOrder } from './_actions/so-actions';
import { listSoCustomers, listSoUnits, searchSoItems } from './_actions/so-form-data';
import { buildUomDropdown, type UomDropdown } from '../planning/_actions/uom-dropdown';
import { createCustomer } from './customers/_actions/customer-actions';
import { SoListView, type SoListLabels } from './_components/so-list-view';
import { ShippingTabs } from './shipments/_components/shipping-tabs';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="so-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function uomFallbackLabels(locale: string): {
  placeholder: string;
  options: { kg: string; g: string; l: string; ml: string; pcs: string; pack: string; box: string; pallet: string };
} {
  if (locale === 'pl') {
    return {
      placeholder: 'Jednostka',
      options: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'szt', pack: 'opak.', box: 'karton', pallet: 'paleta' },
    };
  }
  return {
    placeholder: 'Unit',
    options: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
  };
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>, locale: string, uom: UomDropdown): SoListLabels {
  return {
    createSo: t('list.createSo'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: t('list.rowsCount'),
    customerFilterLabel: t('list.customerFilterLabel'),
    allCustomers: t('list.allCustomers'),
    clearFilters: t('list.clearFilters'),
    tabsAll: t('list.tabsAll'),
    status: {
      draft: t('soStatus.draft'),
      confirmed: t('soStatus.confirmed'),
      allocated: t('soStatus.allocated'),
      partially_picked: t('soStatus.partially_picked'),
      picked: t('soStatus.picked'),
      partially_packed: t('soStatus.partially_packed'),
      packed: t('soStatus.packed'),
      manifested: t('soStatus.manifested'),
      shipped: t('soStatus.shipped'),
      partially_delivered: t('soStatus.partially_delivered'),
      delivered: t('soStatus.delivered'),
      cancelled: t('soStatus.cancelled'),
    },
    columns: {
      so: t('list.columns.so'),
      customer: t('list.columns.customer'),
      status: t('list.columns.status'),
      expected: t('list.columns.expected'),
      lines: t('list.columns.lines'),
      total: t('list.columns.total'),
      actions: t('list.columns.actions'),
    },
    view: t('list.view'),
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      clear: t('list.empty.clear'),
    },
    create: {
      title: t('create.title'),
      customerLabel: t('create.customerLabel'),
      customerPlaceholder: t('create.customerPlaceholder'),
      newCustomer: t('create.newCustomer'),
      newCustomerNamePlaceholder: t('create.newCustomerNamePlaceholder'),
      createCustomerSubmit: t('create.createCustomerSubmit'),
      creatingCustomer: t('create.creatingCustomer'),
      cancelCustomerCreate: t('create.cancelCustomerCreate'),
      requestedLabel: t('create.requestedLabel'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      linesTitle: t('create.linesTitle'),
      addLine: t('create.addLine'),
      removeLine: t('create.removeLine'),
      lineItem: t('create.lineItem'),
      lineQty: t('create.lineQty'),
      lineUom: t('create.lineUom'),
      uomPlaceholder: uom.placeholder,
      uomOptions: uom.options,
      uomUnits: uom.units,
      qtyPlaceholder: t('create.qtyPlaceholder'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errors: {
        customerRequired: t('create.errors.customerRequired'),
        linesRequired: t('create.errors.linesRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        already_exists: t('errors.already_exists'),
        persistence_failed: t('errors.persistence_failed'),
      },
      picker: {
        trigger: t('create.picker.trigger'),
        searchLabel: t('create.picker.searchLabel'),
        searchPlaceholder: t('create.picker.searchPlaceholder'),
        loading: t('create.picker.loading'),
        empty: t('create.picker.empty'),
        cancel: t('create.picker.cancel'),
        error: t('create.picker.error'),
      },
    },
  };
}

async function ListContent({ locale, autoOpenCreate }: { locale: string; autoOpenCreate: boolean }) {
  const t = await getTranslations('Shipping.salesOrders');
  const [listResult, customers, orgUnits] = await Promise.all([
    listSalesOrders({}),
    listSoCustomers(),
    listSoUnits(),
  ]);
  const uom = buildUomDropdown(orgUnits, uomFallbackLabels(locale));
  const labels = buildLabels(t, locale, uom);

  if (!listResult.ok) {
    if (listResult.error === 'forbidden') {
      return (
        <div role="note" data-testid="so-list-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-800">
          {t('denied')}
        </div>
      );
    }
    return (
      <div role="alert" data-testid="so-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <SoListView
      locale={locale}
      salesOrders={listResult.data.map((so) => ({
        id: so.id,
        soNumber: so.so_number,
        customerName: so.customer_name,
        customerCode: so.customer_code,
        status: so.status,
        lineCount: so.line_count,
        total: so.total,
        expectedShipDate: so.expected_ship_date,
        createdAt: so.created_at,
      }))}
      customers={customers}
      autoOpenCreate={autoOpenCreate}
      labels={labels}
      searchSoItemsAction={searchSoItems}
      createCustomerAction={createCustomer}
      createSalesOrderAction={createSalesOrder}
    />
  );
}

export default async function ShippingRoutePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const t = await getTranslations('Shipping.salesOrders');
  const tShip = await getTranslations('Shipping.shipments');

  return (
    <main
      data-screen="shipping-so-list"
      data-testid="module-landing-shipping"
      data-prototype-label="ship_so_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.shipping') }, { label: t('breadcrumb.salesOrders') }]}
      />
      <ShippingTabs locale={locale} labels={{ salesOrders: tShip('tabs.salesOrders'), shipments: tShip('tabs.shipments'), customers: tShip('tabs.customers') }} />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} />
      </Suspense>
    </main>
  );
}
