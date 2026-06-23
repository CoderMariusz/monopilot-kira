'use client';

/**
 * P-L1 — WO Execution detail screen, 8 tabs (prototype wo-detail.jsx:4-530).
 *
 * Presentational client component: receives the already-loaded, org-scoped
 * detail bundle + i18n labels from the server page and owns ONLY the active-tab
 * client state (prototype's `tab` useState, default "overview"). No data
 * fetching, no permission logic (both server-resolved).
 *
 * Tab parity (prototype anchors):
 *   Overview     :4-101   header KPIs / status / line / schedule
 *   Consumption  :257     wo_materials vs wo_material_consumption per component
 *   Output       :347     wo_outputs rows
 *   Waste        :409     waste events on this WO
 *   Downtime     :438     downtime events linked to this WO
 *   QA results   :181     linked inspections (honest empty until read-model lands)
 *   Genealogy    :454     LP links from wo_material_consumption (empty-state OK)
 *   History      :505     wo_status_history + execution events
 *
 * P2-MODALS: the prototype's header action bar (Pause / Waste / Catch-weight /
 * Complete — plus Start / Resume / Cancel / Close) + per-tab mutation buttons
 * (Register output, Log waste) are now WIRED to the existing WO route handlers
 * via the <WoActionsProvider> orchestrator. Each button is rendered ONLY when the
 * action is state-legal for the WO's runtime status AND the caller holds the
 * matching permission (server-resolved). The over-consumption approval banner +
 * D365 push card from the prototype remain omitted (no backing read-model here).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@monopilot/ui/Tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  WorkOrderDetailData,
  WorkOrderDetailStatus,
  WoDetailComponent,
} from '../../../_actions/get-work-order-detail';
import type {
  ConsumableLp,
  ConsumeActionResult,
  RecordDesktopConsumptionData,
  RecordDesktopConsumptionInput,
} from '../../../_actions/consume-material-actions';
import type {
  OutputQaActionResult,
  ReleaseWoOutputQaDecision,
  ReleaseWoOutputQaInput,
  ReleaseWoOutputQaResult,
} from '../../../_actions/output-qa-actions';
import {
  WoActionsProvider,
  WoActionTrigger,
} from '../../_components/modals/wo-actions';
import type { PrintFgLabelAction } from '../../_components/modals/action-modals';
import {
  VoidCorrectionModal,
  type VoidModalLabels,
  type VoidWasteEntryInput,
  type VoidWasteEntryResult,
  type VoidWoOutputInput,
  type VoidWoOutputResult,
} from './void-correction-modal';
import {
  ReverseConsumptionModal,
  type ReverseModalLabels,
  type ReverseConsumptionInput,
  type ReverseConsumptionResult,
} from './reverse-consumption-modal';
import type {
  WoActionPermissions,
  WoModalLabels,
  WoReasonCategory,
  WoWasteCategory,
  WoState,
} from '../../_components/modals/types';

const STATUS_VARIANT: Record<WorkOrderDetailStatus, BadgeVariant> = {
  planned: 'muted',
  in_progress: 'info',
  paused: 'warning',
  completed: 'success',
  closed: 'secondary',
  cancelled: 'danger',
};

type TabKey =
  | 'overview'
  | 'consumption'
  | 'output'
  | 'waste'
  | 'downtime'
  | 'qa'
  | 'genealogy'
  | 'labor'
  | 'history';

/**
 * E4B — WO Labor tab view-model. Mirrors the `getWoLaborSummary(woId)` result
 * shape (production/_actions/labor-actions.ts → WoLaborSummary). Entries are
 * already aggregated per operator with the OPERATOR NAME resolved server-side
 * (never a raw user UUID). `state` lets the page surface loading / error /
 * permission-denied without coupling the screen to the action result union.
 */
export type WoLaborEntry = {
  userName: string;
  hours: number;
  ratePerHour: number;
  cost: number;
  noRate?: boolean;
};

export type WoLaborSummaryView = {
  totalHours: number;
  totalCost: number;
  currency: string;
  entries: WoLaborEntry[];
};

export type WoLaborState = 'ready' | 'loading' | 'error' | 'forbidden';

export type WoLaborTabLabels = {
  title: string;
  empty: string;
  loading: string;
  error: string;
  forbidden: string;
  clockIn: string;
  clockOut: string;
  clockingIn: string;
  clockingOut: string;
  clockInDenied: string;
  clockOutDenied: string;
  totalHours: string;
  totalCost: string;
  noRate: string;
  noRateTooltip: string;
  /** Disabled-control tooltip when the caller lacks production.consumption.write. */
  disabledTooltip: string;
  col: { operator: string; hours: string; rate: string; cost: string };
};

export type WoDetailLabels = {
  status: Record<WorkOrderDetailStatus, string>;
  deferredActionTitle: string;
  /**
   * B-2 — amber callout shown when the WO start/release action returns the
   * `changeover_signoff_required` typed error (C4). Links to the changeovers
   * register filtered to this WO's line.
   */
  changeoverGate: { title: string; body: string; link: string };
  headerActions: {
    start: string;
    pause: string;
    resume: string;
    waste: string;
    catchWeight: string;
    complete: string;
    cancel: string;
    close: string;
  };
  tabs: Record<TabKey, string>;
  overview: {
    summaryTitle: string;
    kpisTitle: string;
    wo: string;
    product: string;
    line: string;
    machine: string;
    planned: string;
    output: string;
    plannedWindow: string;
    actualStart: string;
    elapsed: string;
    allergens: string;
    bomVersion: string;
    consumption: string;
    consumptionKpi: string;
    outputKpi: string;
    allergenYes: string;
    allergenNo: string;
    elapsedMin: string;
  };
  consumption: {
    title: string;
    empty: string;
    addAction: string;
    col: { code: string; component: string; planned: string; consumed: string; remaining: string; progress: string };
    record: {
      trigger: string;
      rowTrigger: string;
      title: string;
      subtitle: string;
      material: string;
      materialPlaceholder: string;
      qty: string;
      qtyHint: string;
      lp: string;
      lpLoading: string;
      lpEmpty: string;
      lpError: string;
      lpNone: string;
      lpSuggested: string;
      reasonCode: string;
      reasonPlaceholder: string;
      submit: string;
      submitting: string;
      cancel: string;
      formIncomplete: string;
      /** Warn-tier over-consumption: amber non-blocking line after a flagged success. */
      warningOver: string;
      warningClose: string;
      errors: {
        forbidden: string;
        lp_unavailable: string;
        lp_not_released: string;
        lp_expired: string;
        lp_locked: string;
        quality_hold_active: string;
        reason_required: string;
        invalid_material: string;
        invalid_qty: string;
        generic: string;
      };
    };
  };
  output: {
    title: string;
    empty: string;
    addAction: string;
    col: { type: string; product: string; qty: string; batch: string; expiry: string; qa: string; lp: string };
    qaPass: string;
    qaFail: string;
    qaDenied: string;
    qaInvalidState: string;
    qaError: string;
    /** C-R2 — row-level "Void output…" affordance. */
    voidAction: string;
    /**
     * SOFT-warning (owner decision — warn, never block) shown as a ⚠ badge on the
     * WO header + Output tab when the WO has output but no real material
     * consumption. `badge` is the short pill text; `tooltip` is the hover/`title`
     * explanation. No raw UUIDs — derived state only.
     */
    noConsumptionBadge: string;
    noConsumptionTooltip: string;
    /** Register-output modal [Continue anyway] affordance copy. */
    noConsumptionContinue: string;
  };
  waste: {
    title: string;
    empty: string;
    addAction: string;
    totalLabel: string;
    col: { time: string; category: string; qty: string; reason: string };
    /** C-R2 — row-level "Void entry…" affordance. */
    voidAction: string;
  };
  /** C-R2 — shared void/correction modal + corrected-row display copy. */
  voidCorrection: VoidModalLabels & {
    /** Struck-through original-row badge. */
    voidedBadge: string;
    /** Counter-row label, `{ref}` = the original's short id. */
    correctionOfLabel: string;
  };
  downtime: {
    title: string;
    empty: string;
    addAction: string;
    openLabel: string;
    col: { category: string; start: string; end: string; duration: string; reason: string };
  };
  qa: { title: string; empty: string; total: string; pass: string; hold: string; fail: string };
  /** E4B — Labor tab copy (summary table + clock-in/out controls). */
  labor: WoLaborTabLabels;
  genealogy: {
    title: string;
    empty: string;
    inputsLabel: string;
    fefoOk: string;
    fefoDeviation: string;
    /** C-R3 — per-row "Reverse…" affordance on a consumed-input row. */
    reverseAction: string;
    /** C-R3 — struck-through reversed-row badge (defensive correctionOfId). */
    reversedBadge: string;
    /** C-R3 — counter-row label, `{ref}` = the original's short id. */
    correctionOfLabel: string;
  };
  /** C-R3 — reverse-consumption (e-sign) modal copy. */
  reverseConsumption: ReverseModalLabels;
  history: {
    title: string;
    empty: string;
    sourceStatus: string;
    sourceExecution: string;
    col: { time: string; source: string; action: string; transition: string; reason: string };
  };
};

/**
 * Out-of-lane mutation slots (Consumption "Scan LP", Downtime "Log downtime")
 * stay DEFERRED — they belong to separate flows (LP scan / manual downtime) not
 * wired by P2-MODALS. Rendered DISABLED with an explanatory title.
 */
function DeferredButton({ label, title, testid }: { label: string; title: string; testid: string }) {
  return (
    <button
      type="button"
      disabled
      title={title}
      data-testid={testid}
      className="cursor-not-allowed rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-400"
    >
      {label}
    </button>
  );
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-sky-500' : 'bg-amber-500';
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Server-resolved action context handed down to the modal orchestrator. */
export type WoDetailActions = {
  locale: string;
  status: WoState | null;
  permissions: WoActionPermissions;
  currentUserId: string;
  downtimeCategories: WoReasonCategory[];
  wasteCategories: WoWasteCategory[];
  modalLabels: WoModalLabels;
};

// Formatters live IN this client module — passing them as props from the RSC
// page crashed live (Next16 "Functions cannot be passed to Client Components";
// wave-P1 live verify, digests 568085975/520930007).
const QTY_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function fmtQty(n: number): string {
  return QTY_FMT.format(Math.round(n));
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
// E4B — labor formatters. Hours to 2dp ("h" suffix), money to 2dp (currency code
// rendered alongside by the caller so it is not hard-coded to one symbol).
const HOURS_FMT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONEY_FMT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtHours(n: number): string {
  return `${HOURS_FMT.format(Number.isFinite(n) ? n : 0)} h`;
}
function fmtMoney(n: number): string {
  return MONEY_FMT.format(Number.isFinite(n) ? n : 0);
}

/** E4B — desktop clock-in result (mirrors labor-actions.ClockInToWoResult). */
export type WoClockInResult =
  | { ok: true; logId: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

/** E4B — desktop clock-out result (mirrors labor-actions.ClockOutFromWoResult). */
export type WoClockOutResult =
  | { ok: true; count: number }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export function WoDetailScreen({
  data,
  labels,
  actions,
  changeoverGate,
  releaseOutputQaAction,
  recordConsumptionAction,
  listConsumableLpsAction,
  voidWoOutputAction,
  voidWasteEntryAction,
  reverseConsumptionAction,
  printFgLabelAction,
  canPrintFgLabel = false,
  laborSummary = null,
  laborState = 'ready',
  canManageLabor = false,
  clockInAction,
  clockOutAction,
}: {
  data: WorkOrderDetailData;
  labels: WoDetailLabels;
  /** Null when the action-context read failed/forbade — buttons are then hidden. */
  actions: WoDetailActions | null;
  /**
   * E1 — print the created FG LP label after a successful Register-output. OWNED
   * by the printers settings actions (settings/infra/printers/_actions/printers.ts)
   * and threaded in by the page via an import-only adapter seam; this component
   * never imports it directly. RBAC (settings.org.update) is re-enforced
   * server-side — `canPrintFgLabel` only governs the disabled affordance.
   */
  printFgLabelAction?: PrintFgLabelAction;
  /** Server-resolved settings.org.update; false ⇒ Print FG label disabled + tooltip. */
  canPrintFgLabel?: boolean;
  /**
   * B-2 — set (with the WO's lineId) when start/release was blocked by the
   * `changeover_signoff_required` error from C4; renders the amber callout +
   * deep-link to /production/changeovers. Null = no gate (default).
   */
  changeoverGate?: { lineId: string | null } | null;
  releaseOutputQaAction: (input: ReleaseWoOutputQaInput) => Promise<OutputQaActionResult<ReleaseWoOutputQaResult>>;
  recordConsumptionAction: (
    input: RecordDesktopConsumptionInput,
  ) => Promise<ConsumeActionResult<RecordDesktopConsumptionData>>;
  listConsumableLpsAction: (
    input: { woId: string; materialId: string },
  ) => Promise<ConsumeActionResult<{ lps: ConsumableLp[] }>>;
  /**
   * C-R2 — reversibility actions, OWNED by the corrections backend lane
   * (production/_actions/corrections-actions.ts) and threaded in by the page;
   * this component never imports them directly. RBAC + state legality are
   * re-checked server-side — the affordances here only hide already-corrected
   * rows + offer the void modal.
   */
  voidWoOutputAction: (input: VoidWoOutputInput) => Promise<VoidWoOutputResult>;
  voidWasteEntryAction: (input: VoidWasteEntryInput) => Promise<VoidWasteEntryResult>;
  /**
   * C-R3 — reverse a recorded material-consumption entry (e-sign). OWNED by the
   * corrections backend lane (production/_actions/corrections-actions.ts) and
   * threaded in by the page via an import-only adapter seam; this component never
   * imports it directly. RBAC + LP-restorability are re-checked server-side — the
   * affordance here only hides already-reversed rows + opens the e-sign modal.
   */
  reverseConsumptionAction: (input: ReverseConsumptionInput) => Promise<ReverseConsumptionResult>;
  /**
   * E4B — labor summary for this WO (getWoLaborSummary). Null when the read
   * failed/forbade — the tab then surfaces the matching `laborState` notice.
   * Entries carry the OPERATOR NAME (server-resolved); never a raw user UUID.
   */
  laborSummary?: WoLaborSummaryView | null;
  /** E4B — labor summary read state (ready/loading/error/forbidden). */
  laborState?: WoLaborState;
  /**
   * E4B — server-resolved production.consumption.write. When false the clock
   * in/out controls render DISABLED with a tooltip (never render-then-hide). The
   * action re-checks the permission server-side regardless.
   */
  canManageLabor?: boolean;
  /**
   * E4B — desktop clock-in/out. OWNED by the labor backend lane
   * (production/_actions/labor-actions.ts) and threaded in by the page; this
   * component never imports them directly. `source` is fixed to 'desktop' here —
   * the scanner uses a separate /api/scanner/labor slice (out of scope).
   */
  clockInAction?: (input: { woId: string; source: 'desktop' }) => Promise<WoClockInResult>;
  clockOutAction?: (input: { woId: string }) => Promise<WoClockOutResult>;
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  // E4B — clock in/out transient state. The summary is refreshed via
  // router.refresh() after a successful mutation (RSC re-reads getWoLaborSummary).
  const [laborBusy, setLaborBusy] = useState<null | 'in' | 'out'>(null);
  const [laborError, setLaborError] = useState<string | null>(null);
  const [busyOutputId, setBusyOutputId] = useState<string | null>(null);
  const [outputQaError, setOutputQaError] = useState<{ outputId: string; message: string } | null>(null);
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumePreselectId, setConsumePreselectId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<
    | { kind: 'output'; id: string; batchLabel: string }
    | { kind: 'waste'; id: string; categoryLabel: string }
    | null
  >(null);
  const [reverseTarget, setReverseTarget] = useState<
    { consumptionId: string; lpLabel: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { header: h } = data;

  // C-R2 — void/correction is offered only when an action context resolved
  // (RBAC still re-checked server-side; this only hides the affordance). The
  // header `closed` status drives the supervisor-authorization warning copy.
  const canVoid = actions !== null;
  const woClosed = h.status === 'closed';

  // Defensive correctionOf indexing — the WO-detail read MAY not expose
  // `correctionOfId` yet (the corrections backend lane extends its slice). When
  // absent every row renders normally; when present we (a) mark the original row
  // voided/struck-through, (b) label the counter row "Correction of #…", and (c)
  // hide the void affordance on an already-corrected original.
  type WithCorrection = { id: string; correctionOfId?: string | null };
  function buildCorrectionIndex(rows: ReadonlyArray<WithCorrection>) {
    const correctedOriginalIds = new Set<string>();
    const correctionOf = new Map<string, string>();
    for (const r of rows) {
      const ref = r.correctionOfId ?? null;
      if (ref) {
        correctedOriginalIds.add(ref);
        correctionOf.set(r.id, ref);
      }
    }
    return { correctedOriginalIds, correctionOf };
  }
  const outputCorr = buildCorrectionIndex(data.outputs as ReadonlyArray<WithCorrection>);
  const wasteCorr = buildCorrectionIndex(data.waste as ReadonlyArray<WithCorrection>);
  // C-R3 — defensive: the genealogy read MAY not expose `correctionOfId` yet (the
  // corrections backend lane extends its slice). When absent every input row
  // renders normally; when present we mark the original reversed/struck-through,
  // label the counter row, and hide the reverse affordance on an already-reversed
  // original. Same defensive contract as the R2 output/waste rows.
  const genealogyCorr = buildCorrectionIndex(data.genealogyInputs as ReadonlyArray<WithCorrection>);

  // Desktop consumption is offered only while the WO is actively running and an
  // action context resolved (RBAC is still enforced server-side — this only
  // hides the affordance; the action re-checks production.consumption.write).
  const canRecordConsumption =
    actions !== null && (h.status === 'in_progress' || h.status === 'paused');

  function openConsume(materialId: string | null) {
    setConsumePreselectId(materialId);
    setConsumeOpen(true);
  }

  const tabOrder: TabKey[] = [
    'overview',
    'consumption',
    'output',
    'waste',
    'downtime',
    'qa',
    'genealogy',
    'labor',
    'history',
  ];
  const counts: Partial<Record<TabKey, number>> = {
    consumption: data.components.length,
    output: data.outputs.length,
    waste: data.waste.length,
    downtime: data.downtime.length,
    qa: data.qa.total,
    // E4B — operator-count badge on the Labor tab (only when the summary read OK).
    labor: laborSummary?.entries.length,
    history: data.history.length,
  };

  const wasteTotalKg = data.waste.reduce((a, w) => a + w.qtyKg, 0);

  function releaseOutputQa(outputId: string, decision: ReleaseWoOutputQaDecision) {
    setBusyOutputId(outputId);
    setOutputQaError(null);
    startTransition(async () => {
      const result = await releaseOutputQaAction({ outputId, decision });
      if (result.ok) {
        setBusyOutputId(null);
        router.refresh();
        return;
      }
      const failure = result as Extract<OutputQaActionResult<ReleaseWoOutputQaResult>, { ok: false }>;
      const message =
        failure.reason === 'forbidden'
          ? labels.output.qaDenied
          : failure.message === 'invalid_state' || failure.message === 'on_hold_requires_holds_flow'
            ? labels.output.qaInvalidState
            : labels.output.qaError;
      setBusyOutputId(null);
      setOutputQaError({ outputId, message });
    });
  }

  // E4B — desktop clock-in/out. The action re-checks production.consumption.write
  // server-side; a forbidden result surfaces the permission copy. On success we
  // re-read the summary via router.refresh() (RSC re-runs getWoLaborSummary).
  function mapLaborError(error: 'forbidden' | 'invalid_input' | 'persistence_failed', kind: 'in' | 'out'): string {
    if (error === 'forbidden') return kind === 'in' ? labels.labor.clockInDenied : labels.labor.clockOutDenied;
    return labels.labor.error;
  }

  function clockIn() {
    if (!clockInAction || !canManageLabor || laborBusy !== null) return;
    setLaborBusy('in');
    setLaborError(null);
    startTransition(async () => {
      const result = await clockInAction({ woId: h.id, source: 'desktop' });
      setLaborBusy(null);
      if (result.ok) {
        router.refresh();
        return;
      }
      setLaborError(mapLaborError(result.error, 'in'));
    });
  }

  function clockOut() {
    if (!clockOutAction || !canManageLabor || laborBusy !== null) return;
    setLaborBusy('out');
    setLaborError(null);
    startTransition(async () => {
      const result = await clockOutAction({ woId: h.id });
      setLaborBusy(null);
      if (result.ok) {
        router.refresh();
        return;
      }
      setLaborError(mapLaborError(result.error, 'out'));
    });
  }

  const body = (
    <div className="flex flex-col gap-4">
      {/* B-2 — allergen changeover sign-off gate: shown when start/release was
          blocked by the `changeover_signoff_required` error (C4). Amber callout
          + deep-link to the changeovers register filtered to this WO's line. */}
      {changeoverGate ? (
        <div
          role="alert"
          data-testid="wo-changeover-gate"
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">⚠ {labels.changeoverGate.title}</p>
            <p className="mt-0.5 text-xs text-amber-800">{labels.changeoverGate.body}</p>
          </div>
          <Link
            href={
              changeoverGate.lineId
                ? `/production/changeovers?lineId=${encodeURIComponent(changeoverGate.lineId)}`
                : '/production/changeovers'
            }
            data-testid="wo-changeover-gate-link"
            className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {labels.changeoverGate.link}
          </Link>
        </div>
      ) : null}

      {/* WO header — code, name, status, key facts + wired action bar */}
      <Card data-testid="wo-detail-header" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-semibold text-slate-900">{h.woNumber}</span>
              <Badge variant={STATUS_VARIANT[h.status]}>{labels.status[h.status]}</Badge>
              {h.bomVersion !== null ? (
                <Badge variant="muted" className="text-[10px]">
                  {labels.overview.bomVersion} {h.bomVersion}
                </Badge>
              ) : null}
              {data.hasOutputWithoutConsumption ? (
                <Badge
                  variant="warning"
                  className="text-[10px]"
                  data-testid="wo-no-consumption-badge"
                  title={labels.output.noConsumptionTooltip}
                >
                  ⚠ {labels.output.noConsumptionBadge}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              <span className={h.productName ? undefined : 'text-slate-400'} title={h.productName ? undefined : h.productId}>
                {h.productName
                  ? `${h.productName}${h.itemCode ? ` (${h.itemCode})` : ''}`
                  : '—'}
              </span>
              {h.lineCode ? <> · {h.lineCode}</> : null}
              {' · '}
              {labels.overview.elapsed} <b>{h.elapsedMin === null ? '—' : `${h.elapsedMin} ${labels.overview.elapsedMin}`}</b>
            </p>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2" data-testid="wo-action-bar">
              <WoActionTrigger kind="start" label={labels.headerActions.start} />
              <WoActionTrigger kind="pause" label={labels.headerActions.pause} />
              <WoActionTrigger kind="resume" label={labels.headerActions.resume} />
              <WoActionTrigger kind="waste" label={labels.headerActions.waste} testid="wo-action-waste-header" />
              <WoActionTrigger kind="output" label={labels.headerActions.catchWeight} testid="wo-action-catchweight" />
              <WoActionTrigger kind="complete" label={labels.headerActions.complete} />
              <WoActionTrigger kind="close" label={labels.headerActions.close} />
              <WoActionTrigger kind="cancel" label={labels.headerActions.cancel} />
            </div>
          ) : null}
        </div>

        {/* Twin progress bars */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{labels.overview.consumption}</span>
              <b className="font-mono">{h.consumptionPct.toFixed(1)}%</b>
            </div>
            <ProgressBar pct={h.consumptionPct} label={`${labels.overview.consumption} ${h.consumptionPct}%`} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{labels.overview.output}</span>
              <b className="font-mono">
                {fmtQty(h.outputKg)} / {fmtQty(h.plannedQty)} {h.uom} ({h.outputPct.toFixed(1)}%)
              </b>
            </div>
            <ProgressBar pct={h.outputPct} label={`${labels.overview.output} ${h.outputPct}%`} />
          </div>
        </div>
      </Card>

      {/* 8 tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} data-testid="wo-detail-tabs">
        <TabsList className="flex flex-wrap gap-1 border-b border-slate-200" aria-label={labels.overview.summaryTitle}>
          {tabOrder.map((k) => (
            <TabsTrigger
              key={k}
              value={k}
              data-testid={`wo-detail-tab-${k}`}
              className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 transition data-[state=active]:border-slate-900 data-[state=active]:font-semibold data-[state=active]:text-slate-900"
            >
              {labels.tabs[k]}
              {counts[k] !== undefined ? (
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">
                  {counts[k]}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <Card data-testid="wo-tab-overview" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.overview.summaryTitle}</h3>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Fact label={labels.overview.wo} value={h.woNumber} mono />
              <Fact
                label={labels.overview.product}
                value={
                  h.productName
                    ? `${h.productName}${h.itemCode ? ` (${h.itemCode})` : ''}`
                    : '—'
                }
                mono={!h.productName}
              />
              <Fact label={labels.overview.line} value={h.lineCode ?? '—'} mono />
              <Fact
                label={labels.overview.machine}
                value={
                  h.machineCode
                    ? `${h.machineCode}${h.machineName ? ` — ${h.machineName}` : ''}`
                    : '—'
                }
                mono={!h.machineName}
              />
              <Fact label={labels.overview.planned} value={`${fmtQty(h.plannedQty)} ${h.uom}`} mono />
              <Fact label={labels.overview.output} value={`${fmtQty(h.outputKg)} ${h.uom}`} mono />
              <Fact label={labels.overview.plannedWindow} value={`${fmtDate(h.scheduledStart)} → ${fmtDate(h.scheduledEnd)}`} mono />
              <Fact label={labels.overview.actualStart} value={fmtDate(h.startedAt)} mono />
              <Fact
                label={labels.overview.allergens}
                value={h.allergenGate ? labels.overview.allergenYes : labels.overview.allergenNo}
              />
            </dl>

            {/* KPI mini-cards */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Kpi label={labels.overview.consumptionKpi} value={`${h.consumptionPct.toFixed(1)}%`} />
              <Kpi label={labels.overview.outputKpi} value={`${h.outputPct.toFixed(1)}%`} />
            </div>
          </Card>
        </TabsContent>

        {/* Consumption */}
        <TabsContent value="consumption" className="mt-4">
          <Card data-testid="wo-tab-consumption" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.consumption.title}>
              {canRecordConsumption ? (
                <button
                  type="button"
                  data-testid="wo-consumption-record"
                  onClick={() => openConsume(null)}
                  className="rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  {labels.consumption.record.trigger}
                </button>
              ) : (
                <DeferredButton label={labels.consumption.addAction} title={labels.deferredActionTitle} testid="wo-consumption-add" />
              )}
            </CardHead>
            {data.components.length === 0 ? (
              <Empty testid="wo-consumption-empty" copy={labels.consumption.empty} />
            ) : (
              <Table aria-label={labels.consumption.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.consumption.col.code}</TableHead>
                    <TableHead scope="col">{labels.consumption.col.component}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.consumption.col.planned}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.consumption.col.consumed}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.consumption.col.remaining}</TableHead>
                    <TableHead scope="col">{labels.consumption.col.progress}</TableHead>
                    {canRecordConsumption ? (
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">{labels.consumption.record.rowTrigger}</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.components.map((c) => (
                    <TableRow key={c.id} data-testid="wo-component-row">
                      <TableCell className="font-mono text-xs text-slate-500">
                        {c.itemCode ?? (
                          <span className="text-slate-400" title={c.productId}>—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800">
                        {c.itemName ?? c.materialName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(c.requiredQty)} {c.uom}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(c.consumedQty)} {c.uom}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmtQty(c.remainingQty)} {c.uom}</TableCell>
                      <TableCell className="w-40">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] tabular-nums text-slate-500">{c.progressPct}%</span>
                          <ProgressBar pct={c.progressPct} label={`${c.materialName} ${c.progressPct}%`} />
                        </div>
                      </TableCell>
                      {canRecordConsumption ? (
                        <TableCell className="text-right">
                          <button
                            type="button"
                            data-testid={`wo-consumption-record-row-${c.id}`}
                            onClick={() => openConsume(c.id)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            {labels.consumption.record.rowTrigger}
                          </button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* Output */}
        <TabsContent value="output" className="mt-4">
          <Card data-testid="wo-tab-output" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.output.title}>
              {data.hasOutputWithoutConsumption ? (
                <Badge
                  variant="warning"
                  className="text-[10px]"
                  data-testid="wo-output-no-consumption-badge"
                  title={labels.output.noConsumptionTooltip}
                >
                  ⚠ {labels.output.noConsumptionBadge}
                </Badge>
              ) : null}
              {actions ? (
                <WoActionTrigger kind="output" label={labels.output.addAction} variant="tab" testid="wo-output-add" />
              ) : null}
            </CardHead>
            {data.hasOutputWithoutConsumption ? (
              <p
                role="note"
                data-testid="wo-output-no-consumption-note"
                className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"
              >
                {labels.output.noConsumptionTooltip}
              </p>
            ) : null}
            {data.outputs.length === 0 ? (
              <Empty testid="wo-output-empty" copy={labels.output.empty} />
            ) : (
              <Table aria-label={labels.output.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.output.col.type}</TableHead>
                    <TableHead scope="col">{labels.output.col.product}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.output.col.qty}</TableHead>
                    <TableHead scope="col">{labels.output.col.batch}</TableHead>
                    <TableHead scope="col">{labels.output.col.expiry}</TableHead>
                    <TableHead scope="col">{labels.output.col.qa}</TableHead>
                    <TableHead scope="col">{labels.output.col.lp}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.output.col.qa}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.outputs.map((o) => {
                    const isCorrected = outputCorr.correctedOriginalIds.has(o.id);
                    const correctionRef = outputCorr.correctionOf.get(o.id);
                    return (
                    <TableRow
                      key={o.id}
                      data-testid="wo-output-row"
                      data-corrected={isCorrected ? 'true' : undefined}
                      className={isCorrected ? 'text-slate-400' : undefined}
                    >
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge variant="muted" className="text-[10px]">{o.outputType}</Badge>
                          {isCorrected ? (
                            <Badge variant="danger" className="text-[10px]" data-testid={`wo-output-voided-${o.id}`}>
                              {labels.voidCorrection.voidedBadge}
                            </Badge>
                          ) : null}
                          {correctionRef ? (
                            <Badge variant="info" className="text-[10px]" data-testid={`wo-output-correction-${o.id}`}>
                              {labels.voidCorrection.correctionOfLabel.replace('{ref}', correctionRef.slice(0, 8))}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {/* product code + name come from the wo_outputs ⨝ items join —
                            never render the uuid; missing item row → muted em-dash. */}
                        {o.productCode || o.productName ? (
                          <span title={o.productName ?? undefined}>
                            {o.productCode ?? o.productName}
                          </span>
                        ) : (
                          <span className="text-slate-400" title={o.productId}>—</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm tabular-nums${isCorrected ? ' line-through' : ''}`}>{fmtQty(o.qtyKg)} {o.uom}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{o.batchNumber}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{fmtDate(o.expiryDate)}</TableCell>
                      <TableCell><Badge variant="muted" className="text-[10px]">{o.qaStatus}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{o.lpId ? o.lpId.slice(0, 8) : '—'}</TableCell>
                      <TableCell className="text-right">
                        {canVoid && !isCorrected && !correctionRef ? (
                          <button
                            type="button"
                            data-testid={`wo-output-void-${o.id}`}
                            onClick={() =>
                              setVoidTarget({ kind: 'output', id: o.id, batchLabel: o.batchNumber })
                            }
                            className="mb-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            {labels.output.voidAction}
                          </button>
                        ) : null}
                        {o.qaStatus === 'PENDING' && !isCorrected ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex flex-wrap justify-end gap-1">
                              <button
                                type="button"
                                data-testid={`wo-output-qa-pass-${o.id}`}
                                disabled={isPending && busyOutputId === o.id}
                                onClick={() => releaseOutputQa(o.id, 'PASSED')}
                                className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {labels.output.qaPass}
                              </button>
                              <button
                                type="button"
                                data-testid={`wo-output-qa-fail-${o.id}`}
                                disabled={isPending && busyOutputId === o.id}
                                onClick={() => releaseOutputQa(o.id, 'FAILED')}
                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                {labels.output.qaFail}
                              </button>
                            </div>
                            {outputQaError?.outputId === o.id ? (
                              <p role="alert" data-testid={`wo-output-qa-error-${o.id}`} className="max-w-48 text-[11px] text-red-700">
                                {outputQaError.message}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* Waste */}
        <TabsContent value="waste" className="mt-4">
          <Card data-testid="wo-tab-waste" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.waste.title}>
              {actions ? (
                <WoActionTrigger kind="waste" label={labels.waste.addAction} variant="tab" testid="wo-waste-add" />
              ) : null}
            </CardHead>
            {data.waste.length === 0 ? (
              <Empty testid="wo-waste-empty" copy={labels.waste.empty} />
            ) : (
              <>
                <Table aria-label={labels.waste.title}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.waste.col.time}</TableHead>
                      <TableHead scope="col">{labels.waste.col.category}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.waste.col.qty}</TableHead>
                      <TableHead scope="col">{labels.waste.col.reason}</TableHead>
                      {canVoid ? (
                        <TableHead scope="col" className="text-right">
                          <span className="sr-only">{labels.waste.voidAction}</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.waste.map((w) => {
                      const isCorrected = wasteCorr.correctedOriginalIds.has(w.id);
                      const correctionRef = wasteCorr.correctionOf.get(w.id);
                      return (
                      <TableRow
                        key={w.id}
                        data-testid="wo-waste-row"
                        data-corrected={isCorrected ? 'true' : undefined}
                        className={isCorrected ? 'text-slate-400' : undefined}
                      >
                        <TableCell className="font-mono text-xs text-slate-500">{fmtDate(w.recordedAt)}</TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-1">
                            <Badge variant="warning" className="text-[10px]">{w.categoryName ?? '—'}</Badge>
                            {isCorrected ? (
                              <Badge variant="danger" className="text-[10px]" data-testid={`wo-waste-voided-${w.id}`}>
                                {labels.voidCorrection.voidedBadge}
                              </Badge>
                            ) : null}
                            {correctionRef ? (
                              <Badge variant="info" className="text-[10px]" data-testid={`wo-waste-correction-${w.id}`}>
                                {labels.voidCorrection.correctionOfLabel.replace('{ref}', correctionRef.slice(0, 8))}
                              </Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm tabular-nums${isCorrected ? ' line-through' : ''}`}>{fmtQty(w.qtyKg)} kg</TableCell>
                        <TableCell className="text-sm text-slate-600">{w.reasonNotes ?? '—'}</TableCell>
                        {canVoid ? (
                          <TableCell className="text-right">
                            {!isCorrected && !correctionRef ? (
                              <button
                                type="button"
                                data-testid={`wo-waste-void-${w.id}`}
                                onClick={() =>
                                  setVoidTarget({ kind: 'waste', id: w.id, categoryLabel: w.categoryName ?? '—' })
                                }
                                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                              >
                                {labels.waste.voidAction}
                              </button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="px-4 py-2 text-xs text-slate-500" data-testid="wo-waste-total">
                  {labels.waste.totalLabel.replace('{kg}', fmtQty(wasteTotalKg))}
                </p>
              </>
            )}
          </Card>
        </TabsContent>

        {/* Downtime */}
        <TabsContent value="downtime" className="mt-4">
          <Card data-testid="wo-tab-downtime" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.downtime.title}>
              <DeferredButton label={labels.downtime.addAction} title={labels.deferredActionTitle} testid="wo-downtime-add" />
            </CardHead>
            {data.downtime.length === 0 ? (
              <Empty testid="wo-downtime-empty" copy={labels.downtime.empty} />
            ) : (
              <Table aria-label={labels.downtime.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.downtime.col.category}</TableHead>
                    <TableHead scope="col">{labels.downtime.col.start}</TableHead>
                    <TableHead scope="col">{labels.downtime.col.end}</TableHead>
                    <TableHead scope="col" className="text-right">{labels.downtime.col.duration}</TableHead>
                    <TableHead scope="col">{labels.downtime.col.reason}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.downtime.map((d) => (
                    <TableRow key={d.id} data-testid="wo-downtime-row">
                      <TableCell><Badge variant="muted" className="text-[10px]">{d.categoryName ?? '—'}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{fmtDate(d.startedAt)}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {d.endedAt ? fmtDate(d.endedAt) : <Badge variant="info" className="text-[10px]">{labels.downtime.openLabel}</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{d.durationMin === null ? '—' : `${d.durationMin}m`}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.reasonNotes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* QA results */}
        <TabsContent value="qa" className="mt-4">
          <Card data-testid="wo-tab-qa" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.qa.title}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label={labels.qa.total} value={String(data.qa.total)} />
              <Kpi label={labels.qa.pass} value={String(data.qa.pass)} />
              <Kpi label={labels.qa.hold} value={String(data.qa.hold)} />
              <Kpi label={labels.qa.fail} value={String(data.qa.fail)} />
            </div>
            {data.qa.total === 0 ? (
              <p className="mt-4 text-center text-sm text-slate-500" data-testid="wo-qa-empty">
                {labels.qa.empty}
              </p>
            ) : null}
          </Card>
        </TabsContent>

        {/* Genealogy */}
        <TabsContent value="genealogy" className="mt-4">
          <Card data-testid="wo-tab-genealogy" className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{labels.genealogy.title}</h3>
            {data.genealogyInputs.length === 0 ? (
              <p className="text-center text-sm text-slate-500" data-testid="wo-genealogy-empty">
                {labels.genealogy.empty}
              </p>
            ) : (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.genealogy.inputsLabel} ({data.genealogyInputs.length})
                </p>
                <ul className="flex flex-col gap-2">
                  {data.genealogyInputs.map((g) => {
                    const isReversed = genealogyCorr.correctedOriginalIds.has(g.id);
                    const correctionRef = genealogyCorr.correctionOf.get(g.id);
                    return (
                    <li
                      key={g.id}
                      data-testid="wo-genealogy-input"
                      data-corrected={isReversed ? 'true' : undefined}
                      className={[
                        'flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm',
                        isReversed ? 'text-slate-400' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-slate-700">{g.lpId.slice(0, 8)}</span>
                        {isReversed ? (
                          <Badge variant="danger" className="text-[10px]" data-testid={`wo-genealogy-reversed-${g.id}`}>
                            {labels.genealogy.reversedBadge}
                          </Badge>
                        ) : null}
                        {correctionRef ? (
                          <Badge variant="info" className="text-[10px]" data-testid={`wo-genealogy-correction-${g.id}`}>
                            {labels.genealogy.correctionOfLabel.replace('{ref}', correctionRef.slice(0, 8))}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`font-mono tabular-nums text-slate-600${isReversed ? ' line-through' : ''}`}>{fmtQty(g.qtyKg)} kg</span>
                        <Badge variant={g.fefoAdherence ? 'success' : 'warning'} className="text-[10px]">
                          {g.fefoAdherence ? labels.genealogy.fefoOk : labels.genealogy.fefoDeviation}
                        </Badge>
                        {canVoid && !isReversed && !correctionRef ? (
                          <button
                            type="button"
                            data-testid={`wo-genealogy-reverse-${g.id}`}
                            onClick={() => setReverseTarget({ consumptionId: g.id, lpLabel: g.lpId.slice(0, 8) })}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            {labels.genealogy.reverseAction}
                          </button>
                        ) : null}
                      </span>
                    </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Labor (E4B) — getWoLaborSummary entries + clock in/out controls */}
        <TabsContent value="labor" className="mt-4">
          <Card data-testid="wo-tab-labor" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.labor.title}>
              <button
                type="button"
                data-testid="wo-labor-clock-in"
                disabled={!canManageLabor || laborBusy !== null}
                title={!canManageLabor ? labels.labor.disabledTooltip : undefined}
                aria-label={canManageLabor ? labels.labor.clockIn : `${labels.labor.clockIn} — ${labels.labor.disabledTooltip}`}
                onClick={clockIn}
                className="rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {laborBusy === 'in' ? labels.labor.clockingIn : labels.labor.clockIn}
              </button>
              <button
                type="button"
                data-testid="wo-labor-clock-out"
                disabled={!canManageLabor || laborBusy !== null}
                title={!canManageLabor ? labels.labor.disabledTooltip : undefined}
                aria-label={canManageLabor ? labels.labor.clockOut : `${labels.labor.clockOut} — ${labels.labor.disabledTooltip}`}
                onClick={clockOut}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {laborBusy === 'out' ? labels.labor.clockingOut : labels.labor.clockOut}
              </button>
            </CardHead>

            {laborError ? (
              <div
                role="alert"
                data-testid="wo-labor-error-banner"
                className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700"
              >
                {laborError}
              </div>
            ) : null}

            {laborState === 'loading' ? (
              <p data-testid="wo-labor-loading" role="status" aria-live="polite" className="px-4 py-10 text-center text-sm text-slate-500">
                {labels.labor.loading}
              </p>
            ) : laborState === 'forbidden' ? (
              <p data-testid="wo-labor-forbidden" role="alert" className="px-4 py-10 text-center text-sm text-amber-700">
                {labels.labor.forbidden}
              </p>
            ) : laborState === 'error' || laborSummary === null ? (
              <p data-testid="wo-labor-error" role="alert" className="px-4 py-10 text-center text-sm text-red-700">
                {labels.labor.error}
              </p>
            ) : laborSummary.entries.length === 0 ? (
              <Empty testid="wo-labor-empty" copy={labels.labor.empty} />
            ) : (
              <>
                <Table aria-label={labels.labor.title}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.labor.col.operator}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.labor.col.hours}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.labor.col.rate}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.labor.col.cost}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {laborSummary.entries.map((e, i) => (
                      <TableRow key={`${e.userName}-${i}`} data-testid="wo-labor-row">
                        <TableCell className="text-sm font-medium text-slate-800">{e.userName}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{fmtHours(e.hours)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {e.noRate ? (
                            <span className="text-amber-600" title={labels.labor.noRateTooltip}>
                              {labels.labor.noRate}
                            </span>
                          ) : (
                            `${fmtMoney(e.ratePerHour)} ${laborSummary.currency}`
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {e.noRate ? '—' : `${fmtMoney(e.cost)} ${laborSummary.currency}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center justify-end gap-6 border-t border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-600" data-testid="wo-labor-total-hours">
                    {labels.labor.totalHours} <b className="font-mono tabular-nums">{fmtHours(laborSummary.totalHours)}</b>
                  </span>
                  <span className="text-slate-900" data-testid="wo-labor-total-cost">
                    {labels.labor.totalCost}{' '}
                    <b className="font-mono tabular-nums">
                      {fmtMoney(laborSummary.totalCost)} {laborSummary.currency}
                    </b>
                  </span>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card data-testid="wo-tab-history" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <CardHead title={labels.history.title} />
            {data.history.length === 0 ? (
              <Empty testid="wo-history-empty" copy={labels.history.empty} />
            ) : (
              <Table aria-label={labels.history.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.history.col.time}</TableHead>
                    <TableHead scope="col">{labels.history.col.source}</TableHead>
                    <TableHead scope="col">{labels.history.col.action}</TableHead>
                    <TableHead scope="col">{labels.history.col.transition}</TableHead>
                    <TableHead scope="col">{labels.history.col.reason}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map((e) => (
                    <TableRow key={e.id} data-testid="wo-history-row">
                      <TableCell className="font-mono text-xs text-slate-500">{fmtDate(e.occurredAt)}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {e.source === 'status' ? labels.history.sourceStatus : labels.history.sourceExecution}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800">{e.action}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : e.toStatus}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{e.reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {canRecordConsumption ? (
        <RecordConsumptionModal
          open={consumeOpen}
          woId={h.id}
          components={data.components}
          preselectId={consumePreselectId}
          labels={labels.consumption.record}
          recordConsumptionAction={recordConsumptionAction}
          listConsumableLpsAction={listConsumableLpsAction}
          onClose={() => setConsumeOpen(false)}
          onRecorded={() => {
            setConsumeOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* C-R2 — void/correction modal (output e-sign, waste none). Mounted only
          while a row is selected so it never reads labels with no target. */}
      {canVoid && voidTarget !== null ? (
        <VoidCorrectionModal
          open
          target={voidTarget}
          woClosed={woClosed}
          labels={labels.voidCorrection}
          voidWoOutputAction={voidWoOutputAction}
          voidWasteEntryAction={voidWasteEntryAction}
          onClose={() => setVoidTarget(null)}
          onVoided={() => {
            setVoidTarget(null);
            router.refresh();
          }}
        />
      ) : null}

      {/* C-R3 — reverse-consumption modal (e-sign always required). Mounted only
          while a genealogy row is selected. */}
      {canVoid && reverseTarget !== null ? (
        <ReverseConsumptionModal
          open
          target={reverseTarget}
          woClosed={woClosed}
          labels={labels.reverseConsumption}
          reverseConsumptionAction={reverseConsumptionAction}
          onClose={() => setReverseTarget(null)}
          onReversed={() => {
            setReverseTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );

  // When the action context resolved, wrap the screen in the orchestrator so the
  // header / per-tab triggers can open the wired modals. Otherwise (read failed /
  // forbidden) the body renders with no action affordances.
  if (!actions) return body;

  // P0-UOM / B-3 — thread the WO's output unit + read-only product identity +
  // catch-weight mode to the Register-output modal. weight_mode now lands on the
  // typed header (get-work-order-detail.ts); the pack fields (output_uom /
  // net_qty_per_each / each_per_box) are still read defensively (the header type
  // may not expose them yet) and fall back to base-kg entry when absent.
  const hu = h as typeof h & {
    outputUom?: 'base' | 'each' | 'box';
    netQtyPerEach?: number | null;
    eachPerBox?: number | null;
  };
  const outputUom = {
    productCode: h.itemCode,
    productName: h.productName,
    outputUom: hu.outputUom ?? 'base',
    uomBase: h.uom,
    netQtyPerEach: hu.netQtyPerEach ?? null,
    eachPerBox: hu.eachPerBox ?? null,
    weightMode: h.weightMode,
    // SOFT-warning (owner decision — warn, never block): when the WO has no real
    // material consumption yet, the Register-output modal surfaces a non-blocking
    // "no genealogy link" notice with a [Continue anyway] affordance. Derived
    // server-side; the modal still submits.
    noConsumptionWarning: data.hasOutputWithoutConsumption
      ? {
          message: labels.output.noConsumptionTooltip,
          continueLabel: labels.output.noConsumptionContinue,
        }
      : null,
  } as const;

  return (
    <WoActionsProvider
      locale={actions.locale}
      woId={h.id}
      status={actions.status}
      permissions={actions.permissions}
      labels={actions.modalLabels}
      currentUserId={actions.currentUserId}
      downtimeCategories={actions.downtimeCategories}
      wasteCategories={actions.wasteCategories}
      defaultLineId={h.lineId}
      defaultProductId={h.productId}
      outputUom={outputUom}
      printFgLabelAction={printFgLabelAction}
      canPrintFgLabel={canPrintFgLabel}
    >
      {body}
    </WoActionsProvider>
  );
}

type RecordLabels = WoDetailLabels['consumption']['record'];

/**
 * M-5 — Desktop "Record consumption" modal. Mirrors the action-modals.tsx shape
 * (Modal + Select + Input + Button) but lives HERE (the task forbids touching
 * action-modals.tsx). All five UI states surface:
 *   loading  — LP candidate fetch in flight (lpStatus === 'loading')
 *   empty    — no FEFO candidates for the chosen component
 *   error    — LP fetch failed / verbatim submit error banner
 *   denied   — forbidden submit error → permission copy in the banner
 *   optimistic — submit pending (button disabled + "Recording…")
 * The optional LP list is FEFO-ordered (server) with the top row pre-suggested;
 * '— no LP —' is the explicit fallback (consume without decrementing an LP).
 */
function RecordConsumptionModal({
  open,
  woId,
  components,
  preselectId,
  labels,
  recordConsumptionAction,
  listConsumableLpsAction,
  onClose,
  onRecorded,
}: {
  open: boolean;
  woId: string;
  components: WoDetailComponent[];
  preselectId: string | null;
  labels: RecordLabels;
  recordConsumptionAction: (
    input: RecordDesktopConsumptionInput,
  ) => Promise<ConsumeActionResult<RecordDesktopConsumptionData>>;
  listConsumableLpsAction: (
    input: { woId: string; materialId: string },
  ) => Promise<ConsumeActionResult<{ lps: ConsumableLp[] }>>;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [materialId, setMaterialId] = useState('');
  const [qty, setQty] = useState('');
  const [lpId, setLpId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [lps, setLps] = useState<ConsumableLp[]>([]);
  const [lpStatus, setLpStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Warn-tier over-consumption: the write SUCCEEDED but landed above the warn
  // threshold (≤ approval threshold). Keep the modal open with a non-blocking
  // amber line; Close then runs the normal onRecorded refresh path.
  const [warning, setWarning] = useState<{ overPct: number; warnPct: number } | null>(null);

  const selected = useMemo(
    () => components.find((c) => c.id === materialId) ?? null,
    [components, materialId],
  );

  // (Re)initialise selection whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setMaterialId(preselectId ?? components[0]?.id ?? '');
    setQty('');
    setLpId('');
    setReasonCode('');
    setLps([]);
    setLpStatus('idle');
    setError(null);
    setWarning(null);
    setBusy(false);
  }, [open, preselectId, components]);

  // FEFO candidate fetch keyed on the chosen component.
  useEffect(() => {
    if (!open || !materialId) return;
    let cancelled = false;
    setLpStatus('loading');
    setLps([]);
    setLpId('');
    void listConsumableLpsAction({ woId, materialId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setLps(res.data.lps);
        setLpId(res.data.lps[0]?.lpId ?? '');
        setLpStatus('ready');
      } else {
        setLpStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, woId, materialId, listConsumableLpsAction]);

  const mapError = useCallback(
    (reason: string): string => {
      switch (reason) {
        case 'forbidden':
          return labels.errors.forbidden;
        case 'lp_unavailable':
          return labels.errors.lp_unavailable;
        case 'lp_not_released':
          return labels.errors.lp_not_released;
        case 'lp_expired':
          return labels.errors.lp_expired;
        case 'lp_locked':
          return labels.errors.lp_locked;
        case 'quality_hold_active':
          return labels.errors.quality_hold_active;
        case 'reason_required':
          return labels.errors.reason_required;
        case 'invalid_material':
          return labels.errors.invalid_material;
        case 'invalid_qty':
          return labels.errors.invalid_qty;
        default:
          return labels.errors.generic;
      }
    },
    [labels],
  );

  const canSubmit =
    materialId !== '' &&
    qty.trim() !== '' &&
    (lpId !== '' || reasonCode.trim() !== '') &&
    !busy &&
    warning === null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const clientOpId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${woId}-${materialId}-${Date.now()}`;
    const result = await recordConsumptionAction({
      woId,
      materialId,
      qty: qty.trim(),
      lpId: lpId || null,
      reasonCode: lpId ? null : reasonCode.trim(),
      clientOpId,
    });
    setBusy(false);
    if (result.ok) {
      if (result.data.warning) {
        // Warn tier: recorded + flagged — surface the amber line instead of
        // silently closing; the Close button runs onRecorded (close + refresh).
        setWarning({ overPct: result.data.warning.overPct, warnPct: result.data.warning.warnPct });
        return;
      }
      onRecorded();
      return;
    }
    setError(mapError(result.reason));
  }

  const materialOptions = components.map((c) => ({
    value: c.id,
    label: `${c.materialName} (${c.uom})`,
  }));

  const lpOptions = [
    { value: '', label: labels.lpNone },
    ...lps.map((lp, i) => ({
      value: lp.lpId,
      label:
        i === 0
          ? `${lp.lpNumber} · ${lp.qty} ${lp.uom}${lp.expiry ? ` · ${lp.expiry}` : ''} (${labels.lpSuggested})`
          : `${lp.lpNumber} · ${lp.qty} ${lp.uom}${lp.expiry ? ` · ${lp.expiry}` : ''}`,
    })),
  ];

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-consume" size="sm">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.subtitle}</p>
        {error ? (
          <div
            role="alert"
            data-testid="wo-consume-error"
            className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
        {warning ? (
          <div
            role="status"
            data-testid="wo-consume-warning"
            className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {labels.warningOver.replace('{pct}', warning.overPct.toFixed(2))}
          </div>
        ) : null}
        <div className="space-y-3">
          <div>
            <label htmlFor="wo-consume-material" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.material}
            </label>
            <Select
              id="wo-consume-material"
              aria-label={labels.material}
              value={materialId}
              onValueChange={setMaterialId}
              options={materialOptions}
              placeholder={labels.materialPlaceholder}
              disabled={busy || warning !== null}
            />
          </div>

          <div>
            <label htmlFor="wo-consume-qty" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.qty}
              {selected ? <span className="ml-1 text-xs font-normal text-slate-500">({selected.uom})</span> : null}
            </label>
            <Input
              id="wo-consume-qty"
              data-testid="wo-consume-qty"
              inputMode="decimal"
              value={qty}
              disabled={busy || warning !== null}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">{labels.qtyHint}</p>
          </div>

          <div>
            <label htmlFor="wo-consume-lp" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.lp}
            </label>
            {lpStatus === 'loading' ? (
              <p data-testid="wo-consume-lp-loading" className="text-sm text-slate-500">
                {labels.lpLoading}
              </p>
            ) : lpStatus === 'error' ? (
              <p data-testid="wo-consume-lp-error" className="text-sm text-red-600">
                {labels.lpError}
              </p>
            ) : (
              <>
                <Select
                  id="wo-consume-lp"
                  aria-label={labels.lp}
                  value={lpId}
                  onValueChange={setLpId}
                  options={lpOptions}
                  disabled={busy || warning !== null}
                />
                {lpStatus === 'ready' && lps.length === 0 ? (
                  <p data-testid="wo-consume-lp-empty" className="mt-1 text-xs text-slate-500">
                    {labels.lpEmpty}
                  </p>
                ) : null}
              </>
            )}
          </div>
          {lpId === '' ? (
            <div>
              <label htmlFor="wo-consume-reason" className="mb-1 block text-sm font-medium text-slate-700">
                {labels.reasonCode}
              </label>
              <Input
                id="wo-consume-reason"
                data-testid="wo-consume-reason"
                value={reasonCode}
                disabled={busy || warning !== null}
                placeholder={labels.reasonPlaceholder}
                onChange={(e) => setReasonCode(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {warning ? (
          // Recorded + flagged: the only exit is the normal close+refresh path.
          <Button type="button" data-testid="wo-consume-warning-close" onClick={onRecorded}>
            {labels.warningClose}
          </Button>
        ) : (
          <>
            <Button type="button" data-testid="wo-consume-cancel" disabled={busy} onClick={onClose}>
              {labels.cancel}
            </Button>
            <Button type="button" data-testid="wo-consume-submit" disabled={!canSubmit} onClick={handleSubmit} title={!canSubmit ? labels.formIncomplete : undefined}>
              {busy ? labels.submitting : labels.submit}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={['font-medium text-slate-800', mono ? 'font-mono' : ''].filter(Boolean).join(' ')}>{value}</dd>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CardHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children ? <div className="flex gap-2">{children}</div> : null}
    </div>
  );
}

function Empty({ testid, copy }: { testid: string; copy: string }) {
  return (
    <p data-testid={testid} className="px-4 py-10 text-center text-sm text-slate-500">
      {copy}
    </p>
  );
}
