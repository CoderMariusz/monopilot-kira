'use client';

/**
 * P2-PLANNING — Purchase Order detail (planning view, client).
 *
 * Prototype parity: prototypes/planning/po-screens.jsx:141-351 (PlanPODetail):
 *     header (code/supplier/status + meta)     → po-screens.jsx:166-186
 *     status action buttons                     → po-screens.jsx:147-184
 *     PO lines table (# / product / qty /       → po-screens.jsx:205-249
 *       unit price / line total / received)
 *     PO summary side panel + totals            → po-screens.jsx:290-312
 *     Notes card                                → po-screens.jsx:251-261
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's per-status action map (draft/submitted/pending_approval/…,
 *     po-screens.jsx:147-154) is replaced by the REAL PurchaseOrderStatusSchema
 *     transitions wired to transitionPurchaseOrderStatus: draft→sent, sent→confirmed,
 *     confirmed→partially_received / received, partially_received→received, and
 *     →cancelled from any non-terminal state. There is no submit/approve/reject
 *     workflow in the reviewed backend (mig 262), so those prototype buttons map to
 *     the real send/confirm/receive transitions instead of being faked.
 *   - The prototype's "received N/qty" progress bars, line discount %, money
 *     subtotal/tax/discount rollup, GRN progress, approval gate card, D365-sync card
 *     and status-history table are dropped: none have a backing column/feed in
 *     getPurchaseOrder (it returns header + lines only). We render real columns +
 *     an honest line_total = qty × unit_price computed client-side.
 *
 * Data comes from the reviewed getPurchaseOrder (header + lines) +
 * transitionPurchaseOrderStatus (the seam). RBAC (npd.planning.write) is enforced
 * server-side inside the transition action; this view never trusts a client flag.
 *
 * UI states: loading/error/not-found resolved by the RSC page; here the detail is
 * always for a successfully-loaded PO. Transition: optimistic (pending — buttons
 * disabled + busy), error (forbidden/invalid_input/persistence_failed inline alert).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { PoStatusBadge } from './po-status-badge';
import { EditPoModal, type EditPoLabels, type EditPoResult } from './edit-po-modal';
import { PoLineModal, type PoLineModalLabels, type PoLineMutationResult, type EditLineSeed } from './po-line-modal';
import type { GetItemSupplierPriceAction } from './create-po-modal';
import {
  ReceivePoLineModal,
  type ReceivePoLineLabels,
  type ReceiveLineSeed,
  type ReceiveLocationOption,
} from './receive-po-line-modal';
import type { PoSupplierOption } from '../_actions/po-form-data';
import type { DesktopReceiveInput, DesktopReceiveResult } from '../_actions/receive-po-line.types';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items-types';

export type PoDetailLine = {
  id: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  unitPrice: string;
  lineNo: number;
  /** Σ grn_items.received_qty for this line (non-cancelled GRNs), decimal string. */
  receivedQty: string;
};

export type PoDetail = {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  status: string;
  expectedDelivery: string | null;
  currency: string;
  destinationWarehouseName: string | null;
  notes: string | null;
  createdAt: string;
  lines: PoDetailLine[];
};

export type PoDetailLabels = {
  status: Record<string, string>;
  summary: {
    title: string;
    supplier: string;
    status: string;
    expected: string;
    currency: string;
    destinationWarehouse: string;
    total: string;
    created: string;
  };
  lines: {
    title: string;
    seq: string;
    item: string;
    qty: string;
    uom: string;
    unitPrice: string;
    lineTotal: string;
    received: string;
    receivedFull: string;
    receivedPartial: string;
    empty: string;
  };
  receivedSummary: {
    title: string;
    /** Template with {received} / {total} placeholders, e.g. "{received} / {total} lines". */
    lines: string;
  };
  transitions: {
    title: string;
    send: string;
    confirm: string;
    receivePartial: string;
    receive: string;
    cancel: string;
    pending: string;
    confirmPrompt: string;
    cancelConfirmTitle: string;
    cancelConfirmBody: string;
    cancelSuccess: string;
    cancelPoHasReceipts: string;
  };
  /** Wave-R reversibility — sent→draft reopen affordance. */
  reopen: {
    /** Button copy. */
    button: string;
    /** Busy copy while the reopen action is in flight. */
    pending: string;
    /** window.confirm prompt; `{po}` interpolated. */
    confirmPrompt: string;
    confirmTitle: string;
    confirmBody: string;
    success: string;
    error: string;
  };
  notesTitle: string;
  errors: Record<string, string>;
  /** Wave R1 reversibility — DRAFT-only edit affordances. */
  edit: {
    /** "Edit order" header button + per-line row actions. */
    editOrder: string;
    addLine: string;
    editLine: string;
    deleteLine: string;
    deleteLinePrompt: string;
    /** Refused when it would remove the last line (contract: deleting last line refused). */
    lastLineRefused: string;
    modal: EditPoLabels;
    lineModal: PoLineModalLabels;
  };
  /** Desktop "Receive" affordance — present only when the receive seam is wired. */
  receive?: {
    /** Per-line "Receive" button copy. */
    button: string;
    modal: ReceivePoLineLabels;
  };
};

export type PoTransitionResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** Allowed forward/cancel transitions per the real PurchaseOrderStatusSchema. */
const TRANSITIONS: Record<string, Array<{ to: string; labelKey: keyof PoDetailLabels['transitions']; variant: 'primary' | 'danger' }>> = {
  draft: [
    { to: 'sent', labelKey: 'send', variant: 'primary' },
    { to: 'cancelled', labelKey: 'cancel', variant: 'danger' },
  ],
  sent: [
    { to: 'confirmed', labelKey: 'confirm', variant: 'primary' },
    { to: 'cancelled', labelKey: 'cancel', variant: 'danger' },
  ],
  confirmed: [{ to: 'cancelled', labelKey: 'cancel', variant: 'danger' }],
  partially_received: [{ to: 'cancelled', labelKey: 'cancel', variant: 'danger' }],
  received: [],
  cancelled: [],
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

function money(value: number, currency: string): string {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function PoDetailView({
  po,
  labels,
  locale,
  transitionPurchaseOrderStatusAction,
  reopenPurchaseOrderAction,
  suppliers = [],
  searchPoItemsAction,
  getItemSupplierPriceAction,
  updatePurchaseOrderAction,
  addPurchaseOrderLineAction,
  updatePurchaseOrderLineAction,
  deletePurchaseOrderLineAction,
  receivePoLineAction,
  receiveLocations = [],
}: {
  po: PoDetail;
  labels: PoDetailLabels;
  locale: string;
  transitionPurchaseOrderStatusAction: (id: string, status: string) => Promise<PoTransitionResult>;
  /** Wave-R reversibility — sent→draft. RBAC (npd.planning.write) + the no-receipts
   *  guard are enforced server-side inside reopenPurchaseOrder; never client-trusted.
   *  Optional so legacy callers / older tests keep type-checking. */
  reopenPurchaseOrderAction?: (id: string) => Promise<PoTransitionResult>;
  /** Wave R1 edit seams — only used when status === 'draft'. Optional so legacy
   *  callers (non-edit usages / older tests) keep type-checking. */
  suppliers?: PoSupplierOption[];
  searchPoItemsAction?: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  /** BUG1 — supplier-effective price pre-fill on line item select (optional seam). */
  getItemSupplierPriceAction?: GetItemSupplierPriceAction;
  updatePurchaseOrderAction?: (input: {
    id: string;
    supplierId?: string;
    expectedDelivery?: string;
    currency?: string;
    notes?: string;
  }) => Promise<EditPoResult>;
  addPurchaseOrderLineAction?: (input: {
    poId: string;
    itemId: string;
    qty: string;
    uom: string;
    unitPrice: string;
  }) => Promise<PoLineMutationResult>;
  updatePurchaseOrderLineAction?: (input: {
    poId: string;
    lineId: string;
    qty?: string;
    uom?: string;
    unitPrice?: string;
  }) => Promise<PoLineMutationResult>;
  deletePurchaseOrderLineAction?: (input: { poId: string; lineId: string }) => Promise<PoLineMutationResult>;
  /** Desktop receive seam. RBAC (warehouse.grn.receive) enforced server-side inside
   *  receivePoLineDesktop; never client-trusted. Optional so legacy callers / older
   *  tests keep type-checking. */
  receivePoLineAction?: (input: DesktopReceiveInput) => Promise<DesktopReceiveResult>;
  /** Optional org-scoped, warehouse-grouped locations for the destination picker. */
  receiveLocations?: ReceiveLocationOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [reopening, setReopening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Wave R1 — DRAFT edit affordances. Gated on status===draft AND the seams being
  // wired (the page only passes them when editable). Never client-trusts permission;
  // the actions enforce RBAC + the draft-only state server-side.
  const isDraft = po.status.toLowerCase() === 'draft';
  const canEdit = isDraft && !!updatePurchaseOrderAction;

  // Wave-R reversibility affordance. Offered for `sent` and `cancelled` POs per the
  // route contract and only
  // when the seam is wired (the page passes it). Never client-trusts the
  // npd.planning.write permission nor the no-receipts guard — reopenPurchaseOrder
  // re-checks both server-side and returns 'po_has_receipts' when receipts exist.
  const isCancelled = po.status.toLowerCase() === 'cancelled' || po.status.toLowerCase() === 'sent';
  const canReopen = isCancelled && !!reopenPurchaseOrderAction;
  const [editOpen, setEditOpen] = React.useState(false);
  const [lineModalOpen, setLineModalOpen] = React.useState(false);
  const [editLine, setEditLine] = React.useState<EditLineSeed | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Desktop receive affordance. Offered per-line ONLY when the PO is in a
  // receivable status AND the seam is wired (the page passes it when the action
  // is available). RBAC (warehouse.grn.receive) is re-checked server-side inside
  // receivePoLineDesktop — never client-trusted.
  const receivableStatus = po.status.toLowerCase();
  const canReceive = (receivableStatus === 'confirmed' || receivableStatus === 'partially_received') && !!receivePoLineAction && !!labels.receive;
  const [receiveLine, setReceiveLine] = React.useState<ReceiveLineSeed | null>(null);
  const [receiveOpen, setReceiveOpen] = React.useState(false);

  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;
  const actions = TRANSITIONS[po.status.toLowerCase()] ?? [];

  async function onDeleteLine(line: PoDetailLine) {
    if (!deletePurchaseOrderLineAction || deletingId) return;
    // Client hint mirroring the contract: deleting the last line is refused server-side.
    if (po.lines.length <= 1) {
      setError(labels.edit.lastLineRefused);
      return;
    }
    if (!window.confirm(labels.edit.deleteLinePrompt.replace('{line}', String(line.lineNo)))) return;
    setDeletingId(line.id);
    setError(null);
    try {
      const result = await deletePurchaseOrderLineAction({ poId: po.id, lineId: line.id });
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setDeletingId(null);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setDeletingId(null);
    }
  }

  function openAddLine() {
    setEditLine(null);
    setLineModalOpen(true);
  }
  function openEditLine(line: PoDetailLine) {
    setEditLine({
      lineId: line.id,
      itemCode: line.itemCode,
      itemName: line.itemName,
      qty: line.qty,
      uom: line.uom,
      unitPrice: line.unitPrice,
    });
    setLineModalOpen(true);
  }
  function openReceive(line: PoDetailLine) {
    setReceiveLine({
      id: line.id,
      itemCode: line.itemCode,
      itemName: line.itemName,
      qty: line.qty,
      uom: line.uom,
      receivedQty: line.receivedQty,
    });
    setReceiveOpen(true);
  }

  const orderTotal = po.lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.unitPrice), 0);

  // Receipt rollup. Lines can carry mixed UoMs, so the header progress is
  // line-based (fully received lines / total lines), never a cross-UoM qty sum.
  const receiptOf = (l: PoDetailLine): 'none' | 'partial' | 'full' => {
    const received = Number(l.receivedQty);
    if (!(received > 0)) return 'none';
    return received >= Number(l.qty) ? 'full' : 'partial';
  };
  const fullyReceivedLines = po.lines.filter((l) => receiptOf(l) === 'full').length;
  const receiptPct = po.lines.length > 0 ? Math.round((fullyReceivedLines / po.lines.length) * 100) : 0;

  async function onReopen() {
    if (!reopenPurchaseOrderAction || reopening || pending) return;
    const title = labels.reopen.confirmTitle.replace('{po}', po.poNumber);
    const body = labels.reopen.confirmBody.replace('{po}', po.poNumber);
    if (!window.confirm(`${title}\n\n${body}`)) return;
    setReopening(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await reopenPurchaseOrderAction(po.id);
      if (!result.ok) {
        // Surface po_has_receipts honestly (its own copy); fall back to generic.
        setError(result.error === 'po_has_receipts' ? labels.errors.po_has_receipts : labels.reopen.error);
        setReopening(false);
        return;
      }
      setSuccess(labels.reopen.success);
      router.refresh();
    } catch {
      setError(labels.reopen.error);
      setReopening(false);
    }
  }

  async function onTransition(to: string) {
    if (pending || reopening) return;
    const prompt =
      to === 'cancelled'
        ? `${labels.transitions.cancelConfirmTitle.replace('{po}', po.poNumber)}\n\n${labels.transitions.cancelConfirmBody.replace('{po}', po.poNumber)}`
        : labels.transitions.confirmPrompt
            .replace('{po}', po.poNumber)
            .replace('{status}', statusLabel(to));
    if (!window.confirm(prompt)) return;
    setPending(to);
    setError(null);
    setSuccess(null);
    try {
      const result = await transitionPurchaseOrderStatusAction(po.id, to);
      if (!result.ok) {
        setError(result.error === 'po_has_receipts' && to === 'cancelled' ? labels.transitions.cancelPoHasReceipts : labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(null);
        return;
      }
      if (to === 'cancelled') setSuccess(labels.transitions.cancelSuccess);
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="po-detail-view" data-prototype-label="plan_po_detail">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3" data-testid="po-detail-header">
        <span className="font-mono text-lg font-semibold text-slate-900">{po.poNumber}</span>
        <span className="text-slate-700">{po.supplierName ?? '—'}</span>
        <PoStatusBadge status={po.status} label={statusLabel(po.status)} />
        {canEdit ? (
          <button
            type="button"
            data-testid="po-edit-order"
            className="ml-auto rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setEditOpen(true)}
          >
            {labels.edit.editOrder}
          </button>
        ) : null}
        {canReopen ? (
          <button
            type="button"
            data-testid="po-reopen-draft"
            className={`${canEdit ? '' : 'ml-auto '}rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50`}
            disabled={reopening}
            aria-busy={reopening}
            onClick={() => void onReopen()}
          >
            {reopening ? labels.reopen.pending : labels.reopen.button}
          </button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" data-testid="po-detail-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" data-testid="po-detail-success" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left: lines + notes */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              <span>
                {labels.lines.title} · {po.lines.length}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  data-testid="po-add-line"
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={openAddLine}
                >
                  {labels.edit.addLine}
                </button>
              ) : null}
            </div>
            {po.lines.length === 0 ? (
              <div data-testid="po-lines-empty" className="px-4 py-8 text-center text-sm text-slate-500">
                {labels.lines.empty}
              </div>
            ) : (
              <table className="w-full text-sm" data-testid="po-lines-table">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{labels.lines.seq}</th>
                    <th className="px-3 py-2">{labels.lines.item}</th>
                    <th className="px-3 py-2 text-right">{labels.lines.qty}</th>
                    <th className="px-3 py-2">{labels.lines.uom}</th>
                    <th className="px-3 py-2 text-right">{labels.lines.unitPrice}</th>
                    <th className="px-3 py-2 text-right">{labels.lines.lineTotal}</th>
                    <th className="px-3 py-2 text-right">{labels.lines.received}</th>
                    {canEdit || canReceive ? <th className="px-3 py-2 text-right" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => (
                    <tr key={l.id} data-testid={`po-line-${l.id}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.lineNo}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{l.itemName ?? '—'}</div>
                        <div className="font-mono text-xs text-slate-500">{l.itemCode ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{l.qty}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.uom}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{money(Number(l.unitPrice), po.currency)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                        {money(Number(l.qty) * Number(l.unitPrice), po.currency)}
                      </td>
                      <td className="px-3 py-2 text-right" data-testid={`po-line-received-${l.id}`}>
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-xs tabular-nums text-slate-700">
                            {Number(l.receivedQty) > 0 ? `${l.receivedQty} ${l.uom}` : '—'}
                          </span>
                          {receiptOf(l) === 'full' ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              {labels.lines.receivedFull}
                            </span>
                          ) : receiptOf(l) === 'partial' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              {labels.lines.receivedPartial}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2 text-right whitespace-nowrap" data-testid={`po-line-actions-${l.id}`}>
                          <button
                            type="button"
                            data-testid={`po-line-edit-${l.id}`}
                            className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            onClick={() => openEditLine(l)}
                          >
                            {labels.edit.editLine}
                          </button>
                          <button
                            type="button"
                            data-testid={`po-line-delete-${l.id}`}
                            className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            disabled={deletingId === l.id}
                            aria-busy={deletingId === l.id}
                            onClick={() => onDeleteLine(l)}
                          >
                            {labels.edit.deleteLine}
                          </button>
                        </td>
                      ) : canReceive ? (
                        <td className="px-3 py-2 text-right whitespace-nowrap" data-testid={`po-line-actions-${l.id}`}>
                          {receiptOf(l) === 'full' ? null : (
                            <button
                              type="button"
                              data-testid={`po-line-receive-${l.id}`}
                              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                              onClick={() => openReceive(l)}
                            >
                              {labels.receive!.button}
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {po.notes ? (
            <div className="rounded-xl border border-slate-200 p-4" data-testid="po-detail-notes">
              <div className="mb-1 text-sm font-semibold text-slate-700">{labels.notesTitle}</div>
              <div className="text-sm text-slate-600">{po.notes}</div>
            </div>
          ) : null}
        </div>

        {/* Right: summary + transitions */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 p-4" data-testid="po-detail-summary">
            <div className="mb-3 text-sm font-semibold text-slate-700">{labels.summary.title}</div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.supplier}</dt>
                <dd className="text-slate-800">{po.supplierName ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.status}</dt>
                <dd>
                  <PoStatusBadge status={po.status} label={statusLabel(po.status)} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.expected}</dt>
                <dd className="font-mono text-xs text-slate-800">{fmtDate(po.expectedDelivery, locale)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.currency}</dt>
                <dd className="font-mono text-xs text-slate-800">{po.currency}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.destinationWarehouse}</dt>
                <dd className="text-right text-slate-800" data-testid="po-detail-destination-warehouse">
                  {po.destinationWarehouseName ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.created}</dt>
                <dd className="font-mono text-xs text-slate-800">{fmtDate(po.createdAt, locale)}</dd>
              </div>
              <div className="mt-1 border-t border-slate-200 pt-2" data-testid="po-detail-received-summary">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">{labels.receivedSummary.title}</dt>
                  <dd className="font-mono text-xs text-slate-800">
                    {labels.receivedSummary.lines
                      .replace('{received}', String(fullyReceivedLines))
                      .replace('{total}', String(po.lines.length))}
                  </dd>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${receiptPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, receiptPct)}%` }}
                  />
                </div>
              </div>
              <div className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-700">{labels.summary.total}</dt>
                <dd className="font-mono font-semibold text-slate-900" data-testid="po-detail-total">
                  {money(orderTotal, po.currency)}
                </dd>
              </div>
            </dl>
          </div>

          {actions.length > 0 ? (
            <div className="rounded-xl border border-slate-200 p-4" data-testid="po-detail-transitions">
              <div className="mb-3 text-sm font-semibold text-slate-700">{labels.transitions.title}</div>
              <div className="flex flex-col gap-2">
                {actions.map((a) => (
                  <button
                    key={a.to}
                    type="button"
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-medium',
                      a.variant === 'danger'
                        ? 'border border-red-200 text-red-700 hover:bg-red-50'
                        : 'bg-slate-900 text-white hover:bg-slate-800',
                      pending ? 'opacity-60' : '',
                    ].join(' ')}
                    data-testid={`po-transition-${a.to}`}
                    disabled={pending !== null || reopening}
                    aria-busy={pending === a.to}
                    onClick={() => onTransition(a.to)}
                  >
                    {pending === a.to ? labels.transitions.pending : labels.transitions[a.labelKey]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {canEdit && updatePurchaseOrderAction ? (
        <EditPoModal
          open={editOpen}
          onOpenChange={setEditOpen}
          labels={labels.edit.modal}
          suppliers={suppliers}
          initial={{
            id: po.id,
            supplierId: po.supplierId,
            expectedDelivery: po.expectedDelivery,
            currency: po.currency,
            notes: po.notes,
          }}
          updatePurchaseOrderAction={updatePurchaseOrderAction}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {canEdit && searchPoItemsAction && addPurchaseOrderLineAction && updatePurchaseOrderLineAction ? (
        <PoLineModal
          open={lineModalOpen}
          onOpenChange={setLineModalOpen}
          labels={labels.edit.lineModal}
          poId={po.id}
          editLine={editLine}
          supplierId={po.supplierId}
          expectedDelivery={po.expectedDelivery}
          searchPoItemsAction={searchPoItemsAction}
          getItemSupplierPriceAction={getItemSupplierPriceAction}
          addPurchaseOrderLineAction={addPurchaseOrderLineAction}
          updatePurchaseOrderLineAction={updatePurchaseOrderLineAction}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {canReceive && receivePoLineAction != null && labels.receive != null ? (
        <ReceivePoLineModal
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          labels={labels.receive.modal}
          line={receiveLine}
          locations={receiveLocations}
          receivePoLineAction={receivePoLineAction}
          onReceived={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
