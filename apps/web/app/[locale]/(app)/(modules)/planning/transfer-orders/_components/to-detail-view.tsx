'use client';

/**
 * P2-PLANNING — Transfer Order detail (client view).
 *
 * Prototype parity: prototypes/planning/to-screens.jsx:103-279 (PlanTODetail):
 *   header (TO code + from → to + status)    → to-screens.jsx:123-149
 *   status action group                      → to-screens.jsx:109-115,138-147
 *   TO lines table (# / product / qty / uom) → to-screens.jsx:153-196
 *   TO summary panel                         → to-screens.jsx:234-248
 *
 * Deviations (parity evidence): the prototype's shipped/received progress bars,
 * LP-breakdown card, status-history card, Add-line / Add-LP / Edit / Ship modals
 * are dropped — none are backed by the reviewed transfer_orders/transfer_order_lines
 * schema (no shipped/received columns, no LP join, no history table) or the
 * getTransferOrder/transitionTransferOrderStatus actions. The action's real
 * transitions map to honest Ship / Receive / Cancel buttons gated by current status.
 *
 * Status transitions call transitionTransferOrderStatus (reviewed action). RBAC is
 * enforced server-side inside it (hasPlanningWritePermission → npd.planning.write);
 * a forbidden result surfaces inline, never client-trusted. Confirm gate guards the
 * transition. Optimistic: the pending button is disabled + busy; on success the
 * route refreshes.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { ToStatusBadge } from './to-status-badge';
import { EditToModal, type EditToLabels, type EditToResult } from './edit-to-modal';
import { ToLineModal, type ToLineModalLabels, type ToLineMutationResult, type ToEditLineSeed } from './to-line-modal';
import {
  ReverseReceiptModal,
  type ReverseReceiptModalLabels,
  type ReverseReceiptTarget,
  type ReverseToReceiveLineInput,
  type ReverseToReceiveLineResult,
} from './reverse-receipt-modal';
import type { WarehouseOption, SearchTransferItemsInput } from '../_actions/to-form-data';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';

export type TransferOrderLine = {
  id: string;
  toId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  lineNo: number;
  /** R4-CL1 — the received destination LP (null until the line is received). */
  receivedDestLpId: string | null;
  receivedDestLpNumber: string | null;
  receivedQty: string | null;
  canReverse: boolean;
  reverseBlockReason: string | null;
};

export type TransferOrderDetail = {
  id: string;
  toNumber: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  status: string;
  scheduledDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: TransferOrderLine[];
};

type TransitionResult = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

export type ToDetailLabels = {
  status: Record<string, string>;
  summary: {
    title: string;
    toNumber: string;
    from: string;
    to: string;
    status: string;
    scheduled: string;
    created: string;
    updated: string;
    notes: string;
    none: string;
  };
  lines: { title: string; seq: string; product: string; qty: string; uom: string; empty: string };
  transitions: {
    title: string;
    ship: string;
    receive: string;
    cancel: string;
    confirm: string;
    pending: string;
    none: string;
  };
  errors: Record<string, string>;
  /** Wave R1 reversibility — DRAFT-only edit affordances. */
  edit: {
    editOrder: string;
    addLine: string;
    editLine: string;
    deleteLine: string;
    deleteLinePrompt: string;
    lastLineRefused: string;
    modal: EditToLabels;
    lineModal: ToLineModalLabels;
  };
  /** R4-CL1 reversibility — RECEIVED-line "reverse receipt" affordance + modal. */
  reverseReceipt: {
    received: string;
    destLp: string;
    action: string;
    permissionTooltip: string;
    notReceivableTooltip: string;
    modal: ReverseReceiptModalLabels;
  };
};

export type ToDetailViewProps = {
  locale: string;
  transferOrder: TransferOrderDetail;
  warehouses: WarehouseOption[];
  labels: ToDetailLabels;
  transitionTransferOrderStatusAction: (id: string, status: string) => Promise<TransitionResult>;
  /** Wave R1 edit seams — only used when status === 'draft'. Optional so legacy
   *  callers keep type-checking. */
  searchTransferItemsAction?: (input: SearchTransferItemsInput) => Promise<ItemPickerOption[]>;
  updateTransferOrderAction?: (input: {
    id: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    expectedDate?: string;
    notes?: string;
  }) => Promise<EditToResult>;
  addTransferOrderLineAction?: (toId: string, input: { itemId: string; quantity: string; uom: string }) => Promise<ToLineMutationResult>;
  updateTransferOrderLineAction?: (toId: string, lineId: string, input: { quantity?: string; uom?: string }) => Promise<ToLineMutationResult>;
  deleteTransferOrderLineAction?: (toId: string, lineId: string) => Promise<ToLineMutationResult>;
  /** R4-CL1 — true when the caller holds warehouse.transfer.correct (server-resolved). */
  canReverseReceipt?: boolean;
  /** R4-CL1 — reverse-received-line action (imported, never authored here). */
  reverseToReceiveLineAction?: (input: ReverseToReceiveLineInput) => Promise<ReverseToReceiveLineResult>;
};

/** Real enum transitions (mig 263), mirroring the server state machine
 *  TO_TRANSITIONS in _actions/actions.ts:
 *    draft               → in_transit | cancelled
 *    in_transit          → received   | cancelled
 *    partially_received  → received   | cancelled   (complete the receive, or cancel)
 *    received / cancelled → terminal
 *  Omitting partially_received here left it a UI dead-end (zero action buttons)
 *  even though the backend allows completing/cancelling it — restored below. */
const TRANSITIONS: Record<string, Array<{ to: string; labelKey: 'ship' | 'receive' | 'cancel'; tone: 'primary' | 'danger' }>> = {
  draft: [
    { to: 'in_transit', labelKey: 'ship', tone: 'primary' },
    { to: 'cancelled', labelKey: 'cancel', tone: 'danger' },
  ],
  in_transit: [
    { to: 'received', labelKey: 'receive', tone: 'primary' },
    { to: 'cancelled', labelKey: 'cancel', tone: 'danger' },
  ],
  partially_received: [
    { to: 'received', labelKey: 'receive', tone: 'primary' },
    { to: 'cancelled', labelKey: 'cancel', tone: 'danger' },
  ],
};

function fmt(iso: string | null, locale: string, dateOnly: boolean): string {
  if (!iso) return '—';
  const opts: Intl.DateTimeFormatOptions = dateOnly
    ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, opts).format(new Date(iso));
}

export function ToDetailView({
  locale,
  transferOrder,
  warehouses,
  labels,
  transitionTransferOrderStatusAction,
  searchTransferItemsAction,
  updateTransferOrderAction,
  addTransferOrderLineAction,
  updateTransferOrderLineAction,
  deleteTransferOrderLineAction,
  canReverseReceipt = false,
  reverseToReceiveLineAction,
}: ToDetailViewProps) {
  const router = useRouter();
  const [pendingTo, setPendingTo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Wave R1 — DRAFT edit affordances. Gated on status===draft AND the seams wired.
  const isDraft = transferOrder.status.toLowerCase() === 'draft';
  const canEdit = isDraft && !!updateTransferOrderAction;
  const [editOpen, setEditOpen] = React.useState(false);
  const [lineModalOpen, setLineModalOpen] = React.useState(false);
  const [editLine, setEditLine] = React.useState<ToEditLineSeed | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // R4-CL1 — reverse-receipt affordance. The action seam must be wired AND the
  // line must carry a received destination LP; the BUTTON is gated on
  // canReverseReceipt (disabled + tooltip if absent) — server re-checks too.
  const reverseSeamWired = !!reverseToReceiveLineAction;
  const [reverseTarget, setReverseTarget] = React.useState<ReverseReceiptTarget | null>(null);

  function openReverse(line: TransferOrderLine) {
    if (!line.canReverse || !line.receivedDestLpId || line.receivedQty == null || line.receivedDestLpNumber == null) return;
    setReverseTarget({
      toId: transferOrder.id,
      toNumber: transferOrder.toNumber,
      lineId: line.id,
      lineNo: line.lineNo,
      itemLabel: line.itemName ?? line.itemCode ?? `#${line.lineNo}`,
      destLpId: line.receivedDestLpId,
      destLpNumber: line.receivedDestLpNumber,
      quantity: line.receivedQty,
      uom: line.uom,
    });
  }

  async function onDeleteLine(line: TransferOrderLine) {
    if (!deleteTransferOrderLineAction || deletingId) return;
    if (transferOrder.lines.length <= 1) {
      setError(labels.edit.lastLineRefused);
      return;
    }
    if (!window.confirm(labels.edit.deleteLinePrompt.replace('{line}', String(line.lineNo)))) return;
    setDeletingId(line.id);
    setError(null);
    try {
      const result = await deleteTransferOrderLineAction(transferOrder.id, line.id);
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
  function openEditLine(line: TransferOrderLine) {
    setEditLine({ lineId: line.id, itemCode: line.itemCode, itemName: line.itemName, qty: line.qty, uom: line.uom });
    setLineModalOpen(true);
  }

  const warehouseNames = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const w of warehouses) map[w.id] = `${w.code} — ${w.name}`;
    return map;
  }, [warehouses]);

  function whLabel(id: string | null): string {
    if (!id) return labels.summary.none;
    return warehouseNames[id] ?? labels.summary.none;
  }
  function statusLabel(status: string): string {
    return labels.status[status.toLowerCase()] ?? status;
  }

  const actions = TRANSITIONS[transferOrder.status.toLowerCase()] ?? [];

  // R4-CL1 — a line is reverseable when it carries a received destination LP and
  // the action seam is wired. The actions column renders if draft-edit OR any line
  // is reverseable. The BUTTON is enabled only when canReverseReceipt is true.
  const hasReverseableLines =
    reverseSeamWired && transferOrder.lines.some((l) => !!l.receivedDestLpId && l.receivedQty != null);
  const showActionsColumn = canEdit || hasReverseableLines;

  async function onTransition(target: string) {
    if (pendingTo) return;
    const confirmMsg = labels.transitions.confirm
      .replace('{to}', transferOrder.toNumber)
      .replace('{status}', statusLabel(target));
    if (!window.confirm(confirmMsg)) return;
    setPendingTo(target);
    setError(null);
    try {
      const result = await transitionTransferOrderStatusAction(transferOrder.id, target);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPendingTo(null);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPendingTo(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="to-detail-view">
      {/* Header (parity: to-screens.jsx:123-149) */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-semibold text-slate-900">{transferOrder.toNumber}</span>
            <span className="text-sm text-slate-500">
              {whLabel(transferOrder.fromWarehouseId)} → {whLabel(transferOrder.toWarehouseId)}
            </span>
            <ToStatusBadge status={transferOrder.status} label={statusLabel(transferOrder.status)} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {labels.summary.scheduled}: <span className="font-mono">{fmt(transferOrder.scheduledDate, locale, true)}</span>
            {' · '}
            {transferOrder.lines.length} {labels.lines.title.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1" data-testid="to-detail-actions">
          {canEdit ? (
            <Button
              type="button"
              className="btn--secondary btn-sm"
              data-testid="to-edit-order"
              onClick={() => setEditOpen(true)}
            >
              {labels.edit.editOrder}
            </Button>
          ) : null}
          {actions.length === 0 ? (
            <span data-testid="to-detail-no-actions" className="text-xs text-slate-400">
              {labels.transitions.none}
            </span>
          ) : (
            <div className="flex gap-2">
              {actions.map((a) => (
                <Button
                  key={a.to}
                  type="button"
                  className={a.tone === 'danger' ? 'btn--ghost btn-sm' : 'btn--primary btn-sm'}
                  data-testid={`to-transition-${a.to}`}
                  disabled={pendingTo !== null}
                  aria-busy={pendingTo === a.to}
                  onClick={() => onTransition(a.to)}
                >
                  {pendingTo === a.to ? labels.transitions.pending : labels.transitions[a.labelKey]}
                </Button>
              ))}
            </div>
          )}
          {error ? (
            <div role="alert" data-testid="to-detail-error" className="text-xs text-red-600">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* TO lines (parity: to-screens.jsx:153-196) */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">
            <span>
              {labels.lines.title} · {transferOrder.lines.length}
            </span>
            {canEdit ? (
              <button
                type="button"
                data-testid="to-add-line"
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={openAddLine}
              >
                {labels.edit.addLine}
              </button>
            ) : null}
          </div>
          {transferOrder.lines.length === 0 ? (
            <p data-testid="to-detail-lines-empty" className="px-4 py-8 text-center text-sm text-slate-500">
              {labels.lines.empty}
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="to-detail-lines-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2">{labels.lines.seq}</th>
                  <th className="px-3 py-2">{labels.lines.product}</th>
                  <th className="px-3 py-2 text-right">{labels.lines.qty}</th>
                  <th className="px-3 py-2">{labels.lines.uom}</th>
                  {showActionsColumn ? <th className="px-3 py-2 text-right" /> : null}
                </tr>
              </thead>
              <tbody>
                {transferOrder.lines.map((l) => {
                  const isReceivedLine = !!l.receivedDestLpId && l.receivedQty != null;
                  const showReverseButton = isReceivedLine && reverseSeamWired;
                  const reverseDisabled = showReverseButton && (!canReverseReceipt || !l.canReverse);
                  const reverseTooltip =
                    showReverseButton && !canReverseReceipt
                      ? labels.reverseReceipt.permissionTooltip
                      : l.reverseBlockReason ?? labels.reverseReceipt?.notReceivableTooltip;
                  return (
                  <tr key={l.id} data-testid={`to-detail-line-${l.lineNo}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.lineNo}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{l.itemName ?? l.itemId.slice(0, 8)}</div>
                      <div className="font-mono text-xs text-slate-500">{l.itemCode ?? '—'}</div>
                      {isReceivedLine ? (
                        <div
                          data-testid={`to-line-received-${l.id}`}
                          className="mt-1 text-[11px] text-slate-500"
                        >
                          {labels.reverseReceipt.received} · {labels.reverseReceipt.destLp}{' '}
                          <span className="font-mono text-slate-600">{l.receivedDestLpNumber}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{l.qty}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.uom}</td>
                    {showActionsColumn ? (
                      <td className="px-3 py-2 text-right whitespace-nowrap" data-testid={`to-line-actions-${l.id}`}>
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              data-testid={`to-line-edit-${l.id}`}
                              className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                              onClick={() => openEditLine(l)}
                            >
                              {labels.edit.editLine}
                            </button>
                            <button
                              type="button"
                              data-testid={`to-line-delete-${l.id}`}
                              className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                              disabled={deletingId === l.id}
                              aria-busy={deletingId === l.id}
                              onClick={() => onDeleteLine(l)}
                            >
                              {labels.edit.deleteLine}
                            </button>
                          </>
                        ) : null}
                        {showReverseButton ? (
                          <button
                            type="button"
                            data-testid={`to-line-reverse-${l.id}`}
                            className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={reverseDisabled}
                            title={reverseDisabled ? reverseTooltip : undefined}
                            aria-disabled={reverseDisabled}
                            onClick={() => openReverse(l)}
                          >
                            {labels.reverseReceipt.action}
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* TO summary (parity: to-screens.jsx:234-248) */}
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3" data-testid="to-detail-summary">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{labels.summary.title}</h3>
          <dl className="grid gap-2 text-sm">
            <SummaryRow label={labels.summary.toNumber} value={transferOrder.toNumber} mono />
            <SummaryRow label={labels.summary.from} value={whLabel(transferOrder.fromWarehouseId)} />
            <SummaryRow label={labels.summary.to} value={whLabel(transferOrder.toWarehouseId)} />
            <SummaryRow label={labels.summary.status} value={statusLabel(transferOrder.status)} />
            <SummaryRow label={labels.summary.scheduled} value={fmt(transferOrder.scheduledDate, locale, true)} mono />
            <SummaryRow label={labels.summary.created} value={fmt(transferOrder.createdAt, locale, false)} mono />
            <SummaryRow label={labels.summary.updated} value={fmt(transferOrder.updatedAt, locale, false)} mono />
            <SummaryRow label={labels.summary.notes} value={transferOrder.notes ?? labels.summary.none} />
          </dl>
        </div>
      </div>

      {canEdit && updateTransferOrderAction ? (
        <EditToModal
          open={editOpen}
          onOpenChange={setEditOpen}
          labels={labels.edit.modal}
          warehouses={warehouses}
          initial={{
            id: transferOrder.id,
            fromWarehouseId: transferOrder.fromWarehouseId,
            toWarehouseId: transferOrder.toWarehouseId,
            expectedDate: transferOrder.scheduledDate,
            notes: transferOrder.notes,
          }}
          updateTransferOrderAction={updateTransferOrderAction}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {canEdit && searchTransferItemsAction && addTransferOrderLineAction && updateTransferOrderLineAction ? (
        <ToLineModal
          open={lineModalOpen}
          onOpenChange={setLineModalOpen}
          labels={labels.edit.lineModal}
          toId={transferOrder.id}
          editLine={editLine}
          searchTransferItemsAction={searchTransferItemsAction}
          addTransferOrderLineAction={addTransferOrderLineAction}
          updateTransferOrderLineAction={updateTransferOrderLineAction}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {reverseToReceiveLineAction ? (
        <ReverseReceiptModal
          open={reverseTarget !== null}
          target={reverseTarget}
          labels={labels.reverseReceipt.modal}
          reverseToReceiveLineAction={reverseToReceiveLineAction}
          onClose={() => setReverseTarget(null)}
          onReversed={() => {
            setReverseTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={mono ? 'text-right font-mono text-slate-800' : 'text-right text-slate-800'}>{value}</dd>
    </div>
  );
}
