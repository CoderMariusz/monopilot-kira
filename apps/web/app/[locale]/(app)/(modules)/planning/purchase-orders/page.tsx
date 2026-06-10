/**
 * P2-PLANNING — Purchase Orders list + create route (/planning/purchase-orders).
 *
 * Prototype parity (1:1): prototypes/planning/po-screens.jsx:1-139 (PlanPOList) —
 *   page head + "＋ Create PO", status tabs with counts, search + supplier filter,
 *   dense table (PO / supplier / expected / lines / status), per-row View. The
 *   create-PO modal mechanics mirror prototypes/planning/modals.jsx + the WO modal
 *   (supplier select + line editor). See po-list-view.tsx / create-po-modal.tsx for
 *   the per-region anchors and the documented deviations (no KPI strip / bulk
 *   toolbar / D365-drift — no backing data in the reviewed actions).
 *
 * Data: the reviewed listPurchaseOrders / createPurchaseOrder actions (imported,
 * never authored) + the small listPoSuppliers / searchPoItems read helpers in
 * _actions/po-form-data.ts. All run inside withOrgContext (RLS-scoped). RBAC for
 * create is enforced server-side in createPurchaseOrder (npd.planning.write); this
 * page never trusts a client flag.
 *
 * Deep-link: ?new=1 auto-opens the create modal.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (read is
 * RLS-scoped so a denied user simply sees an empty org-scoped list; create surfaces
 * forbidden inline), optimistic (create pending in the modal).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listPurchaseOrders, createPurchaseOrder } from './_actions/actions';
import { listPoSuppliers, listPurchaseOrderLineCounts, searchPoItems } from './_actions/po-form-data';
import { PoListView, type PoListLabels } from './_components/po-list-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="po-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): PoListLabels {
  return {
    createPo: t('actions.createPo'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: t('list.rowsCount'),
    supplierFilterLabel: t('list.supplierFilterLabel'),
    allSuppliers: t('list.allSuppliers'),
    clearFilters: t('list.clearFilters'),
    tabsAll: t('list.tabs.all'),
    status: {
      draft: t('poStatus.draft'),
      sent: t('poStatus.sent'),
      confirmed: t('poStatus.confirmed'),
      partially_received: t('poStatus.partially_received'),
      received: t('poStatus.received'),
      cancelled: t('poStatus.cancelled'),
    },
    columns: {
      po: t('list.columns.po'),
      supplier: t('list.columns.supplier'),
      expected: t('list.columns.expected'),
      lines: t('list.columns.lines'),
      status: t('list.columns.status'),
      currency: t('list.columns.currency'),
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
      poNumberLabel: t('create.poNumberLabel'),
      poNumberPlaceholder: t('create.poNumberPlaceholder'),
      supplierLabel: t('create.supplierLabel'),
      supplierPlaceholder: t('create.supplierPlaceholder'),
      expectedLabel: t('create.expectedLabel'),
      currencyLabel: t('create.currencyLabel'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      linesTitle: t('create.linesTitle'),
      addLine: t('create.addLine'),
      removeLine: t('create.removeLine'),
      lineItem: t('create.lineItem'),
      lineQty: t('create.lineQty'),
      lineUom: t('create.lineUom'),
      lineUnitPrice: t('create.lineUnitPrice'),
      uomPlaceholder: t('create.uomPlaceholder'),
      qtyPlaceholder: t('create.qtyPlaceholder'),
      unitPricePlaceholder: t('create.unitPricePlaceholder'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errors: {
        poNumberRequired: t('create.errors.poNumberRequired'),
        supplierRequired: t('create.errors.supplierRequired'),
        linesRequired: t('create.errors.linesRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        already_exists: t('errors.already_exists'),
        invalid_state: t('errors.invalid_state'),
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
  const t = await getTranslations('Planning.purchaseOrders');
  const [listResult, suppliers, lineCounts] = await Promise.all([
    listPurchaseOrders({ limit: 200 }),
    listPoSuppliers(),
    listPurchaseOrderLineCounts(),
  ]);

  if (!listResult.ok) {
    return (
      <div role="alert" data-testid="po-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <PoListView
      locale={locale}
      purchaseOrders={listResult.data.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplierCode: po.supplierCode,
        supplierName: po.supplierName,
        status: po.status,
        expectedDelivery: po.expectedDelivery,
        currency: po.currency,
        notes: po.notes,
        lineCount: lineCounts[po.id] ?? 0,
      }))}
      suppliers={suppliers}
      autoOpenCreate={autoOpenCreate}
      labels={buildLabels(t)}
      searchPoItemsAction={searchPoItems}
      createPurchaseOrderAction={createPurchaseOrder}
    />
  );
}

export default async function PurchaseOrdersListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const t = await getTranslations('Planning.purchaseOrders');

  return (
    <main
      data-screen="planning-po-list"
      data-prototype-label="plan_po_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.planning') }, { label: t('breadcrumb.purchaseOrders') }]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} />
      </Suspense>
    </main>
  );
}
