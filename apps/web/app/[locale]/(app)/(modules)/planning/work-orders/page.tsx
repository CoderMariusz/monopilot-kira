/**
 * P2-PLANNING — Work Orders list + create route (/planning/work-orders).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/planning/
 *   wo-list.jsx:4-279 (plan_wo_list) — status tabs, search, dense table, per-row
 *   Release action, "＋ Create WO" modal. See wo-list-view.tsx for the per-region
 *   anchors and the documented deviations (no-source columns dropped).
 *
 * Data: the reviewed listPlanningWorkOrders / createWorkOrder / releaseWorkOrder
 * actions (imported, never authored) + the small searchFgProducts /
 * listProductionResources read helpers in _actions/wo-form-data.ts. All run inside
 * withOrgContext (RLS-scoped). RBAC for create/release is enforced server-side in
 * those actions; this page never trusts a client flag.
 *
 * Deep-link: ?new=1 auto-opens the create modal (the planning dashboard's
 * "Create WO" button + /planning/work-orders/new redirect both target it).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (read is
 * RLS-scoped so a denied user simply sees an empty org-scoped list; create/release
 * surface forbidden inline), optimistic (release/create pending in the view/modal).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listPlanningWorkOrders } from './_actions/listPlanningWorkOrders';
import { createWorkOrder } from './_actions/createWorkOrder';
import { releaseWorkOrder } from './_actions/releaseWorkOrder';
import { searchFgProducts, listProductionResources } from './_actions/wo-form-data';
import { WoListView, type WoListLabels } from './_components/wo-list-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="wo-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): WoListLabels {
  return {
    createWo: t('actions.createWo'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: t('list.rowsCount'),
    tabs: {
      all: t('list.tabs.all'),
      DRAFT: t('woStatus.draft'),
      RELEASED: t('woStatus.released'),
      IN_PROGRESS: t('woStatus.in_progress'),
      ON_HOLD: t('woStatus.on_hold'),
      COMPLETED: t('woStatus.completed'),
    },
    status: {
      draft: t('woStatus.draft'),
      released: t('woStatus.released'),
      in_progress: t('woStatus.in_progress'),
      on_hold: t('woStatus.on_hold'),
      completed: t('woStatus.completed'),
      closed: t('woStatus.closed'),
      cancelled: t('woStatus.cancelled'),
    },
    columns: {
      wo: t('list.columns.wo'),
      product: t('list.columns.product'),
      status: t('list.columns.status'),
      qty: t('list.columns.qty'),
      scheduled: t('list.columns.scheduled'),
      line: t('list.columns.line'),
      bom: t('list.columns.bom'),
      actions: t('list.columns.actions'),
    },
    bomBadge: t('list.bomBadge'),
    noBomBadge: t('list.noBomBadge'),
    notAssigned: t('list.notAssigned'),
    release: t('list.release'),
    releasing: t('list.releasing'),
    confirmRelease: t('list.confirmRelease'),
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      clear: t('list.empty.clear'),
    },
    releaseError: {
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      invalid_state: t('errors.invalid_state'),
      invalid_input: t('errors.invalid_input'),
      persistence_failed: t('errors.persistence_failed'),
    },
    create: {
      title: t('create.title'),
      productLabel: t('create.productLabel'),
      productPlaceholder: t('create.productPlaceholder'),
      picker: {
        trigger: t('create.picker.trigger'),
        searchLabel: t('create.picker.searchLabel'),
        searchPlaceholder: t('create.picker.searchPlaceholder'),
        loading: t('create.picker.loading'),
        empty: t('create.picker.empty'),
        cancel: t('create.picker.cancel'),
        error: t('create.picker.error'),
      },
      quantityLabel: t('create.quantityLabel'),
      quantityPlaceholder: t('create.quantityPlaceholder'),
      scheduledStartLabel: t('create.scheduledStartLabel'),
      lineLabel: t('create.lineLabel'),
      machineLabel: t('create.machineLabel'),
      noneOption: t('create.noneOption'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      selectedProduct: t('create.selectedProduct'),
      errors: {
        productRequired: t('create.errors.productRequired'),
        quantityRequired: t('create.errors.quantityRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        invalid_state: t('errors.invalid_state'),
        persistence_failed: t('errors.persistence_failed'),
      },
      noBomWarning: t('create.noBomWarning'),
    },
  };
}

async function ListContent({ locale, autoOpenCreate }: { locale: string; autoOpenCreate: boolean }) {
  const t = await getTranslations('Planning.workOrders');
  const [listResult, resources] = await Promise.all([listPlanningWorkOrders({ limit: 200 }), listProductionResources()]);

  if (!listResult.ok) {
    return (
      <div role="alert" data-testid="wo-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <WoListView
      locale={locale}
      workOrders={listResult.workOrders}
      resources={resources}
      autoOpenCreate={autoOpenCreate}
      labels={buildLabels(t)}
      searchFgProductsAction={searchFgProducts}
      createWorkOrderAction={createWorkOrder}
      releaseWorkOrderAction={releaseWorkOrder}
    />
  );
}

export default async function WorkOrdersListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const t = await getTranslations('Planning.workOrders');

  return (
    <main
      data-screen="planning-wo-list"
      data-prototype-label="plan_wo_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.planning') }, { label: t('breadcrumb.workOrders') }]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} />
      </Suspense>
    </main>
  );
}
