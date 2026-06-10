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
 * NO raw <select> — uses the @monopilot/ui <Select>. The Server Action is owned by
 * the pipeline T2 task (create-project.ts) and imported by the page, never authored
 * here.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Select } from '@monopilot/ui/Select';

export type WizardStartFrom = 'blank' | 'clone' | 'template';

/** Server Action signature (owned by the pipeline T2 task — injected by the page). */
export type WizardCreateAction = (input: {
  name: string;
  type: string;
  targetLaunch: string | null;
  packFormat: string | null;
  /** Costing v2: pack net weight in grams (the recipe batch size). */
  packWeightG: number | null;
  salesChannel: string | null;
  expectedVolume: string | null;
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
  fieldSalesChannel: string;
  fieldVolume: string;
  fieldVolumePlaceholder: string;
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
  /** Tooltip + a11y hint on the disabled Clone/Template cards (no backend yet). */
  startUnavailableHint: string;
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
};

/** Category options mirror the prototype's <select> (project.jsx:152-155). */
const CATEGORY_VALUES = [
  'Meat · Cold cut',
  'Meat · Smoked',
  'Meat · Cured',
  'Meat · Pâté',
  'Fish · Smoked',
] as const;

/** Sales channel options mirror the prototype's <select> (project.jsx:164-166). */
const SALES_CHANNEL_VALUES = ['Retail', 'HoReCa', 'Industrial', 'Export'] as const;

type FormState = {
  name: string;
  type: string;
  targetLaunch: string;
  packFormat: string;
  packWeightG: string;
  salesChannel: string;
  expectedVolume: string;
  targetRetailPriceEur: string;
  targetAudience: string;
  marketingClaims: string;
  constraints: string;
  notes: string;
  startFrom: WizardStartFrom;
};

const INITIAL_FORM: FormState = {
  name: '',
  type: CATEGORY_VALUES[0],
  targetLaunch: '',
  packFormat: '',
  packWeightG: '',
  salesChannel: SALES_CHANNEL_VALUES[0],
  expectedVolume: '',
  targetRetailPriceEur: '',
  targetAudience: '',
  marketingClaims: '',
  constraints: '',
  notes: '',
  startFrom: 'blank',
};

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

export function CreateProjectWizard({
  locale,
  labels,
  createAction,
}: {
  locale: string;
  labels: WizardLabels;
  /** Injected by the page ONLY when npd.project.create is granted (RBAC). */
  createAction?: WizardCreateAction;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const next = () => setStep((s) => Math.min(4, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const stepLabels = [labels.stepBasics, labels.stepBrief, labels.stepStarting, labels.stepReview];

  const nameEmpty = form.name.trim().length === 0;
  const canCreate = Boolean(createAction);

  const categoryOptions = React.useMemo(
    () => CATEGORY_VALUES.map((value) => ({ value, label: value })),
    [],
  );
  const channelOptions = React.useMemo(
    () => SALES_CHANNEL_VALUES.map((value) => ({ value, label: value })),
    [],
  );

  const cancel = React.useCallback(() => {
    router.push(`/${locale}/pipeline`);
  }, [router, locale]);

  const onCreate = React.useCallback(async () => {
    setServerError(null);
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
        salesChannel: form.salesChannel,
        expectedVolume: nullable(form.expectedVolume),
        targetRetailPriceEur: parseEur(form.targetRetailPriceEur),
        targetAudience: nullable(form.targetAudience),
        marketingClaims: nullable(form.marketingClaims),
        constraints: nullable(form.constraints),
        notes: nullable(form.notes),
        startFrom: form.startFrom,
        // Clone has no backend yet — the card is disabled, so startFrom is always
        // 'blank' here. Never send a hardcoded clone source (was 'BOM-214').
        cloneSource: null,
        prio: 'normal',
        templateId: 'APEX_DEFAULT',
      });
      if (result.ok) {
        router.push(`/${locale}/pipeline/${result.data.id}`);
        return;
      }
      setServerError(result.error === 'FORBIDDEN' ? labels.errorForbidden : labels.errorGeneric);
      setSubmitting(false);
    } catch {
      setServerError(labels.errorGeneric);
      setSubmitting(false);
    }
  }, [createAction, form, labels, locale, router]);

  // Clone + Template have NO backend yet (clone forking / template seeding are not
  // implemented). They are rendered as visibly DISABLED cards — Blank is the only
  // selectable start and the default. Removing them entirely would diverge from the
  // prototype's three-card layout, so we keep the cards but make their unavailability
  // explicit (disabled + "Not available yet" title/aria).
  const startingOptions: Array<{
    key: WizardStartFrom;
    title: string;
    desc: string;
    icon: string;
    disabled: boolean;
  }> = [
    { key: 'blank', title: labels.startBlankTitle, desc: labels.startBlankDesc, icon: '◇', disabled: false },
    { key: 'clone', title: labels.startCloneTitle, desc: labels.startCloneDesc, icon: '⎘', disabled: true },
    { key: 'template', title: labels.startTemplateTitle, desc: labels.startTemplateDesc, icon: '▦', disabled: true },
  ];

  const startingReviewLabel =
    form.startFrom === 'clone'
      ? labels.reviewStartClone
      : form.startFrom === 'template'
        ? labels.reviewStartTemplate
        : labels.reviewStartBlank;

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
                options={categoryOptions}
                onValueChange={(v) => update('type', v)}
              />
            </div>
          </div>
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-target">{labels.fieldTargetLaunch}</label>
              <input
                id="wiz-target"
                type="text"
                placeholder="YYYY-MM-DD"
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
            <div className="ff">
              <label htmlFor="wiz-volume">{labels.fieldVolume}</label>
              <input
                id="wiz-volume"
                type="text"
                placeholder={labels.fieldVolumePlaceholder}
                value={form.expectedVolume}
                onChange={(e) => update('expectedVolume', e.target.value)}
              />
            </div>
          </div>
          {/* Costing v2: pack weight (g) = the recipe's batch size (the per-kg divisor). */}
          <div className="ff-inline">
            <div className="ff">
              <label htmlFor="wiz-pack-weight">{labels.fieldPackWeight}</label>
              <input
                id="wiz-pack-weight"
                type="text"
                inputMode="decimal"
                placeholder={labels.fieldPackWeightPlaceholder}
                value={form.packWeightG}
                onChange={(e) => update('packWeightG', e.target.value)}
              />
            </div>
            <div className="ff" />
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
                  title={opt.disabled ? labels.startUnavailableHint : undefined}
                  onClick={() => {
                    if (opt.disabled) return;
                    update('startFrom', opt.key);
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
                        · {labels.startUnavailableHint}
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
            <div className="alert alert-blue" style={{ marginTop: 14 }} data-testid="wizard-clone-alert">
              {labels.cloneAlert}
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
                <td>€{form.targetRetailPriceEur.trim() || labels.empty}</td>
              </tr>
              <tr>
                <td className="muted">{labels.reviewChannelVolume}</td>
                <td>
                  {form.salesChannel} · {form.expectedVolume.trim() || labels.empty}
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
              disabled={step === 1 && nameEmpty}
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
              disabled={!canCreate || submitting}
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
