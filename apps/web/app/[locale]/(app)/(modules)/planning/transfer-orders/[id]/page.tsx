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
import { listTransferUnits, listTransferWarehouses, searchTransferItems } from '../_actions/to-form-data';
import { buildUomDropdown, type UomDropdown } from '../../_actions/uom-dropdown';
import { canReverseTransferReceipt, reverseToReceiveLine } from '../_actions/reverse-receive';
import { DocumentAuditTimelineSection } from '../../../_components/audit-timeline/document-audit-timeline-section';
import { ToDetailView, type ToDetailLabels } from '../_components/to-detail-view';
import type {
  ReverseToReceiveLineInput,
  ReverseToReceiveLineResult,
} from '../_components/reverse-receipt-modal';

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
/** R4-CL1 — client-facing adapter around reverseToReceiveLine (RBAC + e-sign are
 *  enforced inside the action; the page never trusts a client-only check). */
async function reverseToReceiveLineAction(input: ReverseToReceiveLineInput): Promise<ReverseToReceiveLineResult> {
  'use server';
  return reverseToReceiveLine(input) as Promise<ReverseToReceiveLineResult>;
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

/** Per-locale UoM fallback copy (mirrors the list page helper). Used ONLY when the
 *  org has no readable units — the real options come from public.unit_of_measure
 *  (listTransferUnits → buildUomDropdown). */
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

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>, locale: string, uoms: UomDropdown): ToDetailLabels {
  return {
    status: {
      draft: t('toStatus.draft'),
      in_transit: t('toStatus.in_transit'),
      partially_received: t('toStatus.partially_received'),
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
      insufficient_stock: t('errors.insufficient_stock'),
      // Contract: transitionTransferOrderStatus returns error 'partially_received'
      // when a TO with already-received destination LPs is asked to cancel — surface
      // the actionable message instead of the generic persistence_failed fallback.
      partially_received: t('errors.partially_received'),
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
        uomUnits: uoms.units,
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
    reverseReceipt: {
      received: t('reverseReceipt.received'),
      destLp: t('reverseReceipt.destLp'),
      action: t('reverseReceipt.action'),
      permissionTooltip: t('reverseReceipt.permissionTooltip'),
      notReceivableTooltip: t('reverseReceipt.notReceivableTooltip'),
      modal: {
        title: t('reverseReceipt.title'),
        intro: t('reverseReceipt.intro'),
        summary: {
          toNumber: t('reverseReceipt.summary.toNumber'),
          product: t('reverseReceipt.summary.product'),
          destLp: t('reverseReceipt.summary.destLp'),
          quantity: t('reverseReceipt.summary.quantity'),
        },
        reasonCode: t('reverseReceipt.reasonCode'),
        reasonPlaceholder: t('reverseReceipt.reasonPlaceholder'),
        reasonOptions: {
          entry_error: t('reverseReceipt.reasonOptions.entry_error'),
          wrong_quantity: t('reverseReceipt.reasonOptions.wrong_quantity'),
          wrong_batch: t('reverseReceipt.reasonOptions.wrong_batch'),
          wrong_product: t('reverseReceipt.reasonOptions.wrong_product'),
          other: t('reverseReceipt.reasonOptions.other'),
        },
        note: t('reverseReceipt.note'),
        noteOptional: t('reverseReceipt.noteOptional'),
        notePlaceholder: t('reverseReceipt.notePlaceholder'),
        esign: {
          title: t('reverseReceipt.esign.title'),
          meaning: t('reverseReceipt.esign.meaning'),
          password: t('reverseReceipt.esign.password'),
          passwordPlaceholder: t('reverseReceipt.esign.passwordPlaceholder'),
          passwordHelp: t('reverseReceipt.esign.passwordHelp'),
        },
        cancel: t('reverseReceipt.cancel'),
        submit: t('reverseReceipt.submit'),
        submitting: t('reverseReceipt.submitting'),
        formIncomplete: t('reverseReceipt.formIncomplete'),
        errors: {
          forbidden: t('reverseReceipt.errors.forbidden'),
          not_found: t('reverseReceipt.errors.not_found'),
          invalid_input: t('reverseReceipt.errors.invalid_input'),
          invalid_state: t('reverseReceipt.errors.invalid_state'),
          invalid_quantity: t('reverseReceipt.errors.invalid_quantity'),
          lp_active: t('reverseReceipt.errors.lp_active'),
          esign_failed: t('reverseReceipt.errors.esign_failed'),
          persistence_failed: t('reverseReceipt.errors.persistence_failed'),
          generic: t('reverseReceipt.errors.generic'),
        },
      },
    },
  };
}

async function DetailContent({ locale, id }: { locale: string; id: string }) {
  const t = await getTranslations('Planning.transferOrders');
  const [result, warehouses, canReverseReceipt, orgUnits] = await Promise.all([
    getTransferOrder(id),
    listTransferWarehouses(),
    canReverseTransferReceipt(),
    listTransferUnits(),
  ]);
  const uom = buildUomDropdown(orgUnits, uomFallbackLabels(locale));

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
    <div className="flex flex-col gap-4">
    <ToDetailView
      locale={locale}
      transferOrder={result.data}
      warehouses={warehouses}
      labels={buildLabels(t, locale, uom)}
      transitionTransferOrderStatusAction={transitionTransferOrderStatus}
      searchTransferItemsAction={searchTransferItems}
      updateTransferOrderAction={updateTransferOrderAction}
      addTransferOrderLineAction={addTransferOrderLineAction}
      updateTransferOrderLineAction={updateTransferOrderLineAction}
      deleteTransferOrderLineAction={deleteTransferOrderLineAction}
      canReverseReceipt={canReverseReceipt}
      reverseToReceiveLineAction={reverseToReceiveLineAction}
    />
    <DocumentAuditTimelineSection entityType="transfer_order" entityId={result.data.id} locale={locale} />
    </div>
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
