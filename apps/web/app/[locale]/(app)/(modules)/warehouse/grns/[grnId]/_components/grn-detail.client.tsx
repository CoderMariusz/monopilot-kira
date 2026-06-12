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
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { ReleaseLpQaInput, ReleaseLpQaResult } from '../../../_actions/lp-qa-actions';
import type { GrnDetail } from '../../../_actions/shared';
import type { WarehouseResult } from '../../../_actions/shared';
import {
  GrnLineCancelModal,
  type GrnLineCancelLabels,
  type CancelGrnLineInput,
  type CancelGrnLineResult,
} from './grn-line-cancel-modal.client';

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
  /** C-R3 — cancel-receipt-line modal + cancelled-line display copy. */
  cancelLine: GrnLineCancelLabels & {
    /** Row affordance label ("Cancel receipt…"). */
    rowAction: string;
    /** Struck-through cancelled-line badge (defensive `cancelled` flag). */
    cancelledBadge: string;
  };
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}

export function GrnDetailClient({
  grn,
  labels,
  locale,
  releaseQaAction,
  cancelGrnLineAction,
  canCancelLines = false,
}: {
  grn: GrnDetail;
  labels: GrnDetailLabels;
  locale: string;
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
}) {
  const dash = labels.facts.none;
  const router = useRouter();
  const [busyLpId, setBusyLpId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ lpId: string; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ grnItemId: string; lineLabel: string } | null>(null);
  const [isPending, startTransition] = useTransition();

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

      {/* Receipt-lines table (parity grn-screens.jsx:127-150). */}
      <Card
        data-testid="grn-detail-items-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {labels.itemsTitle.replace('{count}', String(grn.items.length))}
          </h2>
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
                  <TableCell className="font-mono text-[11px] text-slate-600">
                    {it.batchNumber ?? dash}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-500">{dash}</TableCell>
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
                        {it.lpNumber ?? it.lpId}
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
                    {it.lpId && it.lpQaStatus === 'pending' && !isCancelled ? (
                      <button
                        type="button"
                        data-testid={`grn-release-qc-${it.id}`}
                        disabled={isPending && busyLpId === it.lpId}
                        onClick={() => releaseRow(it.lpId!)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {labels.qaRelease.action}
                      </button>
                    ) : (
                      <span className="text-slate-400">{dash}</span>
                    )}
                  </TableCell>
                  {canCancelLines ? (
                    <TableCell className="text-right">
                      {!isCancelled ? (
                        <button
                          type="button"
                          data-testid={`grn-cancel-line-${it.id}`}
                          onClick={() =>
                            setCancelTarget({ grnItemId: it.id, lineLabel: String(it.lineNumber) })
                          }
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
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
