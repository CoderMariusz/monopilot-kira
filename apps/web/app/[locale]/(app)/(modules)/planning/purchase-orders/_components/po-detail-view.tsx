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
import type { PoSupplierOption } from '../_actions/po-form-data';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items';

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
  confirmed: [
    { to: 'partially_received', labelKey: 'receivePartial', variant: 'primary' },
    { to: 'received', labelKey: 'receive', variant: 'primary' },
    { to: 'cancelled', labelKey: 'cancel', variant: 'danger' },
  ],
  partially_received: [{ to: 'received', labelKey: 'receive', variant: 'primary' }],
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
  suppliers = [],
  searchPoItemsAction,
  updatePurchaseOrderAction,
  addPurchaseOrderLineAction,
  updatePurchaseOrderLineAction,
  deletePurchaseOrderLineAction,
}: {
  po: PoDetail;
  labels: PoDetailLabels;
  locale: string;
  transitionPurchaseOrderStatusAction: (id: string, status: string) => Promise<PoTransitionResult>;
  /** Wave R1 edit seams — only used when status === 'draft'. Optional so legacy
   *  callers (non-edit usages / older tests) keep type-checking. */
  suppliers?: PoSupplierOption[];
  searchPoItemsAction?: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
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
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Wave R1 — DRAFT edit affordances. Gated on status===draft AND the seams being
  // wired (the page only passes them when editable). Never client-trusts permission;
  // the actions enforce RBAC + the draft-only state server-side.
  const isDraft = po.status.toLowerCase() === 'draft';
  const canEdit = isDraft && !!updatePurchaseOrderAction;
  const [editOpen, setEditOpen] = React.useState(false);
  const [lineModalOpen, setLineModalOpen] = React.useState(false);
  const [editLine, setEditLine] = React.useState<EditLineSeed | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

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

  async function onTransition(to: string) {
    if (pending) return;
    const prompt = labels.transitions.confirmPrompt
      .replace('{po}', po.poNumber)
      .replace('{status}', statusLabel(to));
    if (!window.confirm(prompt)) return;
    setPending(to);
    setError(null);
    try {
      const result = await transitionPurchaseOrderStatusAction(po.id, to);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(null);
        return;
      }
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
      </div>

      {error ? (
        <div role="alert" data-testid="po-detail-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
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
                    {canEdit ? <th className="px-3 py-2 text-right" /> : null}
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
                    disabled={pending !== null}
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
          searchPoItemsAction={searchPoItemsAction}
          addPurchaseOrderLineAction={addPurchaseOrderLineAction}
          updatePurchaseOrderLineAction={updatePurchaseOrderLineAction}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
