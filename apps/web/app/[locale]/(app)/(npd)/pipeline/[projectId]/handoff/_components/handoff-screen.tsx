'use client';

/**
 * NPD HANDOFF stage — HandoffScreen (HandoffScreen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)
 *
 * The prototype's lines 478-484 carry a "LEGACY — Phase 2 deprecation" banner.
 * That banner is INTENTIONALLY NOT translated: per the focused build mandate the
 * Handoff stage is a live production screen, so the banner is OMITTED.
 *
 * Parity checklist (translated to shadcn / @monopilot/ui — no verbatim JSX,
 * no raw <select>, no @radix-ui/* outside packages/ui):
 *   - green "Ready to promote" success bar (line 485) when the checklist is
 *     complete + gates pass; an amber "blocked" bar otherwise
 *   - "Handoff checklist" card (line 488) — Checkbox items (checked = ✓)
 *   - two cards: "Destination BOM" label/value table (lines 505-516) +
 *     "What happens on promote" ordered list (lines 517-527)
 *   - footer: "Export handoff packet" + "✓ Promote to production BOM" (lines
 *     530-533); Promote disabled until the checklist is complete + gates pass
 *
 * RBAC (`permission_denied`) is resolved server-side in page.tsx and is never
 * trusted from the client. Writes go through the injected Server Action callbacks.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';

import { downloadJson, fileSafe, isoDateStamp } from '../../../../../../../../lib/shared/download';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** Release-gate codes surfaced on the screen (mirror of the preflight blockers). */
export type ReleaseGateCode =
  | 'G4_REQUIRED'
  | 'FG_CANDIDATE_REQUIRED'
  | 'ACTIVE_SHARED_BOM_REQUIRED'
  | 'FACTORY_SPEC_REQUIRED'
  | 'V18_OPEN_HIGH_RISK';

export type HandoffReleaseGateView = {
  code: ReleaseGateCode;
  met: boolean;
};

export type HandoffChecklistItemView = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type HandoffDestinationBomView = {
  bomCode: string | null;
  productSku: string | null;
  productName: string | null;
  effectiveFrom: string | null;
  warehouseName: string | null;
  releaseStatus: string | null;
  releaseBomHeaderId: string | null;
};

export type HandoffScreenData = {
  checklistId: string;
  projectId: string;
  bomVerificationStatus: string | null;
  promoteToProductionDate: string | null;
  ready: boolean;
  promoted: boolean;
  checklist: HandoffChecklistItemView[];
  destinationBom: HandoffDestinationBomView;
  /** Per-gate release-preflight status (surfaces WHY Promote is blocked). */
  releaseGates: HandoffReleaseGateView[];
  /** True ⇔ every release gate is met. */
  releaseGatesMet: boolean;
};

export type HandoffLabels = {
  title: string;
  breadcrumb: string;
  readyTitle: string;
  readyBody: string;
  blockedTitle: string;
  blockedBody: string;
  promotedTitle: string;
  promotedBody: string;
  // Release-gate panel (dead-end repair: surface WHY Promote is blocked).
  releaseGatesTitle: string;
  releaseGatesBody: string;
  gateMet: string;
  gateUnmet: string;
  gateRemediation: string;
  'gate.G4_REQUIRED': string;
  'gate.FG_CANDIDATE_REQUIRED': string;
  'gate.ACTIVE_SHARED_BOM_REQUIRED': string;
  'gate.FACTORY_SPEC_REQUIRED': string;
  'gate.V18_OPEN_HIGH_RISK': string;
  // Post-promote next-step CTA (kill the dead end after a successful promote).
  promotedNextTitle: string;
  promotedNextBody: string;
  advanceToLaunched: string;
  viewBom: string;
  viewProject: string;
  checklistTitle: string;
  destinationTitle: string;
  whatHappensTitle: string;
  bomCode: string;
  productSku: string;
  effectiveFrom: string;
  productionLine: string;
  warehouse: string;
  releaseStatus: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  step5: string;
  step6: string;
  exportPacket: string;
  promote: string;
  promoting: string;
  promoteError: string;
  // "Generate production BOM" step — breaks the handoff deadlock (the
  // ACTIVE_SHARED_BOM / FACTORY_SPEC gates were only ever satisfied INSIDE
  // promote, so promote could never be reached). Generate builds the BOM first.
  generateBom: string;
  generating: string;
  /** Helper line explaining the two-step flow (Generate → Technical → Promote). */
  generateBomHint: string;
  /** Special-cased error message when no recipe is locked yet. */
  generateNoRecipe: string;
  /** Special-cased error when the FG has no packs-per-box set (S0a contract). */
  generatePacksPerBoxRequired: string;
  generateError: string;
  /** W5 hard gate: packaging components not linked to items ({components} placeholder). */
  generatePackagingUnlinked?: string;
  /** W5 routing-bridge warnings (BOM succeeded, routing skipped). */
  generateWarningNoLine?: string;
  generateWarningNoProcesses?: string;
  // Post-promote success panel (auto-built production BOM result).
  promoteSuccessTitle: string;
  /** Body with the {code} placeholder for the generated production FG code. */
  promoteSuccessBody: string;
  promoteSuccessViewBom: string;
  // Inline yield/waste prompt (shown when the recipe had no target yield).
  yieldPromptTitle: string;
  yieldPromptBody: string;
  yieldLabel: string;
  yieldSave: string;
  yieldSkip: string;
  yieldSaving: string;
  yieldSaved: string;
  yieldError: string;
  yieldErrorInvalidInput?: string;
  yieldErrorForbidden?: string;
  yieldErrorNotFound?: string;
  yieldErrorPersistenceFailed?: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  notSet: string;
};

/**
 * Locale-prefixed navigation targets, resolved at the server boundary (page.tsx)
 * so the client island never has to guess locale or route shape. Used by the
 * release-gate remediation links + the post-promote next-step CTA.
 */
export type HandoffHrefs = {
  /** Technical → factory specs (FACTORY_SPEC_REQUIRED remediation). */
  factorySpecs: string;
  /** Technical → BOM list (ACTIVE_SHARED_BOM_REQUIRED remediation + post-promote view). */
  bom: string;
  /** The NPD project root (where the existing "Advance stage →" flow lives). */
  project: string;
  /** The project gate screen (G4_REQUIRED / risk remediation). */
  gate: string;
};

export type PromoteCall = { projectId: string };
export type PromoteOutcome = {
  ok: boolean;
  error?: string;
  /** On success, the auto-built production-BOM result (contract from promoteToProduction). */
  productionCode?: string | null;
  bomHeaderId?: string | null;
  yieldPromptRequired?: boolean;
  /** Locale-prefixed Technical BOM-detail href for `productionCode` (resolved server-side). */
  bomHref?: string | null;
};
export type GenerateCall = { projectId: string };
export type GenerateOutcome = {
  ok: boolean;
  error?: string;
  /** W5: packaging component names blocking the hard gate (error === 'packaging_unlinked'). */
  unlinkedComponents?: string[];
  /** W5: routing-bridge warning codes on success ('no_line' | 'no_processes'). */
  warnings?: string[];
  /** On success, the materialized production-BOM result (mirror of promote). */
  productionCode?: string | null;
  bomHeaderId?: string | null;
  yieldPromptRequired?: boolean;
};
export type ToggleChecklistCall = { itemId: string; isChecked: boolean };
export type ToggleChecklistOutcome = { ok: boolean; error?: string };
export type UpdateBomYieldCall = { bomHeaderId: string; yieldPct: number };
export type UpdateBomYieldOutcome = { ok: boolean; error?: string };

function yieldErrorMessage(labels: HandoffLabels, code: string): string {
  switch (code) {
    case 'invalid_input':
      return labels.yieldErrorInvalidInput ?? labels.yieldError;
    case 'forbidden':
      return labels.yieldErrorForbidden ?? labels.yieldError;
    case 'not_found':
      return labels.yieldErrorNotFound ?? labels.yieldError;
    case 'persistence_failed':
      return labels.yieldErrorPersistenceFailed ?? labels.yieldError;
    default:
      return labels.yieldErrorPersistenceFailed ?? labels.yieldError;
  }
}

/**
 * Build the machine-readable handoff packet from data the screen already holds
 * (no backend round-trip). Keys are stable English identifiers (export format,
 * not UI copy). `effectiveChecklist` is the optimistic-projected checklist so the
 * packet reflects what the user currently sees. `generatedAt` is injectable for
 * deterministic tests.
 */
export function buildHandoffPacket(
  data: HandoffScreenData,
  effectiveChecklist: HandoffChecklistItemView[],
  generatedAt: string,
): Record<string, unknown> {
  return {
    packet: 'npd.handoff',
    version: 1,
    generatedAt,
    project: {
      projectId: data.projectId,
      productSku: data.destinationBom.productSku,
      productName: data.destinationBom.productName,
    },
    status: {
      ready: effectiveChecklist.length > 0 && effectiveChecklist.every((i) => i.isChecked),
      promoted: data.promoted,
      bomVerificationStatus: data.bomVerificationStatus,
      promoteToProductionDate: data.promoteToProductionDate,
    },
    destinationBom: {
      bomCode: data.destinationBom.bomCode,
      effectiveFrom: data.destinationBom.effectiveFrom,
      warehouseName: data.destinationBom.warehouseName,
      releaseStatus: data.destinationBom.releaseStatus,
      releaseBomHeaderId: data.destinationBom.releaseBomHeaderId,
    },
    checklist: effectiveChecklist
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((i) => ({ label: i.label, checked: i.isChecked, displayOrder: i.displayOrder })),
  };
}

/** Filename for the downloaded packet: `handoff-<sku-or-projectId>-<date>.json`. */
export function handoffPacketFilename(data: HandoffScreenData, dateStamp: string): string {
  const code = data.destinationBom.productSku ?? data.projectId;
  return `handoff-${fileSafe(code)}-${dateStamp}.json`;
}

function StateNotice({ state, labels }: { state: PageState; labels: HandoffLabels }) {
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
        <div className="empty-state-icon" aria-hidden="true">📦</div>
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

/** Post-promote auto-built BOM result, held in client state to drive the success panel. */
type PromoteSuccess = {
  productionCode: string | null;
  bomHeaderId: string | null;
  bomHref: string | null;
  yieldPromptRequired: boolean;
};

export function HandoffScreen({
  state = 'ready',
  data,
  labels,
  hrefs,
  onPromote,
  onGenerate,
  onToggleChecklistItem,
  onUpdateBomYield,
}: {
  state?: PageState;
  data: HandoffScreenData | null;
  labels: HandoffLabels;
  hrefs?: HandoffHrefs;
  onPromote?: (call: PromoteCall) => Promise<PromoteOutcome>;
  onGenerate?: (call: GenerateCall) => Promise<GenerateOutcome>;
  onToggleChecklistItem?: (call: ToggleChecklistCall) => Promise<ToggleChecklistOutcome>;
  onUpdateBomYield?: (call: UpdateBomYieldCall) => Promise<UpdateBomYieldOutcome>;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = React.useState<Record<string, boolean>>({});
  const [promoting, setPromoting] = React.useState(false);
  const [promoteError, setPromoteError] = React.useState<string | null>(null);
  // "Generate production BOM" step (deadlock break) — its own pending + error state.
  const [generating, setGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState<string | null>(null);
  const [generateUnlinked, setGenerateUnlinked] = React.useState<string[]>([]);
  const [generateWarnings, setGenerateWarnings] = React.useState<string[]>([]);
  // Auto-built production-BOM result + the inline yield-prompt sub-state.
  const [promoteSuccess, setPromoteSuccess] = React.useState<PromoteSuccess | null>(null);
  const [yieldInput, setYieldInput] = React.useState('');
  const [yieldSaving, setYieldSaving] = React.useState(false);
  const [yieldSaved, setYieldSaved] = React.useState(false);
  const [yieldDismissed, setYieldDismissed] = React.useState(false);
  const [yieldError, setYieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOptimistic({});
    setPromoteError(null);
    setGenerating(false);
    setGenerateError(null);
    setPromoteSuccess(null);
    setYieldInput('');
    setYieldSaving(false);
    setYieldSaved(false);
    setYieldDismissed(false);
    setYieldError(null);
  }, [data?.checklistId]);

  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="handoff-screen"
        aria-labelledby="handoff-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="handoff-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  const { checklist, destinationBom, promoted, releaseGates } = data;

  // Optimistic checklist projection (server is the source of truth).
  const effectiveChecklist = checklist.map((item) => ({
    ...item,
    isChecked: item.id in optimistic ? optimistic[item.id]! : item.isChecked,
  }));
  const allChecked =
    effectiveChecklist.length > 0 && effectiveChecklist.every((i) => i.isChecked);
  // Promote is gated on BOTH the handoff checklist AND every release gate. The
  // server preflight remains authoritative; this mirror just stops the button
  // looking "permanently disabled with no reason" (the reported dead end).
  const releaseGatesMet = releaseGates.length > 0 && releaseGates.every((g) => g.met);
  const canPromote = allChecked && releaseGatesMet && !promoted;
  // Deadlock break: the production BOM is the ACTIVE_SHARED_BOM gate. When it is
  // NOT met (and not yet promoted) the user must GENERATE the BOM first — only
  // then does the gate flip to met and the Promote button enable.
  const bomGate = releaseGates.find((g) => g.code === 'ACTIVE_SHARED_BOM_REQUIRED');
  const showGenerate = !promoted && !!bomGate && !bomGate.met;

  /** Remediation link for an unmet gate (locale-prefixed, resolved server-side). */
  function gateRemediationHref(code: ReleaseGateCode): string | null {
    if (!hrefs) return null;
    switch (code) {
      case 'FACTORY_SPEC_REQUIRED':
        return hrefs.factorySpecs;
      case 'ACTIVE_SHARED_BOM_REQUIRED':
        return hrefs.bom;
      case 'G4_REQUIRED':
      case 'V18_OPEN_HIGH_RISK':
        return hrefs.gate;
      default:
        return null;
    }
  }

  function gateLabel(code: ReleaseGateCode): string {
    return labels[`gate.${code}` as keyof HandoffLabels] ?? code;
  }

  async function handleToggle(item: HandoffChecklistItemView, next: boolean) {
    if (!onToggleChecklistItem) return;
    setOptimistic((prev) => ({ ...prev, [item.id]: next }));
    try {
      const result = await onToggleChecklistItem({ itemId: item.id, isChecked: next });
      if (!result.ok) {
        setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
      }
    } catch {
      setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
    }
  }

  async function handlePromote() {
    if (!onPromote || !canPromote || promoting) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      const result = await onPromote({ projectId: data!.projectId });
      if (!result.ok) {
        setPromoteError(result.error ?? 'error');
      } else {
        // Surface the auto-built production-BOM result (FG code + BOM link) and,
        // when the recipe had no target yield, the inline yield prompt. Held in
        // client state so it survives the router.refresh() below.
        setPromoteSuccess({
          productionCode: result.productionCode ?? null,
          bomHeaderId: result.bomHeaderId ?? null,
          bomHref: result.bomHref ?? null,
          yieldPromptRequired: result.yieldPromptRequired === true,
        });
        setYieldDismissed(false);
        setYieldSaved(false);
        setYieldError(null);
        // Re-fetch the RSC tree so the "Promoted" bar + next-step CTA appear
        // immediately (kills the "promote does nothing visible" symptom).
        router.refresh();
      }
    } catch {
      setPromoteError('error');
    } finally {
      setPromoting(false);
    }
  }

  async function handleGenerate() {
    if (!onGenerate || generating) return;
    setGenerating(true);
    setGenerateError(null);
    setGenerateUnlinked([]);
    setGenerateWarnings([]);
    try {
      const result = await onGenerate({ projectId: data!.projectId });
      if (!result.ok) {
        // Special-case no_recipe + packs_per_box_required (S0a contract) and the
        // W5 packaging hard gate; everything else falls back to the generic copy.
        if (result.error === 'packaging_unlinked') {
          setGenerateUnlinked(result.unlinkedComponents ?? []);
        }
        setGenerateError(
          result.error === 'no_recipe' ? 'no_recipe'
          : result.error === 'packs_per_box_required' ? 'packs_per_box_required'
          : result.error === 'packaging_unlinked' ? 'packaging_unlinked'
          : 'error',
        );
      } else {
        setGenerateWarnings(result.warnings ?? []);
        // The BOM now exists. Surface the same auto-built result panel + yield
        // prompt the promote flow uses (so a yield-less recipe can be corrected
        // here too), then refresh the RSC tree so the gate probe re-runs, the BOM
        // appears in "Destination BOM", and Promote enables.
        setPromoteSuccess({
          productionCode: result.productionCode ?? null,
          bomHeaderId: result.bomHeaderId ?? null,
          bomHref: null,
          yieldPromptRequired: result.yieldPromptRequired === true,
        });
        setYieldDismissed(false);
        setYieldSaved(false);
        setYieldError(null);
        router.refresh();
      }
    } catch {
      setGenerateError('error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleYieldSave() {
    if (!onUpdateBomYield || yieldSaving) return;
    const bomHeaderId = promoteSuccess?.bomHeaderId;
    if (!bomHeaderId) return;
    const yieldPct = Number(yieldInput);
    if (!Number.isFinite(yieldPct) || yieldPct < 0.001 || yieldPct > 100) {
      setYieldError('invalid_input');
      return;
    }
    setYieldSaving(true);
    setYieldError(null);
    try {
      const result = await onUpdateBomYield({ bomHeaderId, yieldPct });
      if (result.ok) {
        setYieldSaved(true);
      } else {
        setYieldError(result.error ?? 'error');
      }
    } catch {
      setYieldError('error');
    } finally {
      setYieldSaving(false);
    }
  }

  function handleYieldSkip() {
    // BOM keeps its default yield; just dismiss the prompt.
    setYieldDismissed(true);
    setYieldError(null);
  }

  function handleExportPacket() {
    if (!data) return;
    const stamp = isoDateStamp();
    const packet = buildHandoffPacket(data, effectiveChecklist, new Date().toISOString());
    downloadJson(packet, handoffPacketFilename(data, stamp));
  }

  const steps = [
    labels.step1,
    labels.step2,
    labels.step3,
    labels.step4,
    labels.step5,
    labels.step6,
  ];

  return (
    <main
      data-testid="handoff-screen"
      aria-labelledby="handoff-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head" data-region="page-head">
        <nav aria-label="breadcrumb" className="breadcrumb">
          {labels.breadcrumb}
        </nav>
        <h1 id="handoff-title" className="page-title mt-1">
          {labels.title}
        </h1>
      </header>

      {/* Promotion-state bar — prototype line 485 (green "Ready to promote"). */}
      {promoted ? (
        <div role="status" data-testid="handoff-promoted-bar" className="alert alert-green">
          <strong>{labels.promotedTitle}</strong> <span>{labels.promotedBody}</span>
        </div>
      ) : allChecked ? (
        <div role="status" data-testid="handoff-ready-bar" className="alert alert-green">
          <strong>{labels.readyTitle}</strong> <span>{labels.readyBody}</span>
        </div>
      ) : (
        <div role="status" data-testid="handoff-blocked-bar" className="alert alert-amber">
          <strong>{labels.blockedTitle}</strong> <span>{labels.blockedBody}</span>
        </div>
      )}

      {/*
        Post-promote success panel — the production BOM is auto-built by the
        backend (promoteToProduction). Surface the generated production FG code +
        a link into the Technical BOM detail. When the recipe had no target yield
        (yieldPromptRequired), offer an inline yield/waste prompt. Held in client
        state so it survives the router.refresh() that re-renders the promoted bar.
      */}
      {promoteSuccess && (promoteSuccess.productionCode || promoteSuccess.bomHeaderId) ? (
        <Card data-testid="handoff-promote-success">
          <CardHeader>
            <CardTitle>{labels.promoteSuccessTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm" data-testid="handoff-promote-success-body">
              {labels.promoteSuccessBody.replace(
                '{code}',
                promoteSuccess.productionCode ?? labels.notSet,
              )}
            </p>
            {promoteSuccess.productionCode && promoteSuccess.bomHref ? (
              <div>
                <a
                  href={promoteSuccess.bomHref}
                  className="btn btn-secondary"
                  data-testid="handoff-promote-success-bom-link"
                >
                  {labels.promoteSuccessViewBom}
                </a>
              </div>
            ) : null}

            {/* Inline yield/waste prompt — only when the recipe had no target yield. */}
            {promoteSuccess.yieldPromptRequired &&
            promoteSuccess.bomHeaderId &&
            !yieldDismissed ? (
              yieldSaved ? (
                <div
                  role="status"
                  data-testid="handoff-yield-saved"
                  className="alert alert-green"
                >
                  <div className="alert-title">{labels.yieldSaved}</div>
                </div>
              ) : (
                <div
                  data-testid="handoff-yield-prompt"
                  className="rounded-md border p-3 space-y-2"
                >
                  <div className="text-sm font-medium">{labels.yieldPromptTitle}</div>
                  <p className="muted text-xs">{labels.yieldPromptBody}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      <span>{labels.yieldLabel}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.001}
                        max={100}
                        step={0.001}
                        value={yieldInput}
                        onChange={(e) => setYieldInput(e.target.value)}
                        disabled={yieldSaving}
                        className="input w-32"
                        data-testid="handoff-yield-input"
                        aria-label={labels.yieldLabel}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      data-testid="handoff-yield-save-btn"
                      disabled={yieldSaving || !onUpdateBomYield}
                      aria-disabled={yieldSaving || !onUpdateBomYield}
                      onClick={handleYieldSave}
                    >
                      {yieldSaving ? labels.yieldSaving : labels.yieldSave}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      data-testid="handoff-yield-skip-btn"
                      disabled={yieldSaving}
                      onClick={handleYieldSkip}
                    >
                      {labels.yieldSkip}
                    </button>
                  </div>
                  {yieldError ? (
                    <div
                      role="alert"
                      data-testid="handoff-yield-error"
                      className="alert alert-red"
                    >
                      <div className="alert-title">{yieldErrorMessage(labels, yieldError)}</div>
                    </div>
                  ) : null}
                </div>
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/*
        Post-promote next-step CTA — kills the dead end the user reported (after a
        successful promote there was nowhere to go). Reachable, never auto-advanced:
        the "Advance to Launched" link points at the project root where the existing
        AdvanceGateModal owns the handoff → launched transition (pending owner
        decision: NOT auto-advanced inside promote).
      */}
      {promoted && hrefs ? (
        <Card data-testid="handoff-next-step">
          <CardHeader>
            <CardTitle>{labels.promotedNextTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="muted text-sm">{labels.promotedNextBody}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={hrefs.project}
                className="btn btn-primary"
                data-testid="handoff-advance-launched-link"
              >
                {labels.advanceToLaunched}
              </a>
              <a href={hrefs.bom} className="btn btn-secondary" data-testid="handoff-view-bom-link">
                {labels.viewBom}
              </a>
              <a
                href={hrefs.project}
                className="btn btn-secondary"
                data-testid="handoff-view-project-link"
              >
                {labels.viewProject}
              </a>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/*
        Release-gate panel — surfaces, per gate, whether the factory-release
        preflight passes and WHY it does not (the reported dead end: Promote
        looked permanently disabled with no explanation). Read-only mirror of
        runReleasePreflight; the server preflight stays authoritative on promote.
        Hidden once promoted (the gates have already passed).
      */}
      {!promoted ? (
        <Card data-testid="handoff-release-gates">
          <CardHeader>
            <CardTitle>{labels.releaseGatesTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="muted mb-2 text-sm">{labels.releaseGatesBody}</p>
            <ul className="divide-y" data-testid="handoff-release-gates-list">
              {releaseGates.map((gate) => {
                const href = !gate.met ? gateRemediationHref(gate.code) : null;
                return (
                  <li
                    key={gate.code}
                    data-testid={`handoff-release-gate-${gate.code}`}
                    data-gate={gate.code}
                    data-met={gate.met}
                    className="flex items-center gap-3 py-2"
                  >
                    {/* Shared testid for "count the gates" assertions. */}
                    <span data-testid="handoff-release-gate" className="contents">
                      <span
                        aria-hidden="true"
                        className={gate.met ? 'text-green-600' : 'text-red-600'}
                      >
                        {gate.met ? '✓' : '✕'}
                      </span>
                      <span className="flex-1 text-sm">{gateLabel(gate.code)}</span>
                      <span
                        className={`text-xs ${gate.met ? 'text-green-700' : 'text-red-700'}`}
                        data-testid="handoff-release-gate-status"
                      >
                        {gate.met ? labels.gateMet : labels.gateUnmet}
                      </span>
                      {href ? (
                        <a
                          href={href}
                          className="text-xs underline"
                          data-testid="handoff-release-gate-remediation"
                        >
                          {labels.gateRemediation}
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/*
              Generate production BOM — deadlock break. The ACTIVE_SHARED_BOM gate
              (and FACTORY_SPEC) are only ever satisfied by materializing the BOM,
              but those were created INSIDE promote — so the user could never reach
              promote. This step builds the BOM first (RM from the locked recipe +
              packaging PM lines). On success the gates flip to met and Promote
              enables. Shown only while the BOM gate is unmet (BOM not yet built).
            */}
            {showGenerate ? (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="muted text-sm" data-testid="handoff-generate-hint">
                  {labels.generateBomHint}
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="handoff-generate-btn"
                  disabled={generating || !onGenerate}
                  aria-disabled={generating || !onGenerate}
                  onClick={handleGenerate}
                >
                  {generating ? labels.generating : labels.generateBom}
                </button>
                {generateError ? (
                  <div
                    role="alert"
                    data-testid="handoff-generate-error"
                    className="alert alert-red"
                  >
                    <div className="alert-title">
                      {generateError === 'no_recipe'
                        ? labels.generateNoRecipe
                        : generateError === 'packs_per_box_required'
                        ? labels.generatePacksPerBoxRequired
                        : generateError === 'packaging_unlinked'
                        ? (labels.generatePackagingUnlinked ?? 'Packaging components must be linked to items before generating the production BOM: {components}')
                            .replace('{components}', generateUnlinked.join(', '))
                        : labels.generateError}
                    </div>
                  </div>
                ) : null}
                {generateWarnings.length > 0 ? (
                  <div
                    role="status"
                    data-testid="handoff-generate-warnings"
                    className="alert alert-amber"
                  >
                    {generateWarnings.map((code) => (
                      <div key={code} className="alert-title">
                        {code === 'no_line'
                          ? (labels.generateWarningNoLine ?? 'Production BOM created, but no production line is set on the project — routing was not materialized.')
                          : (labels.generateWarningNoProcesses ?? 'Production BOM created, but no NPD processes were found to build a routing.')}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Handoff checklist — prototype lines 487-502. */}
      <Card data-testid="handoff-checklist-card">
        <CardHeader>
          <CardTitle>{labels.checklistTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul data-testid="handoff-checklist" className="divide-y">
            {effectiveChecklist.map((item) => (
              <li
                key={item.id}
                data-testid="handoff-checklist-item"
                data-checked={item.isChecked}
                className="flex items-center gap-3 py-2"
              >
                <Checkbox
                  checked={item.isChecked}
                  disabled={!onToggleChecklistItem || promoted}
                  onCheckedChange={(next) => handleToggle(item, next)}
                  aria-label={item.label}
                />
                <span
                  className={item.isChecked ? 'muted' : ''}
                  data-testid="handoff-checklist-label"
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Two-panel grid — prototype lines 504-528. */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Destination BOM — prototype lines 505-516. */}
        <Card data-testid="handoff-destination-card">
          <CardHeader>
            <CardTitle>{labels.destinationTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="muted py-1 pr-4">{labels.bomCode}</td>
                  <td className="mono">{destinationBom.bomCode ?? labels.notSet}</td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.productSku}</td>
                  <td className="mono">
                    {destinationBom.productSku
                      ? destinationBom.productName
                        ? `${destinationBom.productSku} · ${destinationBom.productName}`
                        : destinationBom.productSku
                      : labels.notSet}
                  </td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.effectiveFrom}</td>
                  <td className="mono">{destinationBom.effectiveFrom ?? labels.notSet}</td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.warehouse}</td>
                  <td>{destinationBom.warehouseName ?? labels.notSet}</td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.releaseStatus}</td>
                  <td className="mono" data-testid="handoff-release-status">
                    {destinationBom.releaseStatus ?? labels.notSet}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* What happens on promote — prototype lines 517-527. */}
        <Card data-testid="handoff-steps-card">
          <CardHeader>
            <CardTitle>{labels.whatHappensTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="muted list-decimal pl-5 text-xs leading-7" data-testid="handoff-steps">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {promoteError ? (
        <div role="alert" data-testid="handoff-promote-error" className="alert alert-red">
          <div className="alert-title">{labels.promoteError}</div>
        </div>
      ) : null}

      {/* Footer actions — prototype lines 530-533. */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="handoff-export-btn"
          onClick={handleExportPacket}
          title={labels.exportPacket}
        >
          {labels.exportPacket}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="handoff-promote-btn"
          disabled={!canPromote || promoting || !onPromote}
          aria-disabled={!canPromote || promoting || !onPromote}
          onClick={handlePromote}
        >
          {promoting ? labels.promoting : labels.promote}
        </button>
      </div>
    </main>
  );
}

export default HandoffScreen;
