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
 *   - Labels tab (E1): label printing is now LIVE — the tab renders an enabled
 *     print affordance that calls printLabel for this LP (gated on
 *     settings.org.update, re-checked server-side); it shows the queued/sent result
 *     plus a download link when result_url is present, and links to Print history.
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
import type { blockLp, listOpenWorkOrdersForLpReserve, reserveLp, unblockLp, UnblockLpResult } from '../_actions/lp-detail-actions';
import type { destroyLp, listSiblingLpsForMerge, mergeLps, splitLp } from '../_actions/lp-split-merge-destroy-actions';
import { LpBlockModal, type LpBlockModalLabels } from './lp-block-modal.client';
import { LpDestroyModal, type LpDestroyModalLabels } from './lp-destroy-modal.client';
import { LpMergeModal, type LpMergeModalLabels } from './lp-merge-modal.client';
import { LpMoveModal, type LpMoveLabels } from './lp-move-modal.client';
import { LpSplitModal, type LpSplitModalLabels } from './lp-split-modal.client';
import {
  LpMetadataEditModal,
  type LpMetadataEditLabels,
  type UpdateLpMetadataInput,
  type UpdateLpMetadataResult,
} from './lp-metadata-edit-modal.client';
import { LpReserveModal, type LpReserveModalLabels } from './lp-reserve-modal.client';
import { LP_DEFERRED_ACTIONS, LP_DETAIL_ACTIONS, type LpDetailAction, type LpDeferredAction } from './lp-detail-constants';

// Client-side consumers (tests) may keep importing these from here; SERVER code
// must import from './lp-detail-constants' — see the regression note there.
export { LP_DEFERRED_ACTIONS, LP_DETAIL_ACTIONS, type LpDetailAction, type LpDeferredAction };

/** LP statuses for which the "move" action is NOT allowed (terminal lifecycle). */
const IMMOVABLE_STATUSES = new Set(['consumed', 'merged', 'shipped', 'returned', 'destroyed']);

/**
 * WH-R3 — client mirror of the backend split eligibility (SPLIT_MERGE_STATES in
 * lp-split-merge-destroy-actions.ts): material present, not held, not terminal.
 * The action re-enforces this + the active-hold check; the gate here only stops a
 * user clicking into a guaranteed rejection.
 */
const SPLIT_ALLOWED_STATUSES = new Set(['received', 'available', 'returned']);

/**
 * WH-R3 — client mirror of the backend destroy block-list (DESTROY_BLOCKED_STATES):
 * already-terminal LPs cannot be (re-)destroyed. Reserved stock is also blocked
 * (the action rejects reserved_qty > 0); the action re-checks both.
 */
const DESTROY_BLOCKED_STATUSES = new Set(['consumed', 'shipped', 'merged', 'destroyed']);

/**
 * C-R3 — LP statuses for which metadata (expiry / batch) can NO LONGER be edited:
 * terminal lifecycle states where the LP is gone or sealed. Mirrors the pinned
 * brief (consumed / shipped / merged / destroyed); the server `updateLpMetadata`
 * re-enforces this and returns `lp_not_editable` regardless of the client gate.
 */
const METADATA_LOCKED_STATUSES = new Set(['consumed', 'shipped', 'merged', 'destroyed']);

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


const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'info',
  blocked: 'danger',
  consumed: 'muted',
  shipped: 'secondary',
  merged: 'muted',
  // mig 294 — terminal state for pallets voided by an output correction (Wave R2).
  destroyed: 'danger',
};

function qaVariant(qa: string): BadgeVariant {
  const up = qa.toUpperCase();
  if (up === 'PASSED' || up === 'RELEASED') return 'success';
  if (up === 'FAILED' || up === 'QUARANTINED') return 'danger';
  if (up === 'HOLD' || up === 'ON_HOLD' || up === 'PENDING') return 'warning';
  return 'muted';
}

const HOLD_QA_STATUSES = new Set(['on_hold', 'hold']);
const RESERVE_ALLOWED_STATUSES = new Set(['available', 'reserved']);

/** Last-resort display for an unmapped qa_status value: "on_hold" → "On hold".
 *  Never leak a raw snake_case DB token into the UI. */
function humanizeQaStatus(qa: string): string {
  return qa
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export type LpDetailLabels = {
  back: string;
  qtyLine: string;
  statusLabel: Record<string, string>;
  /** QA-status display dict (pending / released / on_hold / …) — keyed by the raw
   *  lowercase qa_status so the badge never leaks an untranslated DB value. */
  qaStatusLabel: Record<string, string>;
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
    labelByKey: Record<LpDetailAction, string>;
    reserve: LpReserveModalLabels;
    block: LpBlockModalLabels;
    unblock: {
      title: string;
      intro: string;
      reason: string;
      reasonPlaceholder: string;
      /** P0-B3 — e-sign (21 CFR Part 11) block copy for the required password. */
      esign: {
        title: string;
        meaning: string;
        password: string;
        passwordHelp: string;
        passwordPlaceholder: string;
      };
      cancel: string;
      confirm: string;
      submitting: string;
      success: string;
      errors: {
        forbidden: string;
        invalidState: string;
        noOpenHold: string;
        invalidInput: string;
        notFound: string;
        generic: string;
      };
    };
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
    /** WH-R3 — Split modal copy. */
    split: LpSplitModalLabels;
    /** P1-19 — Merge modal copy. */
    merge: LpMergeModalLabels;
    /** WH-R3 — Destroy / scrap modal copy. */
    destroy: LpDestroyModalLabels;
    /** WH-R3 — tooltips shown on a gated (ineligible) action button. */
    ineligible: {
      split: string;
      destroy: string;
      merge: string;
      reserve: string;
      /** Past expiry_date — mirrors reserveLp / mergeLps invalid_state. */
      expired: string;
      /** qa on_hold OR active v_active_holds row. */
      onHold: string;
    };
  };
  move: LpMoveLabels;
  /** C-R3 — edit-metadata (expiry / batch) modal copy. */
  metadata: LpMetadataEditLabels;
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
  labels: {
    deferred: string;
    printAction: string;
    printing: string;
    queued: string;
    sent: string;
    download: string;
    error: string;
    forbidden: string;
    historyLink: string;
  };
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

/**
 * E1 — minimal view of the `printLabel` Server Action result the labels tab needs.
 * The action returns the full PrintJobRow; the client only reads status / result_url.
 */
export type LpPrintLabelResult = { status: 'queued' | 'sent' | 'failed'; result_url: string | null };
export type LpPrintLabelInput = { entityType: 'lp'; entityId: string };

export function LpDetailClient({
  detail,
  labels,
  locale,
  releaseQaAction,
  blockLpAction,
  unblockLpAction,
  reserveLpAction,
  listOpenWorkOrdersForLpReserveAction,
  listLocationsAction,
  createStockMoveAction,
  splitLpAction,
  mergeLpAction,
  listSiblingLpsForMergeAction,
  destroyLpAction,
  updateLpMetadataAction,
  printLabelAction,
  canPrint,
}: {
  detail: LicensePlateDetail;
  labels: LpDetailLabels;
  locale: string;
  releaseQaAction: (input: ReleaseLpQaInput) => Promise<WarehouseResult<ReleaseLpQaResult>>;
  blockLpAction: typeof blockLp;
  unblockLpAction: typeof unblockLp;
  reserveLpAction: typeof reserveLp;
  listOpenWorkOrdersForLpReserveAction: typeof listOpenWorkOrdersForLpReserve;
  listLocationsAction: typeof listLocations;
  createStockMoveAction: typeof createStockMove;
  /** WH-R3 — split this LP into a child (idempotent; requires clientOpId). */
  splitLpAction: typeof splitLp;
  /** P1-19 — merge sibling LPs into this primary. */
  mergeLpAction: typeof mergeLps;
  listSiblingLpsForMergeAction: typeof listSiblingLpsForMerge;
  /** WH-R3 — destroy / scrap this LP (idempotent; requires clientOpId). */
  destroyLpAction: typeof destroyLp;
  /**
   * E1 — print a label for this LP. OWNED by the printers settings actions
   * (settings/infra/printers/_actions/printers.ts → printLabel) and threaded in by
   * the page; never imported here directly. RBAC (settings.org.update) is
   * re-enforced server-side — `canPrint` only governs the disabled affordance.
   */
  printLabelAction: (input: LpPrintLabelInput) => Promise<LpPrintLabelResult>;
  canPrint: boolean;
  /**
   * C-R3 — edit LP expiry / batch. OWNED by the warehouse corrections lane
   * (warehouse/_actions/lp-metadata-actions.ts) and threaded in by the page via an
   * import-only adapter seam; never imported here directly. RBAC + editability are
   * re-checked server-side — the affordance here is only hidden for terminal LPs.
   */
  updateLpMetadataAction: (input: UpdateLpMetadataInput) => Promise<UpdateLpMetadataResult>;
}) {
  const [tab, setTab] = useState<LpDetailTab>('overview');
  const [qaModalOpen, setQaModalOpen] = useState(false);
  const [qaDecision, setQaDecision] = useState<ReleaseLpQaDecision>('released');
  const [qaNote, setQaNote] = useState('');
  const [qaError, setQaError] = useState<string | null>(null);
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [unblockModalOpen, setUnblockModalOpen] = useState(false);
  const [unblockReason, setUnblockReason] = useState('');
  // P0-B3: unblocking releases the QA hold, which now requires a real e-sign.
  const [unblockPassword, setUnblockPassword] = useState('');
  const [unblockError, setUnblockError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [destroyModalOpen, setDestroyModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // E1 — label print state for the labels tab.
  const [printPending, setPrintPending] = useState(false);
  const [printResult, setPrintResult] = useState<LpPrintLabelResult | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const router = useRouter();

  const lpHref = (id: string) => `/${locale}/warehouse/license-plates/${id}`;
  const hasReservation = Boolean(detail.reservedForWoId) && Number(detail.reservedQty) > 0;
  const qaStatusLower = detail.qaStatus.toLowerCase();
  // Mirror reserveLp / mergeLps: hold can exist via v_active_holds without qa_status=on_hold.
  const hasActiveHold = detail.hasActiveHold;
  const onHold = HOLD_QA_STATUSES.has(qaStatusLower) || hasActiveHold;
  const isExpired = Boolean(
    detail.expiryDate && detail.expiryDate.slice(0, 10) < new Date().toISOString().slice(0, 10),
  );
  const canReleaseQa = qaStatusLower === 'pending';
  // AUDIT #5: "move" is live unless the LP is in a terminal lifecycle state.
  const canMove = !IMMOVABLE_STATUSES.has(detail.status.toLowerCase());
  const isBlocked = detail.status.toLowerCase() === 'blocked';
  // C-R3: metadata edit is hidden for terminal LPs (consumed/shipped/merged/destroyed).
  const canEditMetadata = !METADATA_LOCKED_STATUSES.has(detail.status.toLowerCase());
  // WH-R3: split is allowed for material-present, non-terminal LPs WITH positive
  // available qty (split qty must be strictly < available, so 0 available = no split).
  const canSplit =
    SPLIT_ALLOWED_STATUSES.has(detail.status.toLowerCase()) && Number(detail.availableQty) > 0;
  // P1-19: merge mirrors SPLIT_MERGE_STATES + unreserved + !hold + !expired (server re-enforces).
  const canMerge =
    SPLIT_ALLOWED_STATUSES.has(detail.status.toLowerCase()) &&
    !onHold &&
    !hasActiveHold &&
    !isExpired &&
    Number(detail.reservedQty) === 0;
  // P2 #20: reserve mirrors server (released, not held, not expired, available/reserved, qty > 0).
  const canReserve =
    qaStatusLower === 'released' &&
    !onHold &&
    !hasActiveHold &&
    !isExpired &&
    RESERVE_ALLOWED_STATUSES.has(detail.status.toLowerCase()) &&
    Number(detail.availableQty) > 0;
  const reserveIneligibleTitle = isExpired
    ? labels.actions.ineligible.expired
    : onHold
      ? labels.actions.ineligible.onHold
      : labels.actions.ineligible.reserve;
  const mergeIneligibleTitle = isExpired
    ? labels.actions.ineligible.expired
    : onHold
      ? labels.actions.ineligible.onHold
      : labels.actions.ineligible.merge;
  // WH-R3: destroy is blocked for terminal LPs and for LPs holding reserved stock
  // (clear the reservation first). The action re-enforces both.
  const canDestroy =
    !DESTROY_BLOCKED_STATUSES.has(detail.status.toLowerCase()) &&
    detail.status.toLowerCase() !== 'reserved' &&
    Number(detail.reservedQty) === 0;

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

  function closeUnblockModal() {
    if (isPending) return;
    setUnblockModalOpen(false);
    setUnblockReason('');
    setUnblockPassword('');
    setUnblockError(null);
  }

  function unblockErrorMessage(result: Extract<WarehouseResult<UnblockLpResult>, { ok: false }>): string {
    if (result.reason === 'forbidden') return labels.actions.unblock.errors.forbidden;
    if (result.reason === 'not_found') return labels.actions.unblock.errors.notFound;
    switch (result.message) {
      case 'invalid_input':
        return labels.actions.unblock.errors.invalidInput;
      case 'invalid_state':
        return labels.actions.unblock.errors.invalidState;
      case 'no_open_hold':
        return labels.actions.unblock.errors.noOpenHold;
      default:
        return labels.actions.unblock.errors.generic;
    }
  }

  function submitUnblock() {
    const reason = unblockReason.trim();
    // P0-B3: the password is NOT trimmed (spaces can be significant) but must be
    // present — the server re-verifies it via signEvent and gates
    // quality.hold.release; this island never trusts a client-only pass.
    if (!reason || unblockPassword.length === 0 || isPending) return;
    setUnblockError(null);
    setActionToast(null);
    startTransition(async () => {
      const result = await unblockLpAction(detail.id, reason, unblockPassword);
      if (result.ok) {
        setUnblockModalOpen(false);
        setUnblockReason('');
        setUnblockPassword('');
        setUnblockError(null);
        setActionToast({ tone: 'success', text: labels.actions.unblock.success });
        router.refresh();
        return;
      }
      const message = unblockErrorMessage(result);
      setUnblockError(message);
      setActionToast({ tone: 'error', text: message });
    });
  }

  async function submitPrintLabel() {
    if (!canPrint || printPending) return;
    setPrintPending(true);
    setPrintError(null);
    setPrintResult(null);
    try {
      const result = await printLabelAction({ entityType: 'lp', entityId: detail.id });
      setPrintResult(result);
    } catch {
      setPrintError(labels.labels.error);
    } finally {
      setPrintPending(false);
    }
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
          {/* P2 #20: when QA is on_hold, skip the lifecycle "Available" badge — dual
              Available + on_hold reads as contradictory. Hold QA badge alone is enough. */}
          {onHold ? null : (
            <Badge variant={STATUS_VARIANT[detail.status] ?? 'muted'} data-testid="lp-detail-status">
              {labels.statusLabel[detail.status] ?? detail.status}
            </Badge>
          )}
          <Badge variant={qaVariant(detail.qaStatus)} data-testid="lp-detail-qa">
            {labels.qaStatusLabel[detail.qaStatus.toLowerCase()] ?? humanizeQaStatus(detail.qaStatus)}
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

          {/* Action group. Split / Merge / Reserve / Move / Block / Destroy are live. */}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3" data-testid="lp-detail-actions">
            {LP_DETAIL_ACTIONS.map((key) =>
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
              ) : key === 'reserve' ? (
                <button
                  key={key}
                  type="button"
                  disabled={!canReserve}
                  title={canReserve ? undefined : reserveIneligibleTitle}
                  data-testid={`lp-action-${key}`}
                  onClick={() => setReserveModalOpen(true)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs',
                    canReserve
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
              ) : key === 'block' ? (
                isBlocked ? null : (
                <button
                  key={key}
                  type="button"
                  data-testid={`lp-action-${key}`}
                  onClick={() => setBlockModalOpen(true)}
                  className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  {labels.actions.labelByKey[key]}
                </button>
                )
              ) : key === 'unblock' ? (
                isBlocked ? (
                  <button
                    key={key}
                    type="button"
                    data-testid={`lp-action-${key}`}
                    onClick={() => setUnblockModalOpen(true)}
                    className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                  >
                    {labels.actions.labelByKey[key]}
                  </button>
                ) : null
              ) : key === 'split' ? (
                <button
                  key={key}
                  type="button"
                  disabled={!canSplit}
                  title={canSplit ? undefined : labels.actions.ineligible.split}
                  data-testid={`lp-action-${key}`}
                  onClick={() => setSplitModalOpen(true)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs',
                    canSplit
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'cursor-not-allowed border-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  {labels.actions.labelByKey[key]}
                </button>
              ) : key === 'destroy' ? (
                <button
                  key={key}
                  type="button"
                  disabled={!canDestroy}
                  title={canDestroy ? undefined : labels.actions.ineligible.destroy}
                  data-testid={`lp-action-${key}`}
                  onClick={() => setDestroyModalOpen(true)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs',
                    canDestroy
                      ? 'border-red-300 text-red-700 hover:bg-red-50'
                      : 'cursor-not-allowed border-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  {labels.actions.labelByKey[key]}
                </button>
              ) : key === 'merge' ? (
                <button
                  key={key}
                  type="button"
                  disabled={!canMerge}
                  title={canMerge ? undefined : mergeIneligibleTitle}
                  data-testid={`lp-action-${key}`}
                  onClick={() => setMergeModalOpen(true)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs',
                    canMerge
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'cursor-not-allowed border-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  {labels.actions.labelByKey[key]}
                </button>
              ) : null,
            )}
            {/* C-R3 — Edit metadata (expiry / batch). Sits next to Move/QA; hidden
                for terminal LPs (consumed/shipped/merged/destroyed). */}
            {canEditMetadata ? (
              <button
                type="button"
                data-testid="lp-action-metadata"
                onClick={() => setMetadataModalOpen(true)}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {labels.metadata.action}
              </button>
            ) : null}
          </div>
          {actionToast ? (
            <div
              role={actionToast.tone === 'error' ? 'alert' : 'status'}
              aria-live={actionToast.tone === 'error' ? 'assertive' : 'polite'}
              data-testid="lp-action-toast"
              className={[
                'mt-2 rounded-md border px-3 py-2 text-xs',
                actionToast.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800',
              ].join(' ')}
            >
              {actionToast.text}
            </div>
          ) : null}
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
                        <span className="text-slate-600">{labels.statusLabel[c.status] ?? c.status}</span>
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
              {/* E1 — label printing is LIVE: calls printLabel({entityType:'lp', entityId}). */}
              <p className="text-sm text-slate-500" data-testid="lp-labels-intro">
                {labels.labels.deferred}
              </p>
              <button
                type="button"
                disabled={!canPrint || printPending}
                title={canPrint ? undefined : labels.labels.forbidden}
                aria-label={canPrint ? labels.labels.printAction : `${labels.labels.printAction} — ${labels.labels.forbidden}`}
                onClick={() => void submitPrintLabel()}
                data-testid="lp-labels-print"
                className={
                  canPrint
                    ? 'w-fit rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50'
                    : 'w-fit cursor-not-allowed rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-400'
                }
              >
                {printPending ? labels.labels.printing : labels.labels.printAction}
              </button>
              {printResult ? (
                <div
                  role="status"
                  data-testid="lp-labels-print-result"
                  data-print-status={printResult.status}
                  className="flex flex-col items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  <span>{printResult.status === 'sent' ? labels.labels.sent : labels.labels.queued}</span>
                  {printResult.result_url ? (
                    <a
                      href={printResult.result_url}
                      download
                      data-testid="lp-labels-download"
                      className="text-sky-700 underline"
                    >
                      {labels.labels.download}
                    </a>
                  ) : null}
                </div>
              ) : null}
              {printError ? (
                <p role="alert" data-testid="lp-labels-print-error" className="text-sm text-red-700">
                  {printError}
                </p>
              ) : null}
              <Link
                href={`/${locale}/warehouse/print-history`}
                data-testid="lp-labels-history-link"
                className="w-fit text-xs text-sky-700 hover:underline"
              >
                {labels.labels.historyLink}
              </Link>
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
                <SelectValue placeholder={labels.actions.qaRelease.decision} />
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

      <Modal open={unblockModalOpen} onOpenChange={(open) => (!open ? closeUnblockModal() : setUnblockModalOpen(true))} modalId="lpUnblock" size="sm">
        <Modal.Header title={labels.actions.unblock.title.replace('{lp}', detail.lpNumber)} />
        <Modal.Body>
          <div data-testid="lp-unblock-modal" className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">{labels.actions.unblock.intro}</p>
            <label htmlFor="lp-unblock-reason" className="text-sm font-medium text-slate-700">
              {labels.actions.unblock.reason}
            </label>
            <Textarea
              id="lp-unblock-reason"
              rows={3}
              value={unblockReason}
              disabled={isPending}
              placeholder={labels.actions.unblock.reasonPlaceholder}
              onChange={(event) => setUnblockReason(event.target.value)}
              data-testid="lp-unblock-reason"
            />
            {/* P0-B3 — e-sign (21 CFR Part 11) block. Mirrors the QA hold-release
                modal (quality/holds/.../hold-release-modal.client.tsx:191-210):
                releasing the underlying hold now requires a real account-password
                signature, re-verified server-side by signEvent. */}
            <div
              data-testid="lp-unblock-esign"
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {labels.actions.unblock.esign.title}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{labels.actions.unblock.esign.meaning}</p>
              <label htmlFor="lp-unblock-password" className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">
                  {labels.actions.unblock.esign.password} <span aria-hidden className="text-red-500">*</span>
                </span>
                <input
                  id="lp-unblock-password"
                  type="password"
                  data-testid="lp-unblock-password"
                  value={unblockPassword}
                  disabled={isPending}
                  placeholder={labels.actions.unblock.esign.passwordPlaceholder}
                  autoComplete="current-password"
                  onChange={(event) => setUnblockPassword(event.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.actions.unblock.esign.passwordHelp}</p>
            </div>
            {unblockError ? (
              <p role="alert" data-testid="lp-unblock-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {unblockError}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            disabled={isPending}
            onClick={closeUnblockModal}
            data-testid="lp-unblock-cancel"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {labels.actions.unblock.cancel}
          </button>
          <button
            type="button"
            disabled={!unblockReason.trim() || unblockPassword.length === 0 || isPending}
            onClick={submitUnblock}
            data-testid="lp-unblock-confirm"
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isPending ? labels.actions.unblock.submitting : labels.actions.unblock.confirm}
          </button>
        </Modal.Footer>
      </Modal>

      <LpReserveModal
        open={reserveModalOpen}
        onOpenChange={setReserveModalOpen}
        lpId={detail.id}
        lpNumber={detail.lpNumber}
        availableQty={detail.availableQty}
        uom={detail.uom}
        labels={labels.actions.reserve}
        reserveAction={reserveLpAction}
        listWorkOrdersAction={listOpenWorkOrdersForLpReserveAction}
        onSuccess={() => router.refresh()}
      />

      <LpBlockModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        lpId={detail.id}
        lpNumber={detail.lpNumber}
        labels={labels.actions.block}
        blockAction={blockLpAction}
        onSuccess={() => router.refresh()}
      />

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

      {/* C-R3 — Edit-metadata modal (expiry / batch, reason + note, no e-sign).
          Mounted only when the LP is editable + the modal is open. */}
      {canEditMetadata ? (
        <LpMetadataEditModal
          open={metadataModalOpen}
          lp={{ id: detail.id, expiryDate: detail.expiryDate, batchNumber: detail.batchNumber }}
          labels={labels.metadata}
          updateLpMetadataAction={updateLpMetadataAction}
          onClose={() => setMetadataModalOpen(false)}
          onSaved={() => {
            setMetadataModalOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* WH-R3 — Split modal. Wires splitLp with a fresh clientOpId per open. */}
      {canSplit ? (
        <LpSplitModal
          open={splitModalOpen}
          onOpenChange={setSplitModalOpen}
          lpId={detail.id}
          lpNumber={detail.lpNumber}
          availableQty={detail.availableQty}
          uom={detail.uom}
          labels={labels.actions.split}
          splitAction={splitLpAction}
          onSuccess={() => router.refresh()}
        />
      ) : null}

      {/* P1-19 — Merge modal. Loads sibling candidates via listSiblingLpsForMerge. */}
      {canMerge ? (
        <LpMergeModal
          open={mergeModalOpen}
          onOpenChange={setMergeModalOpen}
          primaryLpId={detail.id}
          primaryLpNumber={detail.lpNumber}
          labels={labels.actions.merge}
          listSiblingsAction={listSiblingLpsForMergeAction}
          mergeAction={mergeLpAction}
          onSuccess={() => router.refresh()}
        />
      ) : null}

      {/* WH-R3 — Destroy / scrap modal. Wires destroyLp with a fresh clientOpId. */}
      {canDestroy ? (
        <LpDestroyModal
          open={destroyModalOpen}
          onOpenChange={setDestroyModalOpen}
          lpId={detail.id}
          lpNumber={detail.lpNumber}
          labels={labels.actions.destroy}
          destroyAction={destroyLpAction}
          onSuccess={() => router.refresh()}
        />
      ) : null}
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
