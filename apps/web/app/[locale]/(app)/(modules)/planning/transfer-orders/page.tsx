/**
 * P2-PLANNING — Transfer Orders list + create route (/planning/transfer-orders).
 *
 * Prototype parity (1:1): prototypes/planning/to-screens.jsx:3-99 (PlanTOList) —
 *   status tabs, search, dense table (TO / from / to / scheduled / status / lines),
 *   "＋ Create TO" modal. See to-list-view.tsx for per-region anchors and the
 *   documented deviations (KPI strip + no-source filter selects dropped).
 *
 * Data: the reviewed listTransferOrders / createTransferOrder actions (imported,
 * never authored) + the small listTransferWarehouses / listTransferOrderLineCounts
 * / searchTransferItems read helpers in _actions/to-form-data.ts. All run inside
 * withOrgContext (RLS-scoped). RBAC for create is enforced server-side in
 * createTransferOrder (hasPlanningWritePermission → npd.planning.write); this page
 * never trusts a client flag.
 *
 * Deep-link: ?new=1 auto-opens the create modal.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (list read is
 * RLS-scoped so a denied user sees an empty org-scoped list; create surfaces
 * forbidden inline), optimistic (create pending in the modal).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listTransferOrders, createTransferOrder } from './_actions/actions';
import {
  listTransferWarehouses,
  listTransferOrderLineCounts,
  searchTransferItems,
} from './_actions/to-form-data';
import { ToListView, type ToListLabels } from './_components/to-list-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="to-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): ToListLabels {
  return {
    createTo: t('actions.createTo'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: t('list.rowsCount'),
    tabs: {
      all: t('list.tabs.all'),
      draft: t('toStatus.draft'),
      in_transit: t('toStatus.in_transit'),
      received: t('toStatus.received'),
      cancelled: t('toStatus.cancelled'),
    },
    status: {
      draft: t('toStatus.draft'),
      in_transit: t('toStatus.in_transit'),
      received: t('toStatus.received'),
      cancelled: t('toStatus.cancelled'),
    },
    columns: {
      to: t('list.columns.to'),
      from: t('list.columns.from'),
      to_wh: t('list.columns.to_wh'),
      scheduled: t('list.columns.scheduled'),
      status: t('list.columns.status'),
      lines: t('list.columns.lines'),
      actions: t('list.columns.actions'),
    },
    linesCount: t('list.linesCount'),
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      clear: t('list.empty.clear'),
    },
    create: {
      title: t('create.title'),
      toNumberLabel: t('create.toNumberLabel'),
      toNumberPlaceholder: t('create.toNumberPlaceholder'),
      fromWarehouseLabel: t('create.fromWarehouseLabel'),
      toWarehouseLabel: t('create.toWarehouseLabel'),
      warehousePlaceholder: t('create.warehousePlaceholder'),
      scheduledDateLabel: t('create.scheduledDateLabel'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      linesTitle: t('create.linesTitle'),
      addLine: t('create.addLine'),
      noLines: t('create.noLines'),
      lineColumns: {
        seq: t('create.lineColumns.seq'),
        product: t('create.lineColumns.product'),
        qty: t('create.lineColumns.qty'),
        uom: t('create.lineColumns.uom'),
        remove: t('create.lineColumns.remove'),
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
      qtyPlaceholder: t('create.qtyPlaceholder'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errors: {
        toNumberRequired: t('create.errors.toNumberRequired'),
        warehousesRequired: t('create.errors.warehousesRequired'),
        sameWarehouse: t('create.errors.sameWarehouse'),
        linesRequired: t('create.errors.linesRequired'),
        lineProductRequired: t('create.errors.lineProductRequired'),
        lineQtyRequired: t('create.errors.lineQtyRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        already_exists: t('errors.already_exists'),
        invalid_state: t('errors.invalid_state'),
        persistence_failed: t('errors.persistence_failed'),
      },
    },
  };
}

async function ListContent({ locale, autoOpenCreate }: { locale: string; autoOpenCreate: boolean }) {
  const t = await getTranslations('Planning.transferOrders');
  const [listResult, warehouses, lineCounts] = await Promise.all([
    listTransferOrders({ limit: 200 }),
    listTransferWarehouses(),
    listTransferOrderLineCounts(),
  ]);

  if (!listResult.ok) {
    return (
      <div role="alert" data-testid="to-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <ToListView
      locale={locale}
      transferOrders={listResult.data}
      lineCounts={lineCounts}
      warehouses={warehouses}
      autoOpenCreate={autoOpenCreate}
      labels={buildLabels(t)}
      searchTransferItemsAction={searchTransferItems}
      createTransferOrderAction={createTransferOrder}
    />
  );
}

export default async function TransferOrdersListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const t = await getTranslations('Planning.transferOrders');

  return (
    <main
      data-screen="planning-to-list"
      data-prototype-label="plan_to_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.planning') }, { label: t('breadcrumb.transferOrders') }]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} />
      </Suspense>
    </main>
  );
}
