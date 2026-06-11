'use client';

/**
 * WH-017 — Reservations list + release-reservation modal (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:202-295
 *     (WhReservations): info note, reserved-LP table (WO link, material line, LP
 *     link, reserved qty, LP total, status, per-row Release action) → :237-289
 *   prototypes/design/Monopilot Design System/warehouse/modals.jsx:879-924
 *     (ReleaseReservationModal): facts summary, intro, required release-reason
 *     select, admin_override reason-text + audit note, Cancel / Confirm release.
 *
 * Release flow: the Release button opens a confirm modal; reason is required;
 * Confirm calls the reviewed releaseReservation Server Action (passed in, never
 * authored). `forbidden` surfaces inline in the modal; on success the modal closes
 * and the page is refreshed (router.refresh) so the released LP drops off the
 * list. The Confirm button shows a pending/optimistic state while the action runs.
 *
 * DEVIATIONS (red-lines): the prototype's summary KPI strip, status tabs
 * (active/consumed/cancelled — the action only returns currently-reserved LPs),
 * "Create reservation"/Export buttons, and the location / reserved-at / by columns
 * are out of scope. No raw <select>: the reason picker is a shadcn Select.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { ReleaseReservationInput, ReservationRow, WarehouseResult } from '../../_actions/shared';

type ReleaseAction = (input: ReleaseReservationInput) => Promise<WarehouseResult<ReservationRow>>;

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  reserved: 'info',
  available: 'success',
  blocked: 'danger',
};

const RELEASE_REASONS = ['consumed', 'cancelled', 'wo_cancelled', 'admin_override'] as const;
type ReleaseReason = (typeof RELEASE_REASONS)[number];

export type ReservationListLabels = {
  rowsLabel: string;
  infoNote: string;
  emptyAll: string;
  release: string;
  none: string;
  status: Record<string, string>;
  col: {
    lp: string;
    item: string;
    reservedQty: string;
    lpTotal: string;
    wo: string;
    status: string;
    actions: string;
  };
  modal: {
    title: string;
    intro: string;
    facts: { lp: string; wo: string; qty: string; item: string };
    reasonLabel: string;
    reasonPlaceholder: string;
    reasons: Record<ReleaseReason, string>;
    overrideTextLabel: string;
    overrideTextPlaceholder: string;
    overrideNote: string;
    cancel: string;
    confirm: string;
    releasing: string;
    denied: string;
    notFound: string;
    errorLocked: string;
    error: string;
    success: string;
  };
};

export function ReservationListClient({
  rows,
  labels,
  locale,
  releaseAction,
}: {
  rows: ReservationRow[];
  labels: ReservationListLabels;
  locale: string;
  releaseAction: ReleaseAction;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<ReservationRow | null>(null);
  const [reason, setReason] = useState<ReleaseReason | ''>('');
  const [overrideText, setOverrideText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dash = labels.none;
  const overrideRequired = reason === 'admin_override';
  const valid = reason !== '' && (!overrideRequired || overrideText.trim().length >= 10);

  function openRelease(row: ReservationRow) {
    setTarget(row);
    setReason('');
    setOverrideText('');
    setErrorMsg(null);
  }

  function closeModal() {
    if (isPending) return;
    setTarget(null);
  }

  function confirmRelease() {
    if (!target || !valid) return;
    const finalReason = overrideRequired ? `admin_override: ${overrideText.trim()}` : reason;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await releaseAction({ lpId: target.lpId, reason: finalReason });
      if (res.ok) {
        setTarget(null);
        router.refresh();
        return;
      }
      // forbidden / not_found / error surface INLINE in the modal — never trusted client-side.
      if (res.reason === 'forbidden') setErrorMsg(labels.modal.denied);
      else if (res.reason === 'not_found') setErrorMsg(labels.modal.notFound);
      else if (res.message === 'locked') setErrorMsg(labels.modal.errorLocked);
      else setErrorMsg(labels.modal.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info note (parity movement-screens.jsx:237-242). */}
      <div
        data-testid="reservation-info"
        className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
      >
        <span aria-hidden="true">ⓘ</span>
        <span>{labels.infoNote}</span>
      </div>

      <div className="flex items-center">
        <span className="ml-auto text-xs text-slate-500" data-testid="reservation-rows">
          {labels.rowsLabel.replace('{count}', String(rows.length))}
        </span>
      </div>

      <Card
        data-testid="reservation-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="reservation-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : (
          <Table aria-label={labels.col.lp}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.col.lp}</TableHead>
                <TableHead scope="col">{labels.col.item}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.reservedQty}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.lpTotal}</TableHead>
                <TableHead scope="col">{labels.col.wo}</TableHead>
                <TableHead scope="col">{labels.col.status}</TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{labels.release}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.lpId} data-testid={`reservation-row-${r.lpId}`}>
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    <Link
                      href={`/${locale}/warehouse/license-plates/${r.lpId}`}
                      data-testid={`reservation-lp-link-${r.lpId}`}
                      className="hover:underline"
                    >
                      {r.lpNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-900">{r.itemName ?? dash}</span>
                      {r.itemCode ? (
                        <span className="font-mono text-[11px] text-slate-500">{r.itemCode}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.reservedQty} {r.uom}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-slate-500">
                    {r.quantity} {r.uom}
                  </TableCell>
                  <TableCell>
                    {r.reservedForWoId ? (
                      <Link
                        href={`/${locale}/planning/work-orders/${r.reservedForWoId}`}
                        data-testid={`reservation-wo-link-${r.lpId}`}
                        className="font-mono text-sm font-semibold text-sky-700 hover:underline"
                      >
                        {r.woNumber ?? r.reservedForWoId}
                      </Link>
                    ) : (
                      <span className="text-slate-400">{dash}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`reservation-status-${r.lpId}`}>
                      {labels.status[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      data-testid={`reservation-release-${r.lpId}`}
                      onClick={() => openRelease(r)}
                      className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                    >
                      {labels.release}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Release-reservation confirm modal (parity modals.jsx:879-924). */}
      <Modal open={target !== null} onOpenChange={(o) => (!o ? closeModal() : undefined)} modalId="releaseReservation" size="md">
        <Modal.Header title={labels.modal.title} />
        <Modal.Body>
          {target ? (
            <div data-testid="reservation-release-modal" className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">{labels.modal.facts.lp}</dt>
                <dd className="font-mono text-slate-900">{target.lpNumber}</dd>
                <dt className="text-slate-500">{labels.modal.facts.wo}</dt>
                <dd className="font-mono text-slate-900">{target.woNumber ?? dash}</dd>
                <dt className="text-slate-500">{labels.modal.facts.qty}</dt>
                <dd className="font-mono font-semibold text-slate-900">
                  {target.reservedQty} {target.uom}
                </dd>
                <dt className="text-slate-500">{labels.modal.facts.item}</dt>
                <dd className="text-slate-900">{target.itemName ?? target.itemCode ?? dash}</dd>
              </dl>

              <p className="text-sm text-slate-600">{labels.modal.intro}</p>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  {labels.modal.reasonLabel} <span className="text-red-600">*</span>
                </span>
                <Select
                  aria-label={labels.modal.reasonLabel}
                  value={reason}
                  onValueChange={(v) => setReason(v as ReleaseReason)}
                  options={[
                    { value: '', label: labels.modal.reasonPlaceholder },
                    ...RELEASE_REASONS.map((rc) => ({ value: rc, label: labels.modal.reasons[rc] })),
                  ]}
                />
              </label>

              {overrideRequired ? (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">
                      {labels.modal.overrideTextLabel} <span className="text-red-600">*</span>
                    </span>
                    <textarea
                      data-testid="reservation-override-text"
                      value={overrideText}
                      onChange={(e) => setOverrideText(e.target.value)}
                      placeholder={labels.modal.overrideTextPlaceholder}
                      rows={3}
                      minLength={10}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span aria-hidden="true">⚠</span>
                    <span>{labels.modal.overrideNote}</span>
                  </div>
                </>
              ) : null}

              {errorMsg ? (
                <div
                  role="alert"
                  data-testid="reservation-release-error"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {errorMsg}
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="reservation-release-cancel"
            onClick={closeModal}
            disabled={isPending}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.modal.cancel}
          </button>
          <button
            type="button"
            data-testid="reservation-release-confirm"
            onClick={confirmRelease}
            disabled={!valid || isPending}
            aria-busy={isPending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? labels.modal.releasing : labels.modal.confirm}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
