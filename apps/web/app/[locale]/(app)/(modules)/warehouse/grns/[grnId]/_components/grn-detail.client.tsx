'use client';

/**
 * WH-010 — GRN detail (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   grn-screens.jsx:96-171 (WhGRNDetail):
 *     header facts strip (source, supplier, receipt date, location, received by) → grn-screens.jsx:113-119
 *     optional notes card                                                        → grn-screens.jsx:121-125
 *     receipt-lines table (line, product code+name, LP created link, ordered/
 *       received qty+uom, batch, supplier batch, expiry, location, QA)           → grn-screens.jsx:131-149
 *
 * The "LP created" cell links to /warehouse/license-plates/<lpId> only when the
 * line has a resolved lp_id (the action sets lpId/lpNumber from the created LP);
 * otherwise it renders an em-dash. No data fetching, no permission logic.
 *
 * DEVIATIONS (red-lines): the prototype's status-history timeline + Export +
 * "View all LPs" button are out of scope for this read surface. Supplier-batch is
 * carried on grn_items only when the action surfaces it; the action exposes
 * batch/expiry/lp but NOT supplier-batch / QA / catch-weight per line, so those
 * columns render an em-dash rather than fabricated data.
 *
 * E1 (label print): each received line gets a [Print labels] button calling the
 * printers `printLabel` Server Action. The backend `printLabel` ONLY accepts
 * `entityType:'lp'` (it hard-rejects all other entity types) and the locked task
 * forbids touching it, so we print the LP the line CREATED — entityType:'lp',
 * entityId = line.lpId, copies = received qty (whole, ≥1). Gated on the same
 * permission the printers actions enforce (settings.org.update, re-checked
 * server-side); disabled with a tooltip when the caller lacks it OR the line has
 * no LP yet. Result/download mirrors the B4 LP-detail pattern.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, toCsv } from '../../../../../../../../lib/shared/download';
import type { ReleaseLpQaInput, ReleaseLpQaResult } from '../../../_actions/lp-qa-actions';
import type { GrnDetail } from '../../../_actions/shared';
import type { WarehouseResult } from '../../../_actions/shared';
import {
  GrnLineCancelModal,
  type GrnLineCancelLabels,
  type CancelGrnLineInput,
  type CancelGrnLineResult,
} from './grn-line-cancel-modal.client';
import {
  GrnTempCheck,
  type GrnTempCheckLabels,
  type SubmitTempCheckInput,
  type SubmitTempCheckResult,
} from './grn-temp-check.client';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'warning',
  completed: 'success',
  cancelled: 'muted',
  in_progress: 'info',
};

export type GrnDetailLabels = {
  notesLabel: string;
  itemsTitle: string;
  emptyItems: string;
  facts: {
    source: string;
    supplier: string;
    receiptDate: string;
    warehouse: string;
    status: string;
    none: string;
  };
  status: Record<string, string>;
  col: {
    line: string;
    item: string;
    ordered: string;
    received: string;
    outstanding: string;
    batch: string;
    supplierBatch: string;
    expiry: string;
    location: string;
    qa: string;
    lp: string;
    action: string;
  };
  qaRelease: {
    action: string;
    released: string;
    rejected: string;
    note: string;
    denied: string;
    invalidState: string;
    error: string;
  };
  /** E1 — per-line label print copy (reuses the B4 print-labels namespace). */
  printLabel: {
    action: string;
    printing: string;
    queued: string;
    sent: string;
    download: string;
    error: string;
    forbidden: string;
    noLp: string;
  };
  /** C4e — printable GRN document (browser print / Save as PDF). */
  printDocument: {
    action: string;
    hint: string;
  };
  /** C-R3 — cancel-receipt-line modal + cancelled-line display copy. */
  cancelLine: GrnLineCancelLabels & {
    /** Row affordance label ("Cancel receipt…"). */
    rowAction: string;
    /** Struck-through cancelled-line badge (defensive `cancelled` flag). */
    cancelledBadge: string;
  };
  /** E2B — per-line delivery-condition (cold-chain) temperature control copy. */
  tempCheck: GrnTempCheckLabels;
  receiveRemaining?: string;
  receiptProgress?: string;
  overReceivedBadge?: string;
  shortReceivedBadge?: string;
};

/**
 * E1 — minimal view of the printers `printLabel` PrintJobRow the GRN line needs.
 * The Server Action returns the full row; the client reads only status/result_url.
 */
export type GrnPrintLabelResult = { status: 'queued' | 'sent' | 'failed'; result_url: string | null };
export type GrnPrintLabelInput = { entityType: 'lp'; entityId: string; copies?: number };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}

/** Received qty → a positive whole copy count for the label print (≥1). */
function copiesFromReceived(received: string): number {
  const n = Math.floor(Number(received));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function CsvExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path
        d="M10 3v8m0 0 3-3m-3 3L7 8m-3 5.5V15a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function receiptLineState(ordered: string | null, received: string): 'none' | 'partial' | 'full' | 'over' | 'short' {
  if (ordered == null) return 'none';
  const o = Number(ordered);
  const r = Number(received);
  if (!(r > 0)) return 'none';
  if (r > o) return 'over';
  if (r >= o) return 'full';
  return 'partial';
}

function outstandingQty(ordered: string | null, received: string): string | null {
  if (ordered == null) return null;
  const rem = Number(ordered) - Number(received);
  return String(Number(rem.toFixed(3)));
}

export function GrnDetailClient({
  grn,
  labels,
  locale,
  printDocumentHref,
  releaseQaAction,
  cancelGrnLineAction,
  canCancelLines = false,
  printLabelAction,
  canPrint = false,
  submitConditionCheck,
  canRecordTemp = false,
}: {
  grn: GrnDetail;
  labels: GrnDetailLabels;
  locale: string;
  /** C4e — href to the printable GRN HTML view (warehouse read permission). */
  printDocumentHref: string;
  releaseQaAction: (input: ReleaseLpQaInput) => Promise<WarehouseResult<ReleaseLpQaResult>>;
  /**
   * C-R3 — cancel a single receipt line. OWNED by the warehouse corrections lane
   * (warehouse/_actions/receipt-corrections-actions.ts) and threaded in by the
   * page via an import-only adapter seam; never imported here directly. RBAC +
   * LP-cancellability are re-checked server-side — the affordance here only hides
   * already-cancelled lines + opens the reason/note modal.
   */
  cancelGrnLineAction: (input: CancelGrnLineInput) => Promise<CancelGrnLineResult>;
  /** Server-resolved: when false the cancel affordances are hidden entirely. */
  canCancelLines?: boolean;
  /**
   * E1 — print a label for the LP a received line created. OWNED by the printers
   * settings actions (settings/infra/printers/_actions/printers.ts → printLabel)
   * and threaded in by the page via an import-only adapter seam; never imported
   * here directly. RBAC (settings.org.update) is re-enforced server-side —
   * `canPrint` only governs the disabled affordance.
   */
  printLabelAction: (input: GrnPrintLabelInput) => Promise<GrnPrintLabelResult>;
  /** Server-resolved settings.org.update; false ⇒ print buttons disabled + tooltip. */
  canPrint?: boolean;
  /**
   * E2B — record a delivery-condition temperature for a received line/LP. OWNED by
   * the cold-chain backend lane (quality/_actions/cold-chain-actions.ts →
   * submitConditionCheck) and threaded in by the page via an import-only adapter
   * seam; never imported here directly. RBAC (quality.coldchain.record) is
   * re-enforced server-side — `canRecordTemp` only governs the disabled affordance.
   */
  submitConditionCheck: (input: SubmitTempCheckInput) => Promise<SubmitTempCheckResult>;
  /** Server-resolved quality.coldchain.record; false ⇒ temp control disabled + tooltip. */
  canRecordTemp?: boolean;
}) {
  const dash = labels.facts.none;
  const router = useRouter();
  const [busyLpId, setBusyLpId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ lpId: string; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ grnItemId: string; lineLabel: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  // E1 — per-line label-print state (keyed by grn_item id).
  const [printBusyItemId, setPrintBusyItemId] = useState<string | null>(null);
  const [printResult, setPrintResult] = useState<{ itemId: string; result: GrnPrintLabelResult } | null>(null);
  const [printError, setPrintError] = useState<{ itemId: string; message: string } | null>(null);

  function handleExportCsv() {
    const header = [
      labels.col.line,
      labels.col.item,
      labels.col.ordered,
      labels.col.received,
      labels.col.batch,
      labels.col.supplierBatch,
      labels.col.expiry,
      labels.col.lp,
      labels.col.qa,
    ];
    const rows = grn.items.map((it) => [
      it.lineNumber,
      [it.itemName ?? dash, it.itemCode ?? ''].filter(Boolean).join(' '),
      it.orderedQty == null ? dash : `${it.orderedQty} ${it.uom}`,
      `${it.receivedQty} ${it.uom}`,
      it.batchNumber ?? dash,
      dash,
      it.expiryDate ? it.expiryDate.slice(0, 10) : dash,
      it.lpNumber ?? dash,
      it.lpQaStatus ?? dash,
    ]);
    downloadCsv(toCsv(header, rows), `warehouse-grn-${grn.grnNumber}.csv`);
  }

  async function printRow(itemId: string, lpId: string, received: string) {
    if (!canPrint || printBusyItemId !== null) return;
    setPrintBusyItemId(itemId);
    setPrintError(null);
    setPrintResult(null);
    try {
      const result = await printLabelAction({
        entityType: 'lp',
        entityId: lpId,
        copies: copiesFromReceived(received),
      });
      setPrintResult({ itemId, result });
    } catch (error) {
      console.error('Failed to print GRN line label', error);
      setPrintError({ itemId, message: labels.printLabel.error });
    } finally {
      setPrintBusyItemId(null);
    }
  }

  function releaseRow(lpId: string) {
    setBusyLpId(lpId);
    setRowError(null);
    startTransition(async () => {
      const result = await releaseQaAction({ lpId, decision: 'released', note: labels.qaRelease.note });
      if (result.ok) {
        setBusyLpId(null);
        router.refresh();
        return;
      }
      const failure = result as Extract<WarehouseResult<ReleaseLpQaResult>, { ok: false }>;
      const message =
        failure.reason === 'forbidden'
          ? labels.qaRelease.denied
          : failure.message === 'invalid_state'
            ? labels.qaRelease.invalidState
            : labels.qaRelease.error;
      setBusyLpId(null);
      setRowError({ lpId, message });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header facts strip (parity grn-screens.jsx:113-119). */}
      <Card
        data-testid="grn-detail-facts"
        className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        <Fact label={labels.facts.source}>
          {grn.sourceType.toUpperCase()}
        </Fact>
        <Fact label={labels.facts.supplier}>{grn.supplierName ?? dash}</Fact>
        <Fact label={labels.facts.receiptDate}>
          <span className="font-mono text-xs">{grn.receiptDate ? grn.receiptDate.slice(0, 10) : dash}</span>
        </Fact>
        <Fact label={labels.facts.warehouse}>
          <span className="font-mono text-xs">{grn.warehouseCode ?? dash}</span>
        </Fact>
        <Fact label={labels.facts.status}>
          <Badge variant={STATUS_VARIANT[grn.status] ?? 'muted'} data-testid="grn-detail-status">
            {labels.status[grn.status] ?? grn.status}
          </Badge>
        </Fact>
      </Card>

      {/* Optional notes card (parity grn-screens.jsx:121-125). */}
      {grn.notes ? (
        <Card
          data-testid="grn-detail-notes"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          <b className="text-slate-900">{labels.notesLabel}:</b> {grn.notes}
        </Card>
      ) : null}

      {grn.poId && grn.status === 'draft' && labels.receiveRemaining ? (
        <div className="flex justify-end">
          <Link
            href={`/${locale}/warehouse/receive-po/${grn.poId}`}
            data-testid="grn-receive-remaining"
            className="inline-flex items-center rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100"
          >
            {labels.receiveRemaining}
          </Link>
        </div>
      ) : null}

      {/* Receipt-lines table (parity grn-screens.jsx:127-150). */}
      <Card
        data-testid="grn-detail-items-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {labels.itemsTitle.replace('{count}', String(grn.items.length))}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={printDocumentHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="grn-print-document-link"
              title={labels.printDocument.hint}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {labels.printDocument.action}
            </Link>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CsvExportIcon />
              Export CSV
            </button>
          </div>
        </div>
        {grn.items.length === 0 ? (
          <p data-testid="grn-detail-items-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyItems}
          </p>
        ) : (
          <Table aria-label={labels.itemsTitle.replace('{count}', String(grn.items.length))}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.col.line}</TableHead>
                <TableHead scope="col">{labels.col.item}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.ordered}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.received}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.outstanding}</TableHead>
                <TableHead scope="col">{labels.col.batch}</TableHead>
                <TableHead scope="col">{labels.col.supplierBatch}</TableHead>
                <TableHead scope="col">{labels.col.expiry}</TableHead>
                <TableHead scope="col">{labels.col.lp}</TableHead>
                <TableHead scope="col">{labels.col.qa}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.action}</TableHead>
                {canCancelLines ? (
                  <TableHead scope="col" className="text-right">
                    <span className="sr-only">{labels.cancelLine.rowAction}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grn.items.map((it) => {
                // R3 F6 — getGrnDetail now exposes the typed per-line `cancelled`
                // flag (mig-298 cancelled_at). Cancelled lines are struck/badged
                // and BOTH the Release-QC and Cancel affordances are hidden.
                const isCancelled = it.cancelled === true;
                const cancelBlockedMessage =
                  it.cancelBlockReason === 'already_cancelled'
                    ? labels.cancelLine.errors.already_cancelled
                    : labels.cancelLine.errors.lp_not_cancellable;
                return (
                <TableRow
                  key={it.id}
                  data-testid={`grn-item-${it.id}`}
                  data-cancelled={isCancelled ? 'true' : undefined}
                  className={isCancelled ? 'text-slate-400' : undefined}
                >
                  <TableCell className="font-mono text-xs text-slate-600">{it.lineNumber}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      <span className={`text-sm text-slate-900${isCancelled ? ' line-through' : ''}`}>{it.itemName ?? dash}</span>
                      {it.itemCode ? (
                        <span className="font-mono text-[11px] text-slate-500">{it.itemCode}</span>
                      ) : null}
                      {isCancelled ? (
                        <Badge variant="danger" className="mt-0.5 w-fit text-[10px]" data-testid={`grn-item-cancelled-${it.id}`}>
                          {labels.cancelLine.cancelledBadge}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                    {it.orderedQty == null ? dash : `${it.orderedQty} ${it.uom}`}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {it.receivedQty} {it.uom}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                    <div className="flex flex-col items-end gap-0.5">
                      <span>
                        {it.orderedQty == null ? dash : `${outstandingQty(it.orderedQty, it.receivedQty) ?? dash} ${it.uom}`}
                      </span>
                      {(() => {
                        const state = receiptLineState(it.orderedQty, it.receivedQty);
                        if (state === 'over' && labels.overReceivedBadge) {
                          return (
                            <Badge variant="danger" className="text-[10px]" data-testid={`grn-line-over-${it.id}`}>
                              {labels.overReceivedBadge}
                            </Badge>
                          );
                        }
                        if (state === 'partial' && grn.status === 'completed' && labels.shortReceivedBadge) {
                          return (
                            <Badge variant="warning" className="text-[10px]" data-testid={`grn-line-short-${it.id}`}>
                              {labels.shortReceivedBadge}
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-600">
                    {it.batchNumber ?? dash}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-500">{it.batchNumber ?? dash}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {it.expiryDate ? it.expiryDate.slice(0, 10) : dash}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    {it.lpId ? (
                      <Link
                        href={`/${locale}/warehouse/license-plates/${it.lpId}`}
                        data-testid={`grn-item-lp-link-${it.id}`}
                        className="hover:underline"
                      >
                        {it.lpNumber ?? dash}
                      </Link>
                    ) : (
                      <span className="text-slate-400">{dash}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={it.lpQaStatus === 'pending' ? 'warning' : it.lpQaStatus === 'released' ? 'success' : 'muted'} className="text-[10px]">
                      {it.lpQaStatus ?? dash}
                    </Badge>
                    {rowError?.lpId === it.lpId ? (
                      <p role="alert" data-testid={`grn-release-qc-error-${it.id}`} className="mt-1 text-[11px] text-red-700">
                        {rowError.message}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      // Release-QC for pending LPs; Print labels for any LP a
                      // non-cancelled line created. When neither applies, an em-dash.
                      const showRelease = Boolean(it.lpId) && it.lpQaStatus === 'pending' && !isCancelled;
                      const showPrint = Boolean(it.lpId) && !isCancelled;
                      return (
                    <div className="flex flex-col items-end gap-1">
                      {showRelease ? (
                        <button
                          type="button"
                          data-testid={`grn-release-qc-${it.id}`}
                          disabled={isPending && busyLpId === it.lpId}
                          onClick={() => releaseRow(it.lpId!)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {labels.qaRelease.action}
                        </button>
                      ) : null}
                      {/* E1 — Print labels for the LP this line created. Hidden when
                          the line never created an LP or the line is cancelled. */}
                      {showPrint ? (
                        <>
                          <button
                            type="button"
                            data-testid={`grn-print-label-${it.id}`}
                            disabled={!canPrint || printBusyItemId === it.id}
                            title={canPrint ? undefined : labels.printLabel.forbidden}
                            aria-label={
                              canPrint
                                ? labels.printLabel.action
                                : `${labels.printLabel.action} — ${labels.printLabel.forbidden}`
                            }
                            onClick={() => void printRow(it.id, it.lpId!, it.receivedQty)}
                            className={
                              canPrint
                                ? 'rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                                : 'cursor-not-allowed rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400'
                            }
                          >
                            {printBusyItemId === it.id ? labels.printLabel.printing : labels.printLabel.action}
                          </button>
                          {printResult?.itemId === it.id ? (
                            <div
                              role="status"
                              data-testid={`grn-print-label-result-${it.id}`}
                              data-print-status={printResult.result.status}
                              className="flex flex-col items-end gap-0.5 text-[11px] text-emerald-700"
                            >
                              <span>
                                {printResult.result.status === 'sent'
                                  ? labels.printLabel.sent
                                  : labels.printLabel.queued}
                              </span>
                              {printResult.result.result_url ? (
                                <a
                                  href={printResult.result.result_url}
                                  download
                                  data-testid={`grn-print-label-download-${it.id}`}
                                  className="text-sky-700 underline"
                                >
                                  {labels.printLabel.download}
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                          {printError?.itemId === it.id ? (
                            <p
                              role="alert"
                              data-testid={`grn-print-label-error-${it.id}`}
                              className="text-[11px] text-red-700"
                            >
                              {printError.message}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      {/* E2B — delivery-condition (cold-chain) temperature.
                          Available on every non-cancelled received line; gated on
                          quality.coldchain.record (re-checked server-side). */}
                      {!isCancelled ? (
                        <GrnTempCheck
                          itemId={it.productId}
                          grnItemId={it.id}
                          lpId={it.lpId}
                          labels={labels.tempCheck}
                          canRecord={canRecordTemp}
                          submitConditionCheck={submitConditionCheck}
                          onRecorded={() => router.refresh()}
                        />
                      ) : null}
                      {!showRelease && !showPrint && isCancelled ? (
                        <span className="text-slate-400">{dash}</span>
                      ) : null}
                    </div>
                      );
                    })()}
                  </TableCell>
                  {canCancelLines ? (
                    <TableCell className="text-right">
                      {!isCancelled ? (
                        <button
                          type="button"
                          data-testid={`grn-cancel-line-${it.id}`}
                          disabled={!it.canCancel}
                          title={it.canCancel ? undefined : cancelBlockedMessage}
                          aria-label={
                            it.canCancel
                              ? labels.cancelLine.rowAction
                              : `${labels.cancelLine.rowAction} — ${cancelBlockedMessage}`
                          }
                          onClick={() => {
                            if (!it.canCancel) return;
                            setCancelTarget({ grnItemId: it.id, lineLabel: String(it.lineNumber) });
                          }}
                          className={
                            it.canCancel
                              ? 'rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50'
                              : 'cursor-not-allowed rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400'
                          }
                        >
                          {labels.cancelLine.rowAction}
                        </button>
                      ) : (
                        <span className="text-slate-400">{dash}</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* C-R3 — cancel-receipt-line modal (reason + note, no e-sign). Mounted only
          while a line is selected. */}
      {canCancelLines && cancelTarget !== null ? (
        <GrnLineCancelModal
          open
          target={cancelTarget}
          labels={labels.cancelLine}
          sessionExpiredLoginHref={`/${locale}/login?reason=idle`}
          cancelGrnLineAction={cancelGrnLineAction}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
