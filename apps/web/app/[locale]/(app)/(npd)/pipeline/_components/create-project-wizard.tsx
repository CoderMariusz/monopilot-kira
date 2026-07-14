'use client';

/**
 * NPD — full-page 4-step "Create NPD project" wizard.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:107-263 (CreateProjectWizard)
 *
 * The prototype's hero flow rendered as a production full-page wizard:
 *   - breadcrumb "NPD / New project" + page title (proto 123/125),
 *   - a 4-step numbered step bar Basics / Brief / Starting point / Review (proto 119/129-142)
 *     translated to the design-system `.wiz-stepper` primitive,
 *   - one `.card` per step (proto 144-252),
 *   - footer Cancel (left) + Back / Continue / Create (right) (proto 254-261),
 *   - Continue disabled on step 1 until `name` is non-empty (proto 258),
 *   - clone starting-point shows the blue alert (proto 220-225),
 *   - step-4 review summary table (proto 236-250).
 *
 * RBAC (server-side, never client-trusted): the page resolves `npd.project.create`
 * and injects `createAction` ONLY when granted. With no action the Create button is
 * disabled and a forbidden alert is shown — the client can never create what the
 * server would reject (mirrors project-create-modal's injection pattern).
 *
 * Starting point (map dead-end #3):
 *   - "Blank recipe"  → createProject (a fresh project).
 *   - "Clone existing recipe" → REAL cloneProject: the user picks a source project
 *     (cloneSources, injected by the page), and the wizard's edited brief fields are
 *     passed as overrides. Enabled only when there is ≥1 source AND cloneAction is
 *     injected; otherwise the card stays honestly disabled.
 *   - "Category template" → NO project-template concept exists in the schema yet (a
 *     templates table needs a migration). Honestly disabled with a tooltip until then.
 *
 * NO raw <select> — uses the @monopilot/ui <Select>. The Server Actions are owned by
 * the pipeline T2 tasks (create-project.ts / clone-project.ts) and imported by the
 * page, never authored here.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Select } from '@monopilot/ui/Select';

const WIZARD_FIELD_FALLBACKS = {
  fieldRunsPerWeek: 'Runs per week (estimate)',
  fieldRunsPerWeekPlaceholder: 'e.g. 3',
  fieldRunsPerWeekHelp:
    'Planning estimate only — revise later on the project brief as volumes firm up.',
  fieldOutputUnit: 'Output unit',
  fieldOutputUnitKg: 'kg',
  fieldOutputUnitPieces: 'pieces',
  fieldOutputUnitBoxes: 'boxes',
  errorBoxesOutputUnit:
    'Output unit "boxes" requires pack weight (g) and packs per case greater than 0.',
} as const;

/** Field errors — not on WizardLabels (avoids forcing page i18n churn for this fix). */
const WEEKLY_VOLUME_ERROR = 'Weekly volume must be greater than 0.';
const RUNS_PER_WEEK_ERROR = 'Runs per week must be at least 1.';

const OUTPUT_UNIT_VALUES = ['kg', 'pieces', 'boxes'] as const;
type OutputUnitValue = (typeof OUTPUT_UNIT_VALUES)[number];

function outputUnitLabel(value: string, labels: WizardLabels): string {
  switch (value) {
    case 'kg':
      return labels.fieldOutputUnitKg;
    case 'pieces':
      return labels.fieldOutputUnitPieces;
    case 'boxes':
      return labels.fieldOutputUnitBoxes;
    default:
      return value;
  }
}

function wizardLabel(labels: WizardLabels, key: keyof typeof WIZARD_FIELD_FALLBACKS): string {
  const value = labels[key];
  const fallback = WIZARD_FIELD_FALLBACKS[key];
  if (!value || value === key || value.includes('npd.projectWizard')) return fallback;
  return value;
}

export type WizardStartFrom = 'blank' | 'clone' | 'template';

/** A project the user may clone from (the wizard's "Clone existing recipe" picker). */
export type WizardCloneSource = {
  id: string;
  code: string;
  name: string;
};

/**
 * Clone Server Action signature (owned by clone-project.ts — injected by the page).
 * Seeds a new project from `sourceProjectId`, applying the wizard's brief overrides.
 */
export type WizardCloneAction = (input: {
  sourceProjectId: string;
  overrides: {
    name: string;
    type: string;
    targetLaunch: string | null;
    packFormat: string | null;
    packWeightG: number | null;
  /** Packs per case — optional non-negative integer; omitted when empty. */
  packsPerCase?: number | null;
  outputUnit?: OutputUnitValue | null;
  /** Required Basics fields — weekly volume > 0, runs/week ≥ 1. */
  weeklyVolumePacks: number;
  runsPerWeek: number;
  salesChannel: string | null;
  targetRetailPriceEur: number | null;
    targetAudience: string | null;
    marketingClaims: string | null;
    constraints: string | null;
    notes: string | null;
    prio: 'high' | 'normal' | 'low';
  };
}) => Promise<{ ok: true; data: { id: string; code: string } } | { ok: false; error: string }>;

/** Server Action signature (owned by the pipeline T2 task — injected by the page). */
export type WizardCreateAction = (input: {
  name: string;
  type: string;
  targetLaunch: string | null;
  packFormat: string | null;
  /** Costing v2: pack net weight in grams (the recipe batch size). */
  packWeightG: number | null;
  /** Packs per case — optional non-negative integer; omitted when empty. */
  packsPerCase?: number | null;
  outputUnit?: OutputUnitValue | null;
  /** Required Basics fields — weekly volume > 0, runs/week ≥ 1. */
  weeklyVolumePacks: number;
  runsPerWeek: number;
  salesChannel: string | null;
  targetRetailPriceEur: number | null;
  targetAudience: string | null;
  marketingClaims: string | null;
  constraints: string | null;
  notes: string | null;
  startFrom: WizardStartFrom;
  cloneSource: string | null;
  prio: 'high' | 'normal' | 'low';
  templateId: string;
}) => Promise<{ ok: true; data: { id: string; code: string } } | { ok: false; error: string }>;

export type WizardLabels = {
  breadcrumbRoot: string;
  breadcrumbCurrent: string;
  pageTitle: string;
  stepBasics: string;
  stepBrief: string;
  stepStarting: string;
  stepReview: string;
  basicsTitle: string;
  fieldName: string;
  fieldNamePlaceholder: string;
  fieldCategory: string;
  fieldTargetLaunch: string;
  fieldPackFormat: string;
  fieldPackFormatPlaceholder: string;
  fieldPackWeight: string;
  fieldPackWeightPlaceholder: string;
  fieldPacksPerCase: string;
  fieldPacksPerCasePlaceholder: string;
  fieldOutputUnit: string;
  fieldOutputUnitKg: string;
  fieldOutputUnitPieces: string;
  fieldOutputUnitBoxes: string;
  fieldWeeklyVolumePacks: string;
  fieldWeeklyVolumePacksPlaceholder: string;
  fieldRunsPerWeek: string;
  fieldRunsPerWeekPlaceholder: string;
  fieldRunsPerWeekHelp: string;
  fieldSalesChannel: string;
  briefTitle: string;
  fieldRetailPrice: string;
  fieldAudience: string;
  fieldAudiencePlaceholder: string;
  fieldClaims: string;
  fieldClaimsPlaceholder: string;
  fieldConstraints: string;
  fieldConstraintsPlaceholder: string;
  fieldNotes: string;
  fieldNotesPlaceholder: string;
  startingTitle: string;
  startingSubtitle: string;
  startBlankTitle: string;
  startBlankDesc: string;
  startCloneTitle: string;
  startCloneDesc: string;
  startTemplateTitle: string;
  startTemplateDesc: string;
  /** Tooltip + a11y hint on the disabled Template card (no template schema yet). */
  startUnavailableHint: string;
  /** Shown on the Clone card when there is no source project to clone from. */
  cloneNoSourceHint: string;
  /** Label for the source-project picker shown once Clone is selected. */
  cloneSourceLabel: string;
  cloneSourcePlaceholder: string;
  cloneAlert: string;
  reviewTitle: string;
  reviewReady: string;
  reviewName: string;
  reviewCategory: string;
  reviewTarget: string;
  reviewPrice: string;
  reviewChannelVolume: string;
  reviewClaims: string;
  reviewStarting: string;
  reviewStartBlank: string;
  reviewStartClone: string;
  reviewStartTemplate: string;
  empty: string;
  cancel: string;
  back: string;
  continue: string;
  create: string;
  creating: string;
  errorGeneric: string;
  errorForbidden: string;
  errorBoxesOutputUnit: string;
};

/** Category options are loaded server-side from Reference.ProductCategories. */
export type CategoryOption = { value: string; label: string };

/** Sales channel options mirror the prototype's <select> (project.jsx:164-166). */
const SALES_CHANNEL_VALUES = ['Retail', 'HoReCa', 'Industrial', 'Export'] as const;

type FormState = {
  name: string;
  type: string;
  targetLaunch: string;
  packFormat: string;
  packWeightG: string;
  packsPerCase: string;
  outputUnit: string;
  weeklyVolumePacks: string;
  runsPerWeek: string;
  salesChannel: string;
  targetRetailPriceEur: string;
  targetAudience: string;
  marketingClaims: string;
  constraints: string;
  notes: string;
  startFrom: WizardStartFrom;
  /** Selected source project id when startFrom === 'clone'. */
  cloneSourceId: string;
};

const INITIAL_FORM = (defaultCategory: string): FormState => ({
  name: '',
  type: defaultCategory,
  targetLaunch: '',
  packFormat: '',
  packWeightG: '',
  packsPerCase: '',
  outputUnit: '',
  weeklyVolumePacks: '',
  runsPerWeek: '',
  salesChannel: SALES_CHANNEL_VALUES[0],
  targetRetailPriceEur: '',
  targetAudience: '',
  marketingClaims: '',
  constraints: '',
  notes: '',
  startFrom: 'blank',
  cloneSourceId: '',
});

/** Trim → null for optional free-text fields. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse the EUR input ("19.90", "19,90") to a non-negative number or null. */
function parseEur(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Required weekly packs — finite and > 0. Empty/neg/NaN → null. */
export function parseWeeklyVolumePacks(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Required runs/week — finite and ≥ 1. Empty/0/neg/NaN → null. */
export function parseRunsPerWeek(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * Parse the optional "Packs per case" input to a non-negative integer.
 * Empty (or invalid) → `undefined` so the field is OMITTED from the payload
 * (the optional createProject input keeps the backend default / FG copy untouched).
 */
function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Spread helper: include `packsPerCase` only when the input parses to an integer. */
function packsPerCaseField(value: string): { packsPerCase?: number } {
  const parsed = parseOptionalInteger(value);
  return parsed === undefined ? {} : { packsPerCase: parsed };
}

/** Spread helper: include `outputUnit` only when the user picked a valid value. */
function outputUnitField(value: string): { outputUnit?: OutputUnitValue } {
  const trimmed = value.trim();
  if (trimmed === '' || !OUTPUT_UNIT_VALUES.includes(trimmed as OutputUnitValue)) return {};
  return { outputUnit: trimmed as OutputUnitValue };
}

function boxesOutputUnitInvalid(form: FormState): boolean {
  if (form.outputUnit !== 'boxes') return false;
  const packWeight = form.packWeightG.trim();
  const packsPerCase = form.packsPerCase.trim();
  return packWeight === '' || packsPerCase === '' || Number(packsPerCase) <= 0;
}

/** localStorage key — scopeId is org/user (or test id); foreign scopes never restore. */
export function wizardDraftStorageKey(scopeId: string): string {
  return `npd.create-project.draft:${scopeId}`;
}

type WizardDraftV1 = { v: 1; scopeId: string; step: number; form: FormState };

/** Pure save/restore/clear — unit-tested; component wires localStorage. */
export function readWizardDraft(
  scopeId: string,
  storage: Pick<Storage, 'getItem'> = typeof window !== 'undefined' ? window.localStorage : { getItem: () => null },
): { step: number; form: FormState } | null {
  try {
    const raw = storage.getItem(wizardDraftStorageKey(scopeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraftV1;
    if (parsed?.v !== 1 || parsed.scopeId !== scopeId || typeof parsed.step !== 'number' || !parsed.form) {
      return null;
    }
    return { step: parsed.step, form: parsed.form };
  } catch {
    return null;
  }
}

export function writeWizardDraft(
  scopeId: string,
  step: number,
  form: FormState,
  storage: Pick<Storage, 'setItem'> = typeof window !== 'undefined'
    ? window.localStorage
    : { setItem: () => undefined },
): void {
  const payload: WizardDraftV1 = { v: 1, scopeId, step, form };
  storage.setItem(wizardDraftStorageKey(scopeId), JSON.stringify(payload));
}

export function clearWizardDraft(
  scopeId: string,
  storage: Pick<Storage, 'removeItem'> = typeof window !== 'undefined'
    ? window.localStorage
    : { removeItem: () => undefined },
): void {
  storage.removeItem(wizardDraftStorageKey(scopeId));
}

export function CreateProjectWizard({
  locale,
  labels,
  createAction,
  cloneAction,
  cloneSources = [],
  categoryOptions = [],
  // ponytail: page can pass `${orgId}:${userId}` later; default still scopes foreign drafts via key
  draftScopeId = 'default',
}: {
  locale: string;
  labels: WizardLabels;
  /** Injected by the page ONLY when npd.project.create is granted (RBAC). */
  createAction?: WizardCreateAction;
  /** Injected by the page ONLY when npd.project.create is granted (RBAC). */
  cloneAction?: WizardCloneAction;
  /** Source projects the user may clone from (org-scoped, from listProjects). */
  cloneSources?: WizardCloneSource[];
  /** Active org product categories (label stored in npd_projects.type). */
  categoryOptions?: CategoryOption[];
  /** Stable id for draft localStorage key (org/user) — rejects foreign drafts. */
  draftScopeId?: string;
}) {
  const router = useRouter();
  const defaultCategory = categoryOptions[0]?.value ?? '';
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState<FormState>(() => INITIAL_FORM(defaultCategory));
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [draftReady, setDraftReady] = React.useState(false);

  // Restore draft once after mount (avoids SSR/localStorage mismatch).
  React.useEffect(() => {
    const draft = readWizardDraft(draftScopeId);
    if (draft) {
      setStep(Math.min(4, Math.max(1, draft.step)));
      setForm({ ...INITIAL_FORM(defaultCategory), ...draft.form });
    }
    setDraftReady(true);
  }, [draftScopeId, defaultCategory]);

  // Autosave after hydrate — leaving the route keeps inputs.
  React.useEffect(() => {
    if (!draftReady) return;
    writeWizardDraft(draftScopeId, step, form);
  }, [draftReady, draftScopeId, step, form]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const next = () => setStep((s) => Math.min(4, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const stepLabels = [labels.stepBasics, labels.stepBrief, labels.stepStarting, labels.stepReview];

  const nameEmpty = form.name.trim().length === 0;
  const weeklyVolumeParsed = parseWeeklyVolumePacks(form.weeklyVolumePacks);
  const runsPerWeekParsed = parseRunsPerWeek(form.runsPerWeek);
  const weeklyVolumeInvalid =
    form.weeklyVolumePacks.trim().length > 0 && weeklyVolumeParsed === null;
  const runsPerWeekInvalid = form.runsPerWeek.trim().length > 0 && runsPerWeekParsed === null;
  const basicsIncomplete = nameEmpty || weeklyVolumeParsed === null || runsPerWeekParsed === null;
  const canCreate = Boolean(createAction);
  // Clone is offered only when the clone action is injected AND there is ≥1 source.
  const cloneEnabled = Boolean(cloneAction) && cloneSources.length > 0;

  const categorySelectOptions = React.useMemo(() => {
    const canonical = categoryOptions.map((o) => o.value);
    const current = form.type;
    const values = current && !canonical.includes(current) ? [{ value: current, label: current }, ...categoryOptions] : categoryOptions;
    return values;
  }, [categoryOptions, form.type]);
  const channelOptions = React.useMemo(
    () => SALES_CHANNEL_VALUES.map((value) => ({ value, label: value })),
    [],
  );
  const cloneSourceOptions = React.useMemo(
    () => cloneSources.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })),
    [cloneSources],
  );

  const cancel = React.useCallback(() => {
    clearWizardDraft(draftScopeId);
    router.push(`/${locale}/pipeline`);
  }, [router, locale, draftScopeId]);

  const onCreate = React.useCallback(async () => {
    setServerError(null);

    const weeklyVolumePacks = parseWeeklyVolumePacks(form.weeklyVolumePacks);
    const runsPerWeek = parseRunsPerWeek(form.runsPerWeek);
    if (weeklyVolumePacks === null || runsPerWeek === null) {
      setServerError(
        weeklyVolumePacks === null ? WEEKLY_VOLUME_ERROR : RUNS_PER_WEEK_ERROR,
      );
      return;
    }

    if (boxesOutputUnitInvalid(form)) {
      setServerError(
        labels.errorBoxesOutputUnit.includes('npd.projectWizard')
          ? WIZARD_FIELD_FALLBACKS.errorBoxesOutputUnit
          : labels.errorBoxesOutputUnit,
      );
      return;
    }

    // Clone path: seed a new project from the picked source, applying the brief edits.
    if (form.startFrom === 'clone') {
      if (!cloneAction || form.cloneSourceId.trim().length === 0) {
        setServerError(labels.errorForbidden);
        return;
      }
      setSubmitting(true);
      try {
        const result = await cloneAction({
          sourceProjectId: form.cloneSourceId,
          overrides: {
            name: form.name.trim(),
            type: form.type,
            targetLaunch: nullable(form.targetLaunch),
            packFormat: nullable(form.packFormat),
            packWeightG: parseEur(form.packWeightG),
            ...packsPerCaseField(form.packsPerCase),
            ...outputUnitField(form.outputUnit),
            weeklyVolumePacks,
            runsPerWeek,
            salesChannel: form.salesChannel,
            targetRetailPriceEur: parseEur(form.targetRetailPriceEur),
            targetAudience: nullable(form.targetAudience),
            marketingClaims: nullable(form.marketingClaims),
            constraints: nullable(form.constraints),
            notes: nullable(form.notes),
            prio: 'normal',
          },
        });
        if (result.ok) {
          clearWizardDraft(draftScopeId);
          router.push(`/${locale}/pipeline/${result.data.id}/formulation`);
          return;
        }
        setServerError(result.error === 'FORBIDDEN' ? labels.errorForbidden : labels.errorGeneric);
        setSubmitting(false);
      } catch {
        setServerError(labels.errorGeneric);
        setSubmitting(false);
      }
      return;
    }

    // Blank path (Template is disabled, so startFrom is 'blank' or 'clone' here).
    if (!createAction) {
      setServerError(labels.errorForbidden);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAction({
        name: form.name.trim(),
        type: form.type,
        targetLaunch: nullable(form.targetLaunch),
        packFormat: nullable(form.packFormat),
        packWeightG: parseEur(form.packWeightG),
        ...packsPerCaseField(form.packsPerCase),
        ...outputUnitField(form.outputUnit),
        weeklyVolumePacks,
        runsPerWeek,
        salesChannel: form.salesChannel,
        targetRetailPriceEur: parseEur(form.targetRetailPriceEur),
        targetAudience: nullable(form.targetAudience),
        marketingClaims: nullable(form.marketingClaims),
        constraints: nullable(form.constraints),
        notes: nullable(form.notes),
        startFrom: 'blank',
        cloneSource: null,
        prio: 'normal',
        templateId: 'APEX_DEFAULT',
      });
      if (result.ok) {
        clearWizardDraft(draftScopeId);
        router.push(`/${locale}/pipeline/${result.data.id}/formulation`);
        return;
      }
      setServerError(result.error === 'FORBIDDEN' ? labels.errorForbidden : labels.errorGeneric);
      setSubmitting(false);
    } catch {
      setServerError(labels.errorGeneric);
      setSubmitting(false);
    }
  }, [createAction, cloneAction, draftScopeId, form, labels, locale, router]);

  // Clone is REAL now (cloneProject) — enabled whenever the action is injected and
  // there is ≥1 source project to clone from (else honestly disabled with a "nothing
  // to clone" hint). Template has NO schema yet (a templates table needs a migration),
  // so it stays disabled with a tooltip. Blank is always available + the default.
  // The three-card layout matches the prototype; unavailability is made explicit
  // (disabled + hint) rather than rendering a dead button.
  const startingOptions: Array<{
    key: WizardStartFrom;
    title: string;
    desc: string;
    icon: string;
    disabled: boolean;
    /** The reason shown when the card is disabled (distinct per card). */
    disabledHint?: string;
  }> = [
    { key: 'blank', title: labels.startBlankTitle, desc: labels.startBlankDesc, icon: '◇', disabled: false },
    {
      key: 'clone',
      title: labels.startCloneTitle,
      desc: labels.startCloneDesc,
      icon: '⎘',
      disabled: !cloneEnabled,
      disabledHint: labels.cloneNoSourceHint,
    },
    {
      key: 'template',
      title: labels.startTemplateTitle,
      desc: labels.startTemplateDesc,
      icon: '▦',
      disabled: true,
      disabledHint: labels.startUnavailableHint,
    },
  ];

  const startingReviewLabel =
    form.startFrom === 'clone'
      ? labels.reviewStartClone
      : form.startFrom === 'template'
        ? labels.reviewStartTemplate
        : labels.reviewStartBlank;

  // In clone mode the Create button additionally requires a chosen source project.
  const cloneSourceMissing = form.startFrom === 'clone' && form.cloneSourceId.trim().length === 0;
  // The Create CTA is available when blank-create is permitted OR (clone mode) the
  // clone action is injected. It stays disabled until a clone source is picked.
  const createDisabled =
    submitting ||
    cloneSourceMissing ||
    (form.startFrom === 'clone' ? !cloneAction : !canCreate);

  return (
    <div className="page-pad" data-testid="create-project-wizard">
      {/* Breadcrumb + title (proto 123-127) */}
      <nav aria-label="breadcrumb" className="breadcrumb">
        <a href={`/${locale}/pipeline`}>{labels.breadcrumbRoot}</a> / {labels.breadcrumbCurrent}
      </nav>
      <h1 className="page-title" style={{ marginTop: 4, marginBottom: 14 }}>
        {labels.pageTitle}
      </h1>

      {/* Step bar (proto 129-142) — design-system .wiz-stepper primitive. */}
      <div className="card">
        <div className="wiz-stepper" role="list" aria-label={labels.pageTitle} style={{ borderBottom: 'none', paddingBottom: 4 }}>
          {stepLabels.map((label, index) => {
            const num = index + 1;
            const status = step > num ? 'done' : step === num ? 'current' : '';
            return (
              <React.Fragment key={label}>
                <div className={`wiz-step ${status}`.trim()} role="listitem" aria-current={step === num ? 'step' : undefined}>
                  <span className="wiz-step-num" aria-hidden="true">
                    {step > num ? '✓' : num}
                  </span>
                  <span>{label}</span>
                </div>
                {index < stepLabels.length - 1 && (
                  <span className={`wiz-step-line ${step > num ? 'done' : ''}`.trim()} aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step 1 — Basics (proto 144-173) */}
      {step === 1 && (
        <div className="card" data-testid="wizard-step-basics">
          <div className="card-title" style={{ marginBottom: 12 }}>
            {labels.basicsTitle}
          </div>
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-name">
                {labels.fieldName} <span className="req" aria-label="required">*</span>
              </label>
              <input
                id="wiz-name"
                type="text"
                placeholder={labels.fieldNamePlaceholder}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                autoFocus
              />
            </div>
            <div className="ff">
              <label htmlFor="wiz-type">
                {labels.fieldCategory} <span className="req" aria-label="required">*</span>
              </label>
              <Select
                id="wiz-type"
                aria-label={labels.fieldCategory}
                value={form.type}
                options={categorySelectOptions}
                onValueChange={(v) => update('type', v)}
              />
            </div>
          </div>
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-target">{labels.fieldTargetLaunch}</label>
              {/* Native date picker — the value is always '' or YYYY-MM-DD, so a
                  hand-typed format like "12/2026" can never reach the server and
                  silently fail parseTargetLaunch (→ INVALID_INPUT). Matches the
                  app-wide type="date" convention (planning/shipping/brief). */}
              <input
                id="wiz-target"
                type="date"
                value={form.targetLaunch}
                onChange={(e) => update('targetLaunch', e.target.value)}
              />
            </div>
            <div className="ff">
              <label htmlFor="wiz-format">{labels.fieldPackFormat}</label>
              <input
                id="wiz-format"
                type="text"
                placeholder={labels.fieldPackFormatPlaceholder}
                value={form.packFormat}
                onChange={(e) => update('packFormat', e.target.value)}
              />
            </div>
          </div>
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-channel">{labels.fieldSalesChannel}</label>
              <Select
                id="wiz-channel"
                aria-label={labels.fieldSalesChannel}
                value={form.salesChannel}
                options={channelOptions}
                onValueChange={(v) => update('salesChannel', v)}
              />
            </div>
          </div>
          {/* Costing v2: pack weight (g) = the recipe's batch size (the per-kg divisor). */}
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-pack-weight">{labels.fieldPackWeight}</label>
              {/* number input (not text) so a unit like "800g" can't be typed and
                  then silently dropped by parseEur — owner-reported pack-weight loss. */}
              <input
                id="wiz-pack-weight"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder={labels.fieldPackWeightPlaceholder}
                value={form.packWeightG}
                onChange={(e) => update('packWeightG', e.target.value)}
              />
            </div>
            {/* Packs per case — optional non-negative integer; empty omits the field. */}
            <div className="ff">
              <label htmlFor="wiz-packs-per-case">{labels.fieldPacksPerCase}</label>
              <input
                id="wiz-packs-per-case"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder={labels.fieldPacksPerCasePlaceholder}
                value={form.packsPerCase}
                onChange={(e) => update('packsPerCase', e.target.value)}
              />
            </div>
            <div className="ff">
              <label htmlFor="wiz-output-unit">{labels.fieldOutputUnit}</label>
              <Select
                id="wiz-output-unit"
                aria-label={labels.fieldOutputUnit}
                value={form.outputUnit}
                options={OUTPUT_UNIT_VALUES.map((value) => ({
                  value,
                  label: outputUnitLabel(value, labels),
                }))}
                onValueChange={(v) => update('outputUnit', v)}
              />
            </div>
          </div>
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-weekly-volume">
                {labels.fieldWeeklyVolumePacks} <span className="req" aria-label="required">*</span>
              </label>
              <input
                id="wiz-weekly-volume"
                type="number"
                min="0.000001"
                step="any"
                inputMode="decimal"
                required
                aria-invalid={weeklyVolumeInvalid}
                placeholder={labels.fieldWeeklyVolumePacksPlaceholder}
                value={form.weeklyVolumePacks}
                onChange={(e) => update('weeklyVolumePacks', e.target.value)}
                data-testid="wiz-weekly-volume"
              />
              {weeklyVolumeInvalid && (
                <p className="text-xs" role="alert" data-testid="wiz-weekly-volume-error" style={{ color: 'var(--danger, #b91c1c)' }}>
                  {WEEKLY_VOLUME_ERROR}
                </p>
              )}
            </div>
            <div className="ff">
              <label htmlFor="wiz-runs-per-week">
                {wizardLabel(labels, 'fieldRunsPerWeek')}{' '}
                <span className="req" aria-label="required">*</span>
              </label>
              <input
                id="wiz-runs-per-week"
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                required
                aria-invalid={runsPerWeekInvalid}
                placeholder={labels.fieldRunsPerWeekPlaceholder || WIZARD_FIELD_FALLBACKS.fieldRunsPerWeekPlaceholder}
                value={form.runsPerWeek}
                onChange={(e) => update('runsPerWeek', e.target.value)}
                data-testid="wiz-runs-per-week"
              />
              {runsPerWeekInvalid && (
                <p className="text-xs" role="alert" data-testid="wiz-runs-per-week-error" style={{ color: 'var(--danger, #b91c1c)' }}>
                  {RUNS_PER_WEEK_ERROR}
                </p>
              )}
              <p className="muted text-xs" data-testid="wiz-runs-per-week-help">
                {wizardLabel(labels, 'fieldRunsPerWeekHelp')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Brief (proto 175-196) */}
      {step === 2 && (
        <div className="card" data-testid="wizard-step-brief">
          <div className="card-title" style={{ marginBottom: 12 }}>
            {labels.briefTitle}
          </div>
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-price">{labels.fieldRetailPrice}</label>
              <input
                id="wiz-price"
                type="text"
                inputMode="decimal"
                placeholder="19.90"
                value={form.targetRetailPriceEur}
                onChange={(e) => update('targetRetailPriceEur', e.target.value)}
              />
            </div>
            <div className="ff">
              <label htmlFor="wiz-audience">{labels.fieldAudience}</label>
              <input
                id="wiz-audience"
                type="text"
                placeholder={labels.fieldAudiencePlaceholder}
                value={form.targetAudience}
                onChange={(e) => update('targetAudience', e.target.value)}
              />
            </div>
          </div>
          <div className="ff">
            <label htmlFor="wiz-claims">{labels.fieldClaims}</label>
            <input
              id="wiz-claims"
              type="text"
              placeholder={labels.fieldClaimsPlaceholder}
              value={form.marketingClaims}
              onChange={(e) => update('marketingClaims', e.target.value)}
            />
          </div>
          <div className="ff">
            <label htmlFor="wiz-constraints">{labels.fieldConstraints}</label>
            <textarea
              id="wiz-constraints"
              rows={3}
              placeholder={labels.fieldConstraintsPlaceholder}
              value={form.constraints}
              onChange={(e) => update('constraints', e.target.value)}
            />
          </div>
          <div className="ff">
            <label htmlFor="wiz-notes">{labels.fieldNotes}</label>
            <textarea
              id="wiz-notes"
              rows={3}
              placeholder={labels.fieldNotesPlaceholder}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Step 3 — Starting point (proto 198-227) */}
      {step === 3 && (
        <div className="card" data-testid="wizard-step-starting">
          <div className="card-title" style={{ marginBottom: 4 }}>
            {labels.startingTitle}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
            {labels.startingSubtitle}
          </div>
          <div
            role="radiogroup"
            aria-label={labels.startingTitle}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}
          >
            {startingOptions.map((opt) => {
              const selected = form.startFrom === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={opt.disabled || undefined}
                  disabled={opt.disabled}
                  data-testid={`wizard-start-${opt.key}`}
                  data-disabled={opt.disabled || undefined}
                  title={opt.disabled ? opt.disabledHint : undefined}
                  onClick={() => {
                    if (opt.disabled) return;
                    update('startFrom', opt.key);
                    // Leaving the Clone card clears any picked source so a stale id
                    // never travels with a non-clone create.
                    if (opt.key !== 'clone') update('cloneSourceId', '');
                  }}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    border: `2px solid ${selected ? 'var(--blue)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    background: selected ? 'var(--blue-050)' : 'var(--card)',
                    opacity: opt.disabled ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }} aria-hidden="true">
                    {opt.icon}
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {opt.title}
                    {opt.disabled ? (
                      <span
                        className="muted"
                        data-testid={`wizard-start-${opt.key}-unavailable`}
                        style={{ marginLeft: 6, fontSize: 11, fontWeight: 400 }}
                      >
                        · {opt.disabledHint}
                      </span>
                    ) : null}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
          {form.startFrom === 'clone' && (
            <div style={{ marginTop: 14 }}>
              <div className="ff">
                <label htmlFor="wiz-clone-source">{labels.cloneSourceLabel}</label>
                <Select
                  id="wiz-clone-source"
                  aria-label={labels.cloneSourceLabel}
                  placeholder={labels.cloneSourcePlaceholder}
                  value={form.cloneSourceId}
                  options={cloneSourceOptions}
                  onValueChange={(v) => update('cloneSourceId', v)}
                />
              </div>
              <div className="alert alert-blue" style={{ marginTop: 10 }} data-testid="wizard-clone-alert">
                {labels.cloneAlert}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4 — Review (proto 229-252) */}
      {step === 4 && (
        <div className="card" data-testid="wizard-step-review">
          <div className="card-title" style={{ marginBottom: 12 }}>
            {labels.reviewTitle}
          </div>
          <div className="alert alert-green">{labels.reviewReady}</div>
          <table style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <td className="muted" style={{ width: 180 }}>
                  {labels.reviewName}
                </td>
                <td style={{ fontWeight: 500 }}>{form.name.trim() || labels.empty}</td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewCategory}</td>
                <td>{form.type}</td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewTarget}</td>
                <td>{form.targetLaunch.trim() || labels.empty}</td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewPrice}</td>
                <td>£{form.targetRetailPriceEur.trim() || labels.empty}</td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewChannelVolume}</td>
                <td>
                  {form.salesChannel} · {form.weeklyVolumePacks.trim() || labels.empty} packs/wk
                </td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewClaims}</td>
                <td>{form.marketingClaims.trim() || labels.empty}</td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewStarting}</td>
                <td>{startingReviewLabel}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Permission-denied + server error (proto has no analogue — production state). */}
      {!canCreate && (
        <div className="alert alert-red" role="alert" data-testid="wizard-forbidden">
          {labels.errorForbidden}
        </div>
      )}
      {serverError && canCreate && (
        <div className="alert alert-red" role="alert" data-testid="wizard-error">
          {serverError}
        </div>
      )}

      {/* Footer — Cancel (left) + Back / Continue / Create (right) (proto 254-261). */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={cancel} disabled={submitting}>
          {labels.cancel}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 1 && (
            <button type="button" className="btn btn-secondary" onClick={prev} disabled={submitting} data-testid="wizard-back">
              ← {labels.back}
            </button>
          )}
          {step < 4 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={next}
              disabled={step === 1 && basicsIncomplete}
              data-testid="wizard-continue"
            >
              {labels.continue} →
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onCreate}
              disabled={createDisabled}
              data-testid="wizard-create"
            >
              {submitting ? labels.creating : `✓ ${labels.create}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreateProjectWizard;
