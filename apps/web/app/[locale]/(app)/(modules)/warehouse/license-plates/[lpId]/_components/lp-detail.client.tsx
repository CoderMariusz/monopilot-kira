'use client';

/**
 * WH-003 — License-plate detail, 7-tab (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   lp-screens.jsx:216-571 (lp_detail):
 *     page head + expiry banner + identity card + action buttons → lp-screens.jsx:230-321
 *     7 tabs                                                      → lp-screens.jsx:220-228,325-331
 *       overview (identity snapshot / ext)                       → lp-screens.jsx:333-375
 *       movements (stock_moves)                                  → lp-screens.jsx:377-398
 *       genealogy (parent / children refs)                       → lp-screens.jsx:400-450
 *       reservations                                             → lp-screens.jsx:452-480
 *       state history (lp_state_history)                         → lp-screens.jsx:482-513
 *       labels                                                   → lp-screens.jsx:515-539
 *       audit / raw                                              → lp-screens.jsx:541-564
 *
 * Presentational only: receives the already-loaded, org-scoped detail view-model
 * + resolved i18n labels from the RSC page and owns ONLY the active-tab state.
 *
 * DEVIATIONS (red-lines):
 *   - Action buttons (split / merge / QA / reserve / block / destroy —
 *     lp-screens.jsx:310-317) render DISABLED with title "Coming soon"; their
 *     modals are a later lane and we do NOT fake working mutations.
 *   - AUDIT DEFECT #5: the "move" action is now LIVE for movable LPs (not
 *     consumed / merged / shipped / returned): it opens the LP MOVE modal which
 *     wires the existing createStockMove action. For terminal LPs it stays
 *     disabled with "Coming soon" parity styling.
 *   - Labels tab: print history is DEFERRED (the actions backend exposes no print
 *     log); the tab shows the deferred note + a disabled "Print label" affordance.
 *   - The prototype "audit" tab is realized as a "raw" tab (pretty ext_jsonb) per
 *     the task brief — the audit-log table has no backing read in this lane.
 *   - Reservations: the detail action exposes a single reserved-for-WO fact
 *     (reservedForWoNumber / reservedQty), not a reservation array — rendered as a
 *     one-row reservation summary; empty when nothing is reserved.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import Textarea from '@monopilot/ui/Textarea';

import type { ReleaseLpQaDecision, ReleaseLpQaInput, ReleaseLpQaResult } from '../../../_actions/lp-qa-actions';
import type { LicensePlateDetail } from '../../../_actions/shared';
import type { WarehouseResult } from '../../../_actions/shared';
import type { createStockMove } from '../../../_actions/stock-move-actions';
import type { listLocations } from '../../../_actions/location-read-actions';
import { LpMoveModal, type LpMoveLabels } from './lp-move-modal.client';

/** LP statuses for which the "move" action is NOT allowed (terminal lifecycle). */
const IMMOVABLE_STATUSES = new Set(['consumed', 'merged', 'shipped', 'returned', 'destroyed']);

export type LpDetailTab =
  | 'overview'
  | 'history'
  | 'reservations'
  | 'movements'
  | 'genealogy'
  | 'labels'
  | 'raw';

export const LP_DETAIL_TABS: LpDetailTab[] = [
  'overview',
  'history',
  'reservations',
  'movements',
  'genealogy',
  'labels',
  'raw',
];

/** Action keys from the prototype's action group — all deferred (disabled). */
export const LP_DEFERRED_ACTIONS = [
  'split',
  'merge',
  'qa',
  'reserve',
  'move',
  'block',
  'destroy',
] as const;
export type LpDeferredAction = (typeof LP_DEFERRED_ACTIONS)[number];

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'info',
  blocked: 'danger',
  consumed: 'muted',
  shipped: 'secondary',
  merged: 'muted',
};

function qaVariant(qa: string): BadgeVariant {
  const up = qa.toUpperCase();
  if (up === 'PASSED' || up === 'RELEASED') return 'success';
  if (up === 'FAILED' || up === 'QUARANTINED') return 'danger';
  if (up === 'HOLD' || up === 'PENDING') return 'warning';
  return 'muted';
}

export type LpDetailLabels = {
  back: string;
  qtyLine: string;
  statusLabel: Record<string, string>;
  identity: {
    title: string;
    product: string;
    itemType: string;
    quantity: string;
    reserved: string;
    available: string;
    batch: string;
    supplierBatch: string;
    expiry: string;
    bestBefore: string;
    catchWeight: string;
    location: string;
    warehouse: string;
    source: string;
    parentLp: string;
    none: string;
  };
  actions: {
    comingSoon: string;
    labelByKey: Record<LpDeferredAction, string>;
    qaRelease: {
      title: string;
      decision: string;
      released: string;
      rejected: string;
      note: string;
      notePlaceholder: string;
      cancel: string;
      confirm: string;
      unavailable: string;
      denied: string;
      invalidState: string;
      error: string;
    };
  };
  move: LpMoveLabels;
  ruleNote: string;
  tab: Record<LpDetailTab, string>;
  overview: { title: string };
  history: {
    empty: string;
    by: string;
    reason: string;
    from: string;
    to: string;
    at: string;
    reasonCol: string;
  };
  reservations: {
    empty: string;
    wo: string;
    reservedQty: string;
    available: string;
    note: string;
  };
  movements: {
    empty: string;
    timestamp: string;
    type: string;
    from: string;
    to: string;
    qty: string;
    reason: string;
    reference: string;
  };
  genealogy: {
    parentTitle: string;
    childrenTitle: string;
    noParent: string;
    noChildren: string;
    status: string;
    qty: string;
  };
  labels: { deferred: string; printAction: string };
  raw: { title: string; empty: string };
  expiryBanner: string;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function IdentityRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}

export function LpDetailClient({
  detail,
  labels,
  locale,
  releaseQaAction,
  listLocationsAction,
  createStockMoveAction,
}: {
  detail: LicensePlateDetail;
  labels: LpDetailLabels;
  locale: string;
  releaseQaAction: (input: ReleaseLpQaInput) => Promise<WarehouseResult<ReleaseLpQaResult>>;
  listLocationsAction: typeof listLocations;
  createStockMoveAction: typeof createStockMove;
}) {
  const [tab, setTab] = useState<LpDetailTab>('overview');
  const [qaModalOpen, setQaModalOpen] = useState(false);
  const [qaDecision, setQaDecision] = useState<ReleaseLpQaDecision>('released');
  const [qaNote, setQaNote] = useState('');
  const [qaError, setQaError] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const lpHref = (id: string) => `/${locale}/warehouse/license-plates/${id}`;
  const hasReservation = Boolean(detail.reservedForWoId) && Number(detail.reservedQty) > 0;
  const canReleaseQa = detail.qaStatus.toLowerCase() === 'pending';
  // AUDIT #5: "move" is live unless the LP is in a terminal lifecycle state.
  const canMove = !IMMOVABLE_STATUSES.has(detail.status.toLowerCase());

  function closeQaModal() {
    if (isPending) return;
    setQaModalOpen(false);
    setQaDecision('released');
    setQaNote('');
    setQaError(null);
  }

  function submitQaRelease() {
    setQaError(null);
    startTransition(async () => {
      const result = await releaseQaAction({ lpId: detail.id, decision: qaDecision, note: qaNote });
      if (result.ok) {
        setQaModalOpen(false);
        setQaDecision('released');
        setQaNote('');
        setQaError(null);
        router.refresh();
        return;
      }
      const failure = result as Extract<WarehouseResult<ReleaseLpQaResult>, { ok: false }>;
      const message =
        failure.reason === 'forbidden'
          ? labels.actions.qaRelease.denied
          : failure.message === 'invalid_state'
            ? labels.actions.qaRelease.invalidState
            : labels.actions.qaRelease.error;
      setQaError(message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header (parity lp-screens.jsx:230-242). */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/${locale}/warehouse/license-plates`}
            data-testid="lp-detail-back"
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            ← {labels.back}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-2 text-2xl font-semibold tracking-tight text-slate-950">
            <span className="font-mono">{detail.lpNumber}</span>
            <span className="text-base font-normal text-slate-500">{detail.itemName ?? detail.itemCode ?? ''}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500" data-testid="lp-detail-subline">
            {labels.qtyLine
              .replace('{qty}', detail.quantity)
              .replace('{uom}', detail.uom)
              .replace('{batch}', detail.batchNumber ?? labels.identity.none)
              .replace('{expiry}', detail.expiryDate ? detail.expiryDate.slice(0, 10) : labels.identity.none)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATUS_VARIANT[detail.status] ?? 'muted'} data-testid="lp-detail-status">
            {labels.statusLabel[detail.status] ?? detail.status}
          </Badge>
          <Badge variant={qaVariant(detail.qaStatus)} data-testid="lp-detail-qa">
            {detail.qaStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Identity card + action group (parity lp-screens.jsx:253-321). */}
        <Card className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">{labels.identity.title}</h2>
          <IdentityRow label={labels.identity.product}>
            <span className="font-mono">{detail.itemCode ?? '—'}</span>
            {detail.itemName ? <span className="text-slate-600"> — {detail.itemName}</span> : null}
          </IdentityRow>
          <IdentityRow label={labels.identity.quantity}>
            <span className="font-mono">
              {detail.quantity} {detail.uom}
            </span>
          </IdentityRow>
          {hasReservation ? (
            <IdentityRow label={labels.identity.reserved}>
              <span className="font-mono">
                {detail.reservedQty} {detail.uom}
              </span>
              {detail.reservedForWoNumber ? (
                <span className="text-slate-500"> → {detail.reservedForWoNumber}</span>
              ) : null}
            </IdentityRow>
          ) : null}
          <IdentityRow label={labels.identity.available}>
            <span className="font-mono">
              {detail.availableQty} {detail.uom}
            </span>
          </IdentityRow>
          <IdentityRow label={labels.identity.batch}>
            <span className="font-mono">{detail.batchNumber ?? labels.identity.none}</span>
          </IdentityRow>
          <IdentityRow label={labels.identity.supplierBatch}>
            <span className="font-mono">{detail.supplierBatchNumber ?? labels.identity.none}</span>
          </IdentityRow>
          <IdentityRow label={labels.identity.expiry}>
            <span className="font-mono">{detail.expiryDate ? detail.expiryDate.slice(0, 10) : labels.identity.none}</span>
          </IdentityRow>
          {detail.bestBeforeDate ? (
            <IdentityRow label={labels.identity.bestBefore}>
              <span className="font-mono">{detail.bestBeforeDate.slice(0, 10)}</span>
            </IdentityRow>
          ) : null}
          {detail.catchWeightKg ? (
            <IdentityRow label={labels.identity.catchWeight}>
              <span className="font-mono">{detail.catchWeightKg} kg</span>
            </IdentityRow>
          ) : null}
          <IdentityRow label={labels.identity.location}>
            <span className="font-mono">{detail.locationCode ?? labels.identity.none}</span>
            {detail.locationName ? <span className="text-slate-500"> — {detail.locationName}</span> : null}
          </IdentityRow>
          <IdentityRow label={labels.identity.warehouse}>
            <span className="font-mono">{detail.warehouseCode ?? labels.identity.none}</span>
            {detail.warehouseName ? <span className="text-slate-500"> — {detail.warehouseName}</span> : null}
          </IdentityRow>
          <IdentityRow label={labels.identity.source}>{detail.origin}</IdentityRow>
          <IdentityRow label={labels.identity.parentLp}>
            {detail.parentLp ? (
              <Link
                href={lpHref(detail.parentLp.id)}
                data-testid="lp-detail-parent-link"
                className="font-mono text-sky-700 hover:underline"
              >
                {detail.parentLp.lpNumber}
              </Link>
            ) : (
              <span className="text-slate-400">{labels.identity.none}</span>
            )}
          </IdentityRow>

          {/* Action group. QA release (pending qa_status) and Move (non-terminal
              status, AUDIT #5) are live; the rest remains deferred. */}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3" data-testid="lp-detail-actions">
            {LP_DEFERRED_ACTIONS.map((key) =>
              key === 'qa' ? (
                <button
                  key={key}
                  type="button"
                  disabled={!canReleaseQa}
                  title={canReleaseQa ? undefined : labels.actions.qaRelease.unavailable}
                  data-testid={`lp-action-${key}`}
                  onClick={() => setQaModalOpen(true)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs',
                    canReleaseQa
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'cursor-not-allowed border-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  {labels.actions.labelByKey[key]}
                </button>
              ) : key === 'move' ? (
                <button
                  key={key}
                  type="button"
                  disabled={!canMove}
                  title={canMove ? undefined : labels.actions.comingSoon}
                  data-testid={`lp-action-${key}`}
                  onClick={() => setMoveModalOpen(true)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs',
                    canMove
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'cursor-not-allowed border-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  {labels.actions.labelByKey[key]}
                </button>
              ) : (
                <button
                  key={key}
                  type="button"
                  disabled
                  title={labels.actions.comingSoon}
                  data-testid={`lp-action-${key}`}
                  className="cursor-not-allowed rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-400"
                >
                  {labels.actions.labelByKey[key]}
                </button>
              ),
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{labels.ruleNote}</p>
        </Card>

        {/* Tabs (parity lp-screens.jsx:325-331). */}
        <div className="flex min-w-0 flex-col gap-3">
          <div role="tablist" aria-label={labels.identity.title} className="flex flex-wrap gap-1 border-b border-slate-200">
            {LP_DETAIL_TABS.map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  data-testid={`lp-detail-tab-${k}`}
                  onClick={() => setTab(k)}
                  className={[
                    'border-b-2 px-3 py-2 text-sm transition',
                    on
                      ? 'border-slate-900 font-semibold text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  {labels.tab[k]}
                </button>
              );
            })}
          </div>

          {tab === 'overview' ? (
            <Card data-testid="lp-tabpanel-overview" className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{labels.overview.title}</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <Fact term={labels.identity.product} value={`${detail.itemCode ?? '—'}${detail.itemName ? ` — ${detail.itemName}` : ''}`} />
                <Fact term={labels.identity.quantity} value={`${detail.quantity} ${detail.uom}`} />
                <Fact term={labels.identity.reserved} value={`${detail.reservedQty} ${detail.uom}`} />
                <Fact term={labels.identity.available} value={`${detail.availableQty} ${detail.uom}`} />
                <Fact term={labels.identity.batch} value={detail.batchNumber ?? labels.identity.none} />
                <Fact term={labels.identity.expiry} value={detail.expiryDate ? detail.expiryDate.slice(0, 10) : labels.identity.none} />
                <Fact term={labels.identity.location} value={detail.locationCode ?? labels.identity.none} />
                <Fact term={labels.identity.warehouse} value={detail.warehouseCode ?? labels.identity.none} />
                <Fact term={labels.identity.source} value={detail.origin} />
                <Fact term={labels.identity.parentLp} value={detail.parentLp?.lpNumber ?? labels.identity.none} />
              </dl>
            </Card>
          ) : null}

          {tab === 'history' ? (
            <Card data-testid="lp-tabpanel-history" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {detail.stateHistory.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">{labels.history.empty}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.history.at}</TableHead>
                      <TableHead scope="col">{labels.history.from}</TableHead>
                      <TableHead scope="col">{labels.history.to}</TableHead>
                      <TableHead scope="col">{labels.history.reasonCol}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.stateHistory.map((h) => (
                      <TableRow key={h.id} data-testid={`lp-history-${h.id}`}>
                        <TableCell className="font-mono text-[11px] text-slate-500">{fmtDate(h.transitionedAt)}</TableCell>
                        <TableCell className="font-mono text-xs">{h.fromState ?? '∅'}</TableCell>
                        <TableCell className="font-mono text-xs">{h.toState}</TableCell>
                        <TableCell className="text-xs text-slate-600">{h.reasonText ?? h.reasonCode ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          ) : null}

          {tab === 'reservations' ? (
            <Card data-testid="lp-tabpanel-reservations" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {!hasReservation ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">{labels.reservations.empty}</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{labels.reservations.wo}</TableHead>
                        <TableHead scope="col" className="text-right">{labels.reservations.reservedQty}</TableHead>
                        <TableHead scope="col" className="text-right">{labels.reservations.available}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow data-testid="lp-reservation-row">
                        <TableCell className="font-mono text-sm font-semibold text-sky-700">
                          {detail.reservedForWoNumber ?? detail.reservedForWoId}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {detail.reservedQty} {detail.uom}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {detail.availableQty} {detail.uom}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <p className="px-4 py-3 text-[11px] text-slate-500">{labels.reservations.note}</p>
                </>
              )}
            </Card>
          ) : null}

          {tab === 'movements' ? (
            <Card data-testid="lp-tabpanel-movements" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {detail.moves.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">{labels.movements.empty}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.movements.timestamp}</TableHead>
                      <TableHead scope="col">{labels.movements.type}</TableHead>
                      <TableHead scope="col">{labels.movements.from}</TableHead>
                      <TableHead scope="col">{labels.movements.to}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.movements.qty}</TableHead>
                      <TableHead scope="col">{labels.movements.reference}</TableHead>
                      <TableHead scope="col">{labels.movements.reason}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.moves.map((m) => (
                      <TableRow key={m.id} data-testid={`lp-move-${m.id}`}>
                        <TableCell className="font-mono text-[11px] text-slate-500">{fmtDate(m.moveDate)}</TableCell>
                        <TableCell className="text-xs">{m.moveType}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">{m.fromLocationCode ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">{m.toLocationCode ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {m.quantity}
                          {m.uom ? ` ${m.uom}` : ''}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-slate-500">{m.moveNumber}</TableCell>
                        <TableCell className="text-xs text-slate-600">{m.reasonText ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          ) : null}

          {tab === 'genealogy' ? (
            <Card data-testid="lp-tabpanel-genealogy" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <section>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">{labels.genealogy.parentTitle}</h3>
                {detail.parentLp ? (
                  <Link
                    href={lpHref(detail.parentLp.id)}
                    data-testid="lp-genealogy-parent"
                    className="font-mono text-sm text-sky-700 hover:underline"
                  >
                    {detail.parentLp.lpNumber}
                  </Link>
                ) : (
                  <p className="text-sm text-slate-500" data-testid="lp-genealogy-no-parent">
                    {labels.genealogy.noParent}
                  </p>
                )}
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">{labels.genealogy.childrenTitle}</h3>
                {detail.childLps.length === 0 ? (
                  <p className="text-sm text-slate-500" data-testid="lp-genealogy-no-children">
                    {labels.genealogy.noChildren}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1" data-testid="lp-genealogy-children">
                    {detail.childLps.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 text-sm">
                        <Link href={lpHref(c.id)} className="font-mono text-sky-700 hover:underline">
                          {c.lpNumber}
                        </Link>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">{c.status}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-slate-600">
                          {c.quantity} {c.uom}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </Card>
          ) : null}

          {tab === 'labels' ? (
            <Card data-testid="lp-tabpanel-labels" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
              {/* RED-LINE: label printing deferred to a later lane. */}
              <p className="text-sm text-slate-500" data-testid="lp-labels-deferred">
                {labels.labels.deferred}
              </p>
              <button
                type="button"
                disabled
                title={labels.actions.comingSoon}
                data-testid="lp-labels-print"
                className="w-fit cursor-not-allowed rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-400"
              >
                {labels.labels.printAction}
              </button>
            </Card>
          ) : null}

          {tab === 'raw' ? (
            <Card data-testid="lp-tabpanel-raw" className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{labels.raw.title}</h3>
              <pre
                data-testid="lp-raw-json"
                className="overflow-auto rounded-md bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700"
              >
                {JSON.stringify(rawExtView(detail), null, 2)}
              </pre>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal open={qaModalOpen} onOpenChange={(open) => (!open ? closeQaModal() : setQaModalOpen(true))} modalId="lpQaRelease" size="sm">
        <Modal.Header title={labels.actions.qaRelease.title} />
        <Modal.Body>
          <div data-testid="lp-qa-release-modal" className="flex flex-col gap-3">
            <label htmlFor="lp-qa-decision" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.actions.qaRelease.decision}
            </label>
            <Select
              id="lp-qa-decision"
              value={qaDecision}
              onValueChange={(value) => setQaDecision(value as ReleaseLpQaDecision)}
              disabled={isPending}
              aria-label={labels.actions.qaRelease.decision}
              options={[
                { value: 'released', label: labels.actions.qaRelease.released },
                { value: 'rejected', label: labels.actions.qaRelease.rejected },
              ]}
            >
              <SelectTrigger data-testid="lp-qa-decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="released">{labels.actions.qaRelease.released}</SelectItem>
                <SelectItem value="rejected">{labels.actions.qaRelease.rejected}</SelectItem>
              </SelectContent>
            </Select>
            <label htmlFor="lp-qa-note" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.actions.qaRelease.note}
            </label>
            <Textarea
              id="lp-qa-note"
              rows={3}
              value={qaNote}
              disabled={isPending}
              placeholder={labels.actions.qaRelease.notePlaceholder}
              onChange={(event) => setQaNote(event.target.value)}
              data-testid="lp-qa-note"
            />
            {qaError ? (
              <p role="alert" data-testid="lp-qa-release-error" className="text-sm text-red-700">
                {qaError}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            disabled={isPending}
            onClick={closeQaModal}
            data-testid="lp-qa-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
          >
            {labels.actions.qaRelease.cancel}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={submitQaRelease}
            data-testid="lp-qa-confirm"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {labels.actions.qaRelease.confirm}
          </button>
        </Modal.Footer>
      </Modal>

      {/* AUDIT #5: LP MOVE modal — wires createStockMove. Refreshes on success so
          the Movements tab shows the new move. */}
      <LpMoveModal
        open={moveModalOpen}
        onOpenChange={setMoveModalOpen}
        lp={{ id: detail.id, lpNumber: detail.lpNumber, currentLocationCode: detail.locationCode }}
        labels={labels.move}
        listLocationsAction={listLocationsAction}
        createStockMoveAction={createStockMoveAction}
        onMoved={() => router.refresh()}
      />
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt className="text-slate-500">{term}</dt>
      <dd className="text-right font-mono text-slate-900">{value}</dd>
    </>
  );
}

/**
 * The detail action does not (yet) project `ext_jsonb` as a discrete field, so
 * "raw" pretty-prints the full detail view-model — an honest, real-data dump of
 * everything the action returned. When the action surfaces `ext_jsonb` this
 * narrows to that object.
 */
function rawExtView(detail: LicensePlateDetail): Record<string, unknown> {
  return { ...detail };
}
