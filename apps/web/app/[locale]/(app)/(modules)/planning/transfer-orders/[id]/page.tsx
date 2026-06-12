/**
 * P2-PLANNING — Transfer Order detail route (/planning/transfer-orders/[id]).
 *
 * Prototype parity (1:1): prototypes/planning/to-screens.jsx:103-279 (PlanTODetail)
 *   — header + status actions + TO lines table + TO summary. See to-detail-view.tsx
 *   for per-region anchors + the honest treatment of the no-source cards (LP
 *   breakdown / status history / progress bars dropped — no data source).
 *
 * Data: the reviewed getTransferOrder + transitionTransferOrderStatus actions
 * (imported, never authored) + listTransferWarehouses for human-readable warehouse
 * names (from/to are soft uuid refs). All run inside withOrgContext (RLS-scoped):
 * a user from another org gets not_found rather than another org's TO.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found / invalid id (honest panel + back link), permission-denied (org-scoped
 * read returns not_found for out-of-org ids; transitions surface forbidden inline).
 * No client-trusted permissions.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getTransferOrder,
  transitionTransferOrderStatus,
  updateTransferOrder,
  addTransferOrderLine,
  updateTransferOrderLine,
  deleteTransferOrderLine,
} from '../_actions/actions';
import { listTransferWarehouses, searchTransferItems } from '../_actions/to-form-data';
import { ToDetailView, type ToDetailLabels } from '../_components/to-detail-view';

/** Client-facing adapters around the reviewed actions (some take positional args). */
async function updateTransferOrderAction(input: {
  id: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  expectedDate?: string;
  notes?: string;
}) {
  'use server';
  return updateTransferOrder(input);
}
async function addTransferOrderLineAction(toId: string, input: { itemId: string; quantity: string; uom: string }) {
  'use server';
  return addTransferOrderLine(toId, input);
}
async function updateTransferOrderLineAction(toId: string, lineId: string, input: { quantity?: string; uom?: string }) {
  'use server';
  return updateTransferOrderLine(toId, lineId, input);
}
async function deleteTransferOrderLineAction(toId: string, lineId: string) {
  'use server';
  return deleteTransferOrderLine(toId, lineId);
}

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="to-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

/** Per-locale UoM dropdown copy (mirrors the list page helper; canonical UoM set has
 *  no i18n keys). */
function uomLabels(locale: string): {
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

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>, locale: string): ToDetailLabels {
  const uoms = uomLabels(locale);
  return {
    status: {
      draft: t('toStatus.draft'),
      in_transit: t('toStatus.in_transit'),
      received: t('toStatus.received'),
      cancelled: t('toStatus.cancelled'),
    },
    summary: {
      title: t('detail.summary.title'),
      toNumber: t('detail.summary.toNumber'),
      from: t('detail.summary.from'),
      to: t('detail.summary.to'),
      status: t('detail.summary.status'),
      scheduled: t('detail.summary.scheduled'),
      created: t('detail.summary.created'),
      updated: t('detail.summary.updated'),
      notes: t('detail.summary.notes'),
      none: t('detail.summary.none'),
    },
    lines: {
      title: t('detail.lines.title'),
      seq: t('detail.lines.seq'),
      product: t('detail.lines.product'),
      qty: t('detail.lines.qty'),
      uom: t('detail.lines.uom'),
      empty: t('detail.lines.empty'),
    },
    transitions: {
      title: t('detail.transitions.title'),
      ship: t('detail.transitions.ship'),
      receive: t('detail.transitions.receive'),
      cancel: t('detail.transitions.cancel'),
      confirm: t('detail.transitions.confirm'),
      pending: t('detail.transitions.pending'),
      none: t('detail.transitions.none'),
    },
    errors: {
      invalid_input: t('errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      already_exists: t('errors.already_exists'),
      invalid_state: t('errors.invalid_state'),
      // Contract: deleteTransferOrderLine returns error 'last_line' on final-line refusal.
      last_line: t('edit.lastLineRefused'),
      persistence_failed: t('errors.persistence_failed'),
    },
    edit: {
      editOrder: t('edit.editOrder'),
      addLine: t('edit.addLine'),
      editLine: t('edit.editLine'),
      deleteLine: t('edit.deleteLine'),
      deleteLinePrompt: t('edit.deleteLinePrompt'),
      lastLineRefused: t('edit.lastLineRefused'),
      modal: {
        title: t('edit.modal.title'),
        fromWarehouseLabel: t('create.fromWarehouseLabel'),
        toWarehouseLabel: t('create.toWarehouseLabel'),
        warehousePlaceholder: t('create.warehousePlaceholder'),
        expectedDateLabel: t('create.scheduledDateLabel'),
        notesLabel: t('create.notesLabel'),
        notesPlaceholder: t('create.notesPlaceholder'),
        submit: t('edit.modal.submit'),
        submitting: t('edit.modal.submitting'),
        cancel: t('create.cancel'),
        errors: {
          warehousesRequired: t('create.errors.warehousesRequired'),
          sameWarehouse: t('create.errors.sameWarehouse'),
          invalid_input: t('errors.invalid_input'),
          forbidden: t('errors.forbidden'),
          not_found: t('errors.not_found'),
          invalid_state: t('edit.invalidStateMsg'),
          persistence_failed: t('errors.persistence_failed'),
        },
      },
      lineModal: {
        addTitle: t('edit.lineModal.addTitle'),
        editTitle: t('edit.lineModal.editTitle'),
        lineItem: t('create.lineColumns.product'),
        lineQty: t('create.lineColumns.qty'),
        lineUom: t('create.lineColumns.uom'),
        uomPlaceholder: uoms.placeholder,
        uomOptions: uoms.options,
        qtyPlaceholder: t('create.qtyPlaceholder'),
        submitAdd: t('edit.lineModal.submitAdd'),
        submitEdit: t('edit.lineModal.submitEdit'),
        submitting: t('edit.modal.submitting'),
        cancel: t('create.cancel'),
        errors: {
          itemRequired: t('create.errors.lineProductRequired'),
          qtyRequired: t('edit.lineModal.qtyRequired'),
          invalid_input: t('errors.invalid_input'),
          forbidden: t('errors.forbidden'),
          not_found: t('errors.not_found'),
          invalid_state: t('edit.invalidStateMsg'),
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
    },
  };
}

async function DetailContent({ locale, id }: { locale: string; id: string }) {
  const t = await getTranslations('Planning.transferOrders');
  const [result, warehouses] = await Promise.all([getTransferOrder(id), listTransferWarehouses()]);

  if (!result.ok) {
    if (result.error === 'not_found' || result.error === 'invalid_input') {
      return (
        <div role="note" data-testid="to-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p className="mb-3">{t('detail.notFound')}</p>
          <Link href={`/${locale}/planning/transfer-orders`} prefetch={false} className="text-blue-700 hover:underline">
            {t('detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="to-detail-error-banner" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <ToDetailView
      locale={locale}
      transferOrder={result.data}
      warehouses={warehouses}
      labels={buildLabels(t, locale)}
      transitionTransferOrderStatusAction={transitionTransferOrderStatus}
      searchTransferItemsAction={searchTransferItems}
      updateTransferOrderAction={updateTransferOrderAction}
      addTransferOrderLineAction={addTransferOrderLineAction}
      updateTransferOrderLineAction={updateTransferOrderLineAction}
      deleteTransferOrderLineAction={deleteTransferOrderLineAction}
    />
  );
}

export default async function TransferOrderDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('Planning.transferOrders');

  return (
    <main
      data-screen="planning-to-detail"
      data-prototype-label="plan_to_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('breadcrumb.transferOrders'), href: `/${locale}/planning/transfer-orders` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} id={id} />
      </Suspense>
    </main>
  );
}
