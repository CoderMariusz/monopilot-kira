/**
 * P2-PLANNING — Purchase Order detail route (/planning/purchase-orders/[id]).
 *
 * Prototype parity (1:1): prototypes/planning/po-screens.jsx:141-351 (PlanPODetail)
 *   — header (code/supplier/status), PO lines table, summary side panel, status
 *   action buttons. See po-detail-view.tsx for the per-region anchors + the honest
 *   treatment of the no-source regions (GRN progress / approval gate / D365 / status
 *   history — no data in getPurchaseOrder).
 *
 * Data: the reviewed getPurchaseOrder (header + lines) + transitionPurchaseOrderStatus
 * actions (imported, never authored), run inside withOrgContext (RLS-scoped). The
 * read is org-scoped, so a user from another org gets not_found rather than another
 * org's PO. RBAC for the status transition (npd.planning.write) is enforced
 * server-side inside transitionPurchaseOrderStatus; this page never trusts a client
 * flag.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found / invalid id (404-style honest panel), permission-denied (org-scoped
 * read returns not_found for out-of-org ids; transition surfaces forbidden inline).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getPurchaseOrder,
  transitionPurchaseOrderStatus,
  reopenPurchaseOrder,
  updatePurchaseOrder,
  addPurchaseOrderLine,
  updatePurchaseOrderLine,
  deletePurchaseOrderLine,
} from '../_actions/actions';
import { listPoSuppliers, listPoUnits, searchPoItems } from '../_actions/po-form-data';
import { buildUomDropdown, type UomDropdown } from '../../_actions/uom-dropdown';
import { PoDetailView, type PoDetailLabels } from '../_components/po-detail-view';

/** Thin client-facing adapters around the reviewed actions so the client view's
 *  narrow `{ ok; error: string }` seam type lines up with the server result union. */
async function updatePurchaseOrderAction(input: {
  id: string;
  supplierId?: string;
  expectedDelivery?: string;
  currency?: string;
  notes?: string;
}) {
  'use server';
  return updatePurchaseOrder(input);
}
async function addPurchaseOrderLineAction(input: { poId: string; itemId: string; qty: string; uom: string; unitPrice: string }) {
  'use server';
  return addPurchaseOrderLine(input);
}
async function updatePurchaseOrderLineAction(input: { poId: string; lineId: string; qty?: string; uom?: string; unitPrice?: string }) {
  'use server';
  return updatePurchaseOrderLine(input);
}
async function deletePurchaseOrderLineAction(input: { poId: string; lineId: string }) {
  'use server';
  return deletePurchaseOrderLine(input);
}
/** Wave-R reversibility seam — sent→draft. The reviewed reopenPurchaseOrder
 *  re-checks RBAC (npd.planning.write) + the no-receipts guard and returns
 *  'po_has_receipts' when receipts exist; surfaced honestly in the view. */
async function reopenPurchaseOrderAction(id: string) {
  'use server';
  return reopenPurchaseOrder(id);
}

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="po-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

/** Per-locale UoM fallback copy (mirrors the list page's local helper). Used ONLY
 *  when the org has no readable units — the real options come from
 *  public.unit_of_measure (listPoUnits → buildUomDropdown). */
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

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>, locale: string, uoms: UomDropdown): PoDetailLabels {
  return {
    status: {
      draft: t('poStatus.draft'),
      sent: t('poStatus.sent'),
      confirmed: t('poStatus.confirmed'),
      partially_received: t('poStatus.partially_received'),
      received: t('poStatus.received'),
      cancelled: t('poStatus.cancelled'),
    },
    summary: {
      title: t('detail.summary.title'),
      supplier: t('detail.summary.supplier'),
      status: t('detail.summary.status'),
      expected: t('detail.summary.expected'),
      currency: t('detail.summary.currency'),
      total: t('detail.summary.total'),
      created: t('detail.summary.created'),
    },
    lines: {
      title: t('detail.lines.title'),
      seq: t('detail.lines.seq'),
      item: t('detail.lines.item'),
      qty: t('detail.lines.qty'),
      uom: t('detail.lines.uom'),
      unitPrice: t('detail.lines.unitPrice'),
      lineTotal: t('detail.lines.lineTotal'),
      received: t('detail.lines.received'),
      receivedFull: t('detail.lines.receivedFull'),
      receivedPartial: t('detail.lines.receivedPartial'),
      empty: t('detail.lines.empty'),
    },
    receivedSummary: {
      title: t('detail.receivedSummary.title'),
      lines: t('detail.receivedSummary.lines'),
    },
    transitions: {
      title: t('detail.transitions.title'),
      send: t('detail.transitions.send'),
      confirm: t('detail.transitions.confirm'),
      receivePartial: t('detail.transitions.receivePartial'),
      receive: t('detail.transitions.receive'),
      cancel: t('detail.transitions.cancel'),
      pending: t('detail.transitions.pending'),
      confirmPrompt: t('detail.transitions.confirmPrompt'),
    },
    reopen: {
      button: t('detail.reopen.button'),
      pending: t('detail.reopen.pending'),
      confirmPrompt: t('detail.reopen.confirmPrompt'),
    },
    notesTitle: t('notes.title'),
    errors: {
      invalid_input: t('errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      already_exists: t('errors.already_exists'),
      invalid_state: t('errors.invalid_state'),
      // Contract: deletePurchaseOrderLine returns error 'last_line' when refusing
      // to remove the final line. Map it to the dedicated copy.
      last_line: t('edit.lastLineRefused'),
      // Contract: reopenPurchaseOrder returns 'po_has_receipts' when the PO already
      // has GRN receipts — surfaced honestly rather than swallowed.
      po_has_receipts: t('errors.po_has_receipts'),
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
        supplierLabel: t('create.supplierLabel'),
        supplierPlaceholder: t('create.supplierPlaceholder'),
        expectedLabel: t('create.expectedLabel'),
        currencyLabel: t('create.currencyLabel'),
        notesLabel: t('create.notesLabel'),
        notesPlaceholder: t('create.notesPlaceholder'),
        submit: t('edit.modal.submit'),
        submitting: t('edit.modal.submitting'),
        cancel: t('create.cancel'),
        errors: {
          supplierRequired: t('create.errors.supplierRequired'),
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
        lineItem: t('create.lineItem'),
        lineQty: t('create.lineQty'),
        lineUom: t('create.lineUom'),
        lineUnitPrice: t('create.lineUnitPrice'),
        uomPlaceholder: uoms.placeholder,
        uomOptions: uoms.options,
        uomUnits: uoms.units,
        qtyPlaceholder: t('create.qtyPlaceholder'),
        unitPricePlaceholder: t('create.unitPricePlaceholder'),
        submitAdd: t('edit.lineModal.submitAdd'),
        submitEdit: t('edit.lineModal.submitEdit'),
        submitting: t('edit.modal.submitting'),
        cancel: t('create.cancel'),
        errors: {
          itemRequired: t('create.errors.linesRequired'),
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
  const t = await getTranslations('Planning.purchaseOrders');
  const [result, suppliers, orgUnits] = await Promise.all([getPurchaseOrder(id), listPoSuppliers(), listPoUnits()]);
  const uom = buildUomDropdown(orgUnits, uomFallbackLabels(locale));

  if (!result.ok) {
    if (result.error === 'not_found' || result.error === 'invalid_input') {
      return (
        <div role="note" data-testid="po-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p className="mb-3">{t('detail.notFound')}</p>
          <Link href={`/${locale}/planning/purchase-orders`} prefetch={false} className="text-blue-700 hover:underline">
            {t('detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="po-detail-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const po = result.data;
  return (
    <PoDetailView
      locale={locale}
      po={{
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplierCode: po.supplierCode,
        supplierName: po.supplierName,
        status: po.status,
        expectedDelivery: po.expectedDelivery,
        currency: po.currency,
        notes: po.notes,
        createdAt: po.createdAt,
        lines: po.lines.map((l) => ({
          id: l.id,
          itemCode: l.itemCode,
          itemName: l.itemName,
          qty: l.qty,
          uom: l.uom,
          unitPrice: l.unitPrice,
          lineNo: l.lineNo,
          receivedQty: l.receivedQty,
        })),
      }}
      labels={buildLabels(t, locale, uom)}
      transitionPurchaseOrderStatusAction={transitionPurchaseOrderStatus}
      reopenPurchaseOrderAction={reopenPurchaseOrderAction}
      suppliers={suppliers}
      searchPoItemsAction={searchPoItems}
      updatePurchaseOrderAction={updatePurchaseOrderAction}
      addPurchaseOrderLineAction={addPurchaseOrderLineAction}
      updatePurchaseOrderLineAction={updatePurchaseOrderLineAction}
      deletePurchaseOrderLineAction={deletePurchaseOrderLineAction}
    />
  );
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('Planning.purchaseOrders');

  return (
    <main
      data-screen="planning-po-detail"
      data-prototype-label="plan_po_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('breadcrumb.purchaseOrders'), href: `/${locale}/planning/purchase-orders` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} id={id} />
      </Suspense>
    </main>
  );
}
