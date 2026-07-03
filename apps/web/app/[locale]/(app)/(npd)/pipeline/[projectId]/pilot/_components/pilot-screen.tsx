'use client';

/**
 * NPD PILOT stage — PilotScreen (pilot_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:352-409 (PilotScreen)
 *
 * The prototype's lines 355-361 carry a "LEGACY — Phase 2 deprecation" banner.
 * That banner is INTENTIONALLY NOT translated: per the focused build mandate the
 * Pilot stage is a live production screen, so the banner is omitted.
 *
 * Parity checklist (translated to shadcn / @monopilot/ui — no verbatim JSX,
 * no raw <select>, no @radix-ui/* outside packages/ui):
 *   - blue info bar  "Scheduled pilot: <date> · <line> · <batch> · Supervisor"
 *   - "Pilot run plan" 4 label/value (LINE, BATCH SIZE, EXPECTED YIELD, DURATION)
 *   - "Material reservation" table (INGREDIENT, REQUIRED, AVAILABLE, RESERVED,
 *      STATUS badge "✓ Reserved" green / "⚠ Short" amber) + amber short callout
 *   - "Pilot checklist" (Checkbox items; checked = strikethrough)
 *
 * Money/qty render from NUMERIC decimal STRINGS (never JS floats). RBAC
 * (`permission_denied`) is resolved server-side in page.tsx and is never trusted
 * from the client. Writes go through the injected Server Action callbacks.
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { PilotRunModal, type PilotRunFormValues } from './pilot-run-modal';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type PilotMaterialStatus = 'reserved' | 'short';

/**
 * A production line option offered in the run-plan "Line" dropdown. Mirrors the
 * `ProductionLineOption` returned by the `listProductionLines()` Server Action;
 * the selected line's CODE is what persists into `pilot_runs.line`.
 */
export type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
  siteId?: string | null;
  siteCode?: string | null;
  siteName?: string | null;
};

/**
 * One recipe ingredient row, auto-derived from the latest non-draft formulation
 * version via `getPilotRecipeMaterials`. Required comes from the recipe;
 * Available/Reserved are stock at the chosen line's warehouse (0 / "—" until a
 * line is picked). These fields are DISPLAY-ONLY — the user never types them.
 */
export type PilotRecipeMaterialView = {
  ingredientCode: string;
  ingredientName: string;
  /** All qty fields are decimal STRINGS (bound straight from NUMERIC). */
  requiredKg: string;
  availableKg: string;
  reservedKg: string;
  /** Server-computed: reserved >= required → 'reserved', else 'short'. */
  status: PilotMaterialStatus;
};

export type PilotChecklistItemView = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type PilotRunView = {
  id: string;
  projectId: string;
  plannedDate: string | null;
  line: string | null;
  /** Decimal STRINGS (NUMERIC). */
  batchSizeKg: string | null;
  expectedYieldPct: string | null;
  durationHours: string | null;
  /** uuid of the supervisor (for pre-filling the edit modal); null = unassigned. */
  supervisorUserId: string | null;
  supervisorName: string | null;
  status: 'planned' | 'in_progress' | 'completed';
};

export type SupervisorOption = { id: string; name: string };

export type PilotWorkOrderLinkView = {
  id: string;
  woNumber: string;
};

export type PilotScreenData = {
  run: PilotRunView;
  checklist: PilotChecklistItemView[];
  /** Org users selectable as supervisor in the run-plan modal. */
  supervisors: SupervisorOption[];
  /** True when the caller holds npd.pilot.write (server-resolved, never client-trusted). */
  canWrite: boolean;
  /** Linked pilot work order, when one already exists for this project. */
  pilotWorkOrder?: PilotWorkOrderLinkView | null;
  /**
   * Recipe ingredients (auto from the latest non-draft formulation), already
   * resolved against the persisted line's warehouse on the server. The screen
   * re-derives these client-side whenever the line changes.
   */
  recipeMaterials?: PilotRecipeMaterialView[];
  /** Production-line options for the run-plan "Line" dropdown. */
  lines?: ProductionLineOption[];
  /** FG base UOM for batch-size display (from linked item.uom_base). */
  fgBaseUom?: string | null;
};

export type PilotLabels = {
  title: string;
  breadcrumb: string;
  scheduledPilot: string;
  /** "{date} · {line} · {batch} · {supervisor}" placeholders. */
  scheduledPilotBody: string;
  supervisorLabel: string;
  noSupervisor: string;
  planTitle: string;
  colLine: string;
  colBatchSize: string;
  colExpectedYield: string;
  colDuration: string;
  unitKg: string;
  unitPct: string;
  unitHours: string;
  materialTitle: string;
  colIngredient: string;
  colRequired: string;
  colAvailable: string;
  colReserved: string;
  colStatus: string;
  statusReserved: string;
  /** "{shortBy}" placeholder. */
  statusShort: string;
  /** "{shortBy}" placeholder. */
  shortCallout: string;
  checklistTitle: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  notSet: string;
  // Edit affordances (additive over the static prototype).
  planPilotRun: string;
  editPlan: string;
  // Modal fields.
  fieldPlannedDate: string;
  fieldLine: string;
  fieldLineRequired: string;
  /** Placeholder for the "Line" dropdown when nothing is selected. */
  linePlaceholder: string;
  /** Empty-state copy when the org has no production lines configured. */
  noLines: string;
  /** Hint shown above the materials table until a line is chosen. */
  selectLineHint: string;
  fieldBatchSize: string;
  /** FG base unit for batch label interpolation, e.g. "kg" / "each". */
  batchUnitLabel: string;
  fieldExpectedYield: string;
  fieldDuration: string;
  fieldSupervisor: string;
  // Run status control (gap 1): lets a planned run be marked completed from the UI
  // so the launch gate (PILOT_WO_NOT_LINKED) can clear. Values match the pilot_runs
  // CHECK constraint (migration 234) and the upsertPilotRun zod enum.
  fieldStatus: string;
  statusPlanned: string;
  statusInProgress: string;
  statusCompleted: string;
  save: string;
  saving: string;
  cancel: string;
  saveError: string;
  /** Pilot WO affordances (D9). */
  pilotWoTitle: string;
  createPilotWo: string;
  creatingPilotWo: string;
  pilotWoLinked: string;
  /** "{woNumber}" placeholder. */
  pilotWoLinkLabel: string;
  createPilotWoError: string;
  createPilotWoErrorNoFg: string;
  createPilotWoErrorRecipe: string;
  createPilotWoErrorForbidden: string;
  createPilotWoErrorPlanning: string;
  // W1-L2 specific error surfaces (optional: pages may omit; mapper falls back).
  createPilotWoErrorLineRequired?: string;
  createPilotWoErrorNoActiveSite?: string;
  createPilotWoErrorPlanningWrite?: string;
  createPilotWoErrorDocumentMaskMissing?: string;
  createPilotWoErrorFgItemMissing?: string;
};

export type ToggleChecklistCall = { itemId: string; isChecked: boolean };
export type ToggleChecklistOutcome = { ok: boolean; error?: string };

export type PilotActionOutcome = { ok: boolean; error?: string };

export type CreatePilotWoCall = { projectId: string };

export type CreatePilotWoOutcome =
  | { ok: true; workOrder: PilotWorkOrderLinkView; created: boolean }
  | { ok: false; error: string; message?: string };

export type PilotRunStatus = 'planned' | 'in_progress' | 'completed';

export type UpsertRunCall = {
  pilotRunId: string | null;
  plannedDate: string | null;
  /** The selected production line's CODE (persisted into pilot_runs.line). Required. */
  line: string;
  batchSizeKg: string | null;
  expectedYieldPct: string | null;
  durationHours: string | null;
  supervisorUserId: string | null;
  status: PilotRunStatus;
};

/**
 * Re-derive the recipe ingredients (+ availability for the chosen line's
 * warehouse) without a full RSC reload. Wired to `getPilotRecipeMaterials`
 * through an inline 'use server' adapter in page.tsx; the screen calls it when
 * the line changes so Available/Reserved track the new warehouse.
 */
export type LoadRecipeMaterialsCall = { lineCode: string | null };

/** Replace `{token}` placeholders in an i18n string (no inline strings). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

/** Format a decimal STRING qty with a unit; pure string work (no float math). */
function formatQty(value: string | null, unit: string, fallback: string): string {
  if (value === null || value.trim() === '') return fallback;
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  // Trim trailing zeros for display, but keep the exact integer/decimal text.
  const frac = fracRaw.replace(/0+$/, '');
  const body = frac ? `${intPart}.${frac}` : intPart;
  return `${negative ? '-' : ''}${body} ${unit}`;
}

// ─── Exact decimal-string compare/subtract (no float coercion) ────────────────
// Mirrors getPilotRun's helpers: shortBy / totalShort are now derived on the
// client from the recipe-loader strings, so the same 4-dp scaled-bigint math is
// used to keep money/qty exact (never JS floats).
const DEC_SCALE = 4n;
const DEC_FACTOR = 10n ** DEC_SCALE;

function parseDec(value: string | null): bigint {
  const trimmed = (value ?? '0').trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [int, fracRaw = ''] = unsigned.split('.');
  const frac = fracRaw.slice(0, Number(DEC_SCALE)).padEnd(Number(DEC_SCALE), '0');
  const scaled = BigInt(int + frac);
  return negative ? -scaled : scaled;
}

function formatDec(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const int = abs / DEC_FACTOR;
  const frac = (abs % DEC_FACTOR).toString().padStart(Number(DEC_SCALE), '0');
  return `${negative && scaled !== 0n ? '-' : ''}${int}.${frac}`;
}

/** Shortfall (required - reserved) when short, else null — decimal STRING. */
function shortByOf(m: PilotRecipeMaterialView): string | null {
  if (m.status !== 'short') return null;
  const diff = parseDec(m.requiredKg) - parseDec(m.reservedKg);
  return diff > 0n ? formatDec(diff) : null;
}

function statusVariant(status: PilotMaterialStatus): BadgeVariant {
  return status === 'short' ? 'warning' : 'success';
}

function statusToneClass(status: PilotMaterialStatus): string {
  return status === 'short' ? 'badge-amber' : 'badge-green';
}

function StateNotice({ state, labels }: { state: PageState; labels: PilotLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">🧪</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function PilotScreen({
  state = 'ready',
  data,
  labels,
  canWrite = false,
  supervisors = [],
  lines = [],
  recipeMaterials,
  pilotWorkOrder: pilotWorkOrderProp,
  projectId: projectIdProp,
  onToggleChecklistItem,
  onUpsertRun,
  onCreatePilotWo,
  onLoadRecipeMaterials,
  locale = 'en',
}: {
  state?: PageState;
  data: PilotScreenData | null;
  labels: PilotLabels;
  /** Server-resolved write capability; gates every edit affordance. */
  canWrite?: boolean;
  /** Org users selectable as supervisor (also used in the empty-state planner). */
  supervisors?: SupervisorOption[];
  /** Production-line options for the run-plan "Line" dropdown. */
  lines?: ProductionLineOption[];
  /**
   * Recipe ingredients pre-resolved on the server for the persisted line.
   * Overrides `data.recipeMaterials` when provided (test seam / explicit prop).
   */
  recipeMaterials?: PilotRecipeMaterialView[];
  /** Pilot WO link for empty-state rendering (when `data` is null). */
  pilotWorkOrder?: PilotWorkOrderLinkView | null;
  /** Project id for empty-state pilot WO create. */
  projectId?: string;
  onToggleChecklistItem?: (call: ToggleChecklistCall) => Promise<ToggleChecklistOutcome>;
  onUpsertRun?: (call: UpsertRunCall) => Promise<PilotActionOutcome>;
  onCreatePilotWo?: (call: CreatePilotWoCall) => Promise<CreatePilotWoOutcome>;
  /** Locale prefix for production WO deep links (e.g. "en"). */
  locale?: string;
  /**
   * Re-derive recipe ingredients + availability for a line. Called when the
   * line changes so Available/Reserved track the new warehouse without a full
   * RSC reload.
   */
  onLoadRecipeMaterials?: (call: LoadRecipeMaterialsCall) => Promise<PilotRecipeMaterialView[]>;
}) {
  // Optimistic checklist state keyed by item id (server is the source of truth).
  const [optimistic, setOptimistic] = React.useState<Record<string, boolean>>({});
  // Run-plan modal (planning a new run OR editing the existing one).
  const [runModalOpen, setRunModalOpen] = React.useState(false);
  const [pilotWo, setPilotWo] = React.useState<PilotWorkOrderLinkView | null>(
    data?.pilotWorkOrder ?? pilotWorkOrderProp ?? null,
  );
  const [pilotWoBusy, setPilotWoBusy] = React.useState(false);
  const [pilotWoError, setPilotWoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPilotWo(data?.pilotWorkOrder ?? pilotWorkOrderProp ?? null);
    setPilotWoError(null);
  }, [data?.pilotWorkOrder, pilotWorkOrderProp, data?.run.id]);

  // Recipe materials are auto-derived (NOT typed by the user). Seed from the
  // server-resolved prop, then re-derive client-side when the line changes.
  const initialMaterials = recipeMaterials ?? data?.recipeMaterials ?? [];
  const [materials, setMaterials] = React.useState<PilotRecipeMaterialView[]>(initialMaterials);

  React.useEffect(() => {
    setOptimistic({});
  }, [data?.run.id]);

  // Re-seed materials whenever the server prop (or run) changes.
  React.useEffect(() => {
    setMaterials(recipeMaterials ?? data?.recipeMaterials ?? []);
  }, [recipeMaterials, data?.recipeMaterials, data?.run.id]);

  const supervisorList = data?.supervisors ?? supervisors;
  const lineList = data?.lines ?? lines;
  // Server-resolved write capability. Each affordance is additionally gated on
  // the presence of its own action callback (so a screen wired with only one
  // action still renders correctly).
  const canEdit = data?.canWrite ?? canWrite;
  const canEditRun = canEdit && Boolean(onUpsertRun);
  const canCreatePilotWo = canEdit && Boolean(onCreatePilotWo);

  function pilotWoErrorMessage(error: string, message?: string): string {
    switch (error) {
      case 'no_linked_fg':
        return labels.createPilotWoErrorNoFg;
      case 'fg_item_missing':
        return labels.createPilotWoErrorFgItemMissing ?? labels.createPilotWoErrorNoFg;
      case 'recipe_not_ready':
        return labels.createPilotWoErrorRecipe;
      case 'forbidden':
        return labels.createPilotWoErrorForbidden;
      case 'forbidden_planning_write':
        return labels.createPilotWoErrorPlanningWrite ?? labels.createPilotWoErrorForbidden;
      case 'line_required':
        return labels.createPilotWoErrorLineRequired ?? labels.fieldLineRequired;
      case 'no_active_site':
        return labels.createPilotWoErrorNoActiveSite ?? labels.createPilotWoError;
      case 'document_mask_missing':
        return labels.createPilotWoErrorDocumentMaskMissing ?? labels.createPilotWoError;
      case 'wo_create_failed':
        return message
          ? `${labels.createPilotWoErrorPlanning}: ${message}`
          : labels.createPilotWoErrorPlanning;
      default:
        return labels.createPilotWoError;
    }
  }

  async function handleCreatePilotWo() {
    const pid = data?.run.projectId ?? projectIdProp;
    if (!onCreatePilotWo || !pid) return;
    setPilotWoBusy(true);
    setPilotWoError(null);
    try {
      const result = await onCreatePilotWo({ projectId: pid });
      if (!result.ok) {
        setPilotWoError(pilotWoErrorMessage(result.error, result.message));
        return;
      }
      setPilotWo(result.workOrder);
    } catch {
      setPilotWoError(labels.createPilotWoError);
    } finally {
      setPilotWoBusy(false);
    }
  }

  /**
   * Re-derive recipe availability for a newly-chosen line. Invoked from the
   * run-plan modal's Line dropdown so the table reflects the new warehouse's
   * stock the moment the line changes (no manual entry, no full reload).
   */
  async function handleLineChange(lineCode: string | null) {
    if (!onLoadRecipeMaterials) return;
    try {
      const next = await onLoadRecipeMaterials({ lineCode: lineCode || null });
      setMaterials(next);
    } catch {
      // Leave the prior materials in place on a transient failure.
    }
  }

  async function handleRunSubmit(values: PilotRunFormValues): Promise<PilotActionOutcome> {
    if (!onUpsertRun) return { ok: false, error: 'persistence_failed' };
    return onUpsertRun({
      pilotRunId: data?.run.id ?? null,
      plannedDate: values.plannedDate.trim() || null,
      line: values.line.trim(),
      batchSizeKg: values.batchSizeKg.trim() || null,
      expectedYieldPct: values.expectedYieldPct.trim() || null,
      durationHours: values.durationHours.trim() || null,
      supervisorUserId: values.supervisorUserId || null,
      status: values.status,
    });
  }

  if (state !== 'ready' || !data) {
    // Empty + writable → show the "+ Plan pilot run" planner instead of a dead end.
    const canPlan = state === 'empty' && canEditRun;
    const canCreateWoEmpty = state === 'empty' && canCreatePilotWo;
    return (
      <main
        data-testid="pilot-screen"
        aria-labelledby="pilot-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header className="flex flex-row items-start justify-between gap-4">
          <h1 id="pilot-title" className="page-title">
            {labels.title}
          </h1>
          {canPlan ? (
            <Button
              type="button"
              className="btn-sm"
              data-testid="plan-pilot-run-button"
              onClick={() => setRunModalOpen(true)}
            >
              {labels.planPilotRun}
            </Button>
          ) : null}
        </header>
        <StateNotice state={state} labels={labels} />
        {canCreateWoEmpty || pilotWo ? (
          <Card data-testid="pilot-wo-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <CardTitle>{labels.pilotWoTitle}</CardTitle>
              {canCreateWoEmpty && !pilotWo ? (
                <Button
                  type="button"
                  className="btn-sm"
                  data-testid="create-pilot-wo-button"
                  disabled={pilotWoBusy}
                  onClick={() => void handleCreatePilotWo()}
                >
                  {pilotWoBusy ? labels.creatingPilotWo : labels.createPilotWo}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {pilotWoError ? (
                <div role="alert" data-testid="create-pilot-wo-error" className="alert alert-red">
                  <div className="alert-title">{pilotWoError}</div>
                </div>
              ) : null}
              {pilotWo ? (
                <p data-testid="pilot-wo-link-row" className="text-sm">
                  <span className="muted">{labels.pilotWoLinked}</span>{' '}
                  <a
                    href={`/${locale}/production/wos/${pilotWo.id}`}
                    data-testid="pilot-wo-link"
                    className="font-mono font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                  >
                    {interpolate(labels.pilotWoLinkLabel, { woNumber: pilotWo.woNumber })}
                  </a>
                </p>
              ) : (
                <p className="muted text-sm" data-testid="pilot-wo-empty">
                  {labels.createPilotWo}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
        {canPlan ? (
          <PilotRunModal
            open={runModalOpen}
            onOpenChange={setRunModalOpen}
            labels={labels}
            run={null}
            supervisors={supervisorList}
            lines={lineList}
            batchUnitLabel={labels.batchUnitLabel ?? labels.unitKg}
            onSubmit={handleRunSubmit}
            onLineChange={handleLineChange}
          />
        ) : null}
      </main>
    );
  }

  const { run, checklist } = data;

  // Total shortfall + "line picked?" derived client-side from the recipe rows
  // (no float math). The callout only appears when a line is selected (otherwise
  // Available/Reserved are 0 and every row would falsely read "short").
  const lineSelected = Boolean(run.line);
  const totalShortScaled = lineSelected
    ? materials.reduce((acc, m) => {
        const sb = shortByOf(m);
        return sb ? acc + parseDec(sb) : acc;
      }, 0n)
    : 0n;
  const totalShortKg = totalShortScaled > 0n ? formatDec(totalShortScaled) : null;

  const supervisor = run.supervisorName ?? labels.noSupervisor;
  const infoBatch = formatQty(
    run.batchSizeKg,
    data?.fgBaseUom ?? labels.batchUnitLabel ?? labels.unitKg,
    labels.notSet,
  );
  // Resolve the persisted line CODE to a friendly "code — name" label for display.
  const lineOption = run.line ? lineList.find((l) => l.code === run.line) : undefined;
  const lineSiteSuffix =
    lineOption?.siteCode || lineOption?.siteName
      ? ` (${lineOption.siteCode ?? lineOption.siteName})`
      : '';
  const lineDisplay = run.line
    ? lineOption
      ? `${lineOption.code} — ${lineOption.name}${lineSiteSuffix}`
      : run.line
    : labels.notSet;
  const scheduledBody = interpolate(labels.scheduledPilotBody, {
    date: run.plannedDate ?? labels.notSet,
    line: lineDisplay,
    batch: infoBatch,
    supervisor,
  });

  async function handleToggle(item: PilotChecklistItemView, next: boolean) {
    if (!onToggleChecklistItem) return;
    setOptimistic((prev) => ({ ...prev, [item.id]: next }));
    try {
      const result = await onToggleChecklistItem({ itemId: item.id, isChecked: next });
      if (!result.ok) {
        // Roll back on failure (server remains the source of truth).
        setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
      }
    } catch {
      setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
    }
  }

  return (
    <main
      data-testid="pilot-screen"
      aria-labelledby="pilot-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head" data-region="page-head">
        <nav aria-label="breadcrumb" className="breadcrumb">
          {labels.breadcrumb}
        </nav>
        <h1 id="pilot-title" className="page-title mt-1">
          {labels.title}
        </h1>
      </header>

      {/* Blue info bar — prototype line 362. */}
      <div role="note" data-testid="pilot-info-bar" className="alert alert-blue">
        <strong>{labels.scheduledPilot}</strong> <span data-testid="pilot-info-body">{scheduledBody}</span>
      </div>

      <Card data-testid="pilot-wo-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>{labels.pilotWoTitle}</CardTitle>
          {canCreatePilotWo && !pilotWo ? (
            <Button
              type="button"
              className="btn-sm"
              data-testid="create-pilot-wo-button"
              disabled={pilotWoBusy}
              onClick={() => void handleCreatePilotWo()}
            >
              {pilotWoBusy ? labels.creatingPilotWo : labels.createPilotWo}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {pilotWoError ? (
            <div role="alert" data-testid="create-pilot-wo-error" className="alert alert-red">
              <div className="alert-title">{pilotWoError}</div>
            </div>
          ) : null}
          {pilotWo ? (
            <p data-testid="pilot-wo-link-row" className="text-sm">
              <span className="muted">{labels.pilotWoLinked}</span>{' '}
              <a
                href={`/${locale}/production/wos/${pilotWo.id}`}
                data-testid="pilot-wo-link"
                className="font-mono font-medium text-[var(--primary)] underline-offset-2 hover:underline"
              >
                {interpolate(labels.pilotWoLinkLabel, { woNumber: pilotWo.woNumber })}
              </a>
            </p>
          ) : (
            <p className="muted text-sm" data-testid="pilot-wo-empty">
              {labels.createPilotWo}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pilot run plan — prototype lines 364-372. */}
      <Card data-testid="pilot-plan-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>{labels.planTitle}</CardTitle>
          {canEditRun ? (
            <Button
              type="button"
              className="btn-sm btn-ghost"
              data-testid="edit-pilot-plan-button"
              onClick={() => setRunModalOpen(true)}
            >
              {labels.editPlan}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="pilot-plan-grid">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colLine}</div>
              <div className="font-medium" data-testid="pilot-plan-line">{lineDisplay}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colBatchSize}</div>
              <div className="mono font-medium">
                {formatQty(
                  run.batchSizeKg,
                  data?.fgBaseUom ?? labels.batchUnitLabel ?? labels.unitKg,
                  labels.notSet,
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colExpectedYield}</div>
              <div className="mono font-medium">{formatQty(run.expectedYieldPct, labels.unitPct, labels.notSet)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colDuration}</div>
              <div className="mono font-medium">{formatQty(run.durationHours, labels.unitHours, labels.notSet)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/*
        Material reservation — prototype lines 374-389.
        Rows are AUTO-DERIVED from the recipe (one per formulation ingredient);
        Required/Available/Reserved are READ-ONLY display cells — the user no
        longer types them, and there is no "+ Add material" affordance.
      */}
      <Card data-testid="pilot-material-card">
        <CardHeader>
          <CardTitle>{labels.materialTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!lineSelected ? (
            <div
              role="note"
              data-testid="pilot-select-line-hint"
              className="alert alert-blue m-4"
            >
              {labels.selectLineHint}
            </div>
          ) : null}
          <Table data-testid="pilot-material-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colIngredient}</TableHead>
                <TableHead scope="col">{labels.colRequired}</TableHead>
                <TableHead scope="col">{labels.colAvailable}</TableHead>
                <TableHead scope="col">{labels.colReserved}</TableHead>
                <TableHead scope="col">{labels.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((m) => {
                // Until a line is picked we have no warehouse, so Available /
                // Reserved are unknown — render them as the "—" placeholder and
                // suppress the (meaningless) short badge.
                const shortBy = lineSelected ? shortByOf(m) : null;
                const effectiveStatus: PilotMaterialStatus = lineSelected ? m.status : 'reserved';
                return (
                  <TableRow
                    key={m.ingredientCode}
                    data-testid="pilot-material-row"
                    data-status={lineSelected ? m.status : 'unknown'}
                  >
                    {/*
                      Single "Ingredient" cell (prototype parity) — descriptive
                      name primary, the RM code as a small traceability subtitle.
                    */}
                    <TableCell className="font-medium">
                      <span data-testid="pilot-material-name">{m.ingredientName}</span>
                      {m.ingredientCode && m.ingredientCode !== m.ingredientName ? (
                        <span className="muted text-[11px] block" data-testid="pilot-material-code">
                          {m.ingredientCode}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="mono tabular-nums" data-testid="pilot-material-required">
                      {formatQty(m.requiredKg, labels.unitKg, labels.notSet)}
                    </TableCell>
                    <TableCell className="mono tabular-nums" data-testid="pilot-material-available">
                      {lineSelected ? formatQty(m.availableKg, labels.unitKg, labels.notSet) : labels.notSet}
                    </TableCell>
                    <TableCell className="mono tabular-nums" data-testid="pilot-material-reserved">
                      {lineSelected ? formatQty(m.reservedKg, labels.unitKg, labels.notSet) : labels.notSet}
                    </TableCell>
                    <TableCell>
                      {lineSelected ? (
                        <Badge
                          variant={statusVariant(effectiveStatus)}
                          className={statusToneClass(effectiveStatus)}
                          data-status={effectiveStatus}
                          data-testid="pilot-material-status"
                        >
                          {effectiveStatus === 'short'
                            ? interpolate(labels.statusShort, {
                                shortBy: formatQty(shortBy, labels.unitKg, ''),
                              }).trim()
                            : labels.statusReserved}
                        </Badge>
                      ) : (
                        <span className="muted">{labels.notSet}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalShortKg ? (
            <div role="alert" data-testid="pilot-short-callout" className="alert alert-amber m-4">
              {interpolate(labels.shortCallout, {
                shortBy: formatQty(totalShortKg, labels.unitKg, ''),
              }).trim()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Pilot checklist — prototype lines 391-407. */}
      <Card data-testid="pilot-checklist-card">
        <CardHeader>
          <CardTitle>{labels.checklistTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul data-testid="pilot-checklist" className="divide-y">
            {checklist.map((item) => {
              const checked = item.id in optimistic ? optimistic[item.id]! : item.isChecked;
              return (
                <li
                  key={item.id}
                  data-testid="pilot-checklist-item"
                  data-checked={checked}
                  className="flex items-center gap-3 py-2"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!onToggleChecklistItem}
                    onCheckedChange={(next) => handleToggle(item, next)}
                    aria-label={item.label}
                  />
                  <span
                    className={checked ? 'muted line-through' : ''}
                    data-testid="pilot-checklist-label"
                  >
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {canEditRun ? (
        <PilotRunModal
          open={runModalOpen}
          onOpenChange={setRunModalOpen}
          labels={labels}
          run={run}
          supervisors={supervisorList}
          lines={lineList}
          batchUnitLabel={data?.fgBaseUom ?? labels.batchUnitLabel ?? labels.unitKg}
          onSubmit={handleRunSubmit}
          onLineChange={handleLineChange}
        />
      ) : null}
    </main>
  );
}

export default PilotScreen;
