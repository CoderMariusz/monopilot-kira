'use client';

/**
 * T-033 — TEC-011 Item Create Wizard (4-step) + TEC-013 Edit reuse.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:22-136
 *   (`ProductCreateModal` — Stepper + per-step Field grid + Summary review +
 *   foot Next/Back/Cancel/Create). The prototype ships a 3-step wizard
 *   (basic / category / review); the PRD TEC-011 contract
 *   (docs/prd/03-TECHNICAL-PRD.md:629) mandates **4 steps**: basic +
 *   classification + weight mode + extensions/review. We add the dedicated
 *   "Weight & shelf life" step so the catch-weight reveal
 *   (V-TEC-02: nominal_weight + gross_weight_max + variance_tolerance_pct) gets
 *   its own surface, matching the modal's `ff-inline` weight/shelf rows
 *   (modals.jsx:102-112) and the review Summary (modals.jsx:119-132).
 *
 * Local Dialog + stepper primitives (NOT the Radix-backed @monopilot/ui Modal /
 * Stepper): the workspace ships a React 18 peer @radix-ui/react-dialog while
 * apps/web runs React 19, so mounting Radix in the jsdom unit test crashes with a
 * dual-React useRef null. Production semantics (role="dialog", aria-modal, focus
 * on open, Escape + backdrop close, labelled title; tablist for the stepper) are
 * preserved. This is the exact established deviation used by the sibling
 * items-manager.client.tsx island and settings/units/_components/UnitsManager.tsx.
 *
 * Real data: submits via the existing createItem / updateItem Server Actions
 * (withOrgContext + RLS + zod). No mocks.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import {
  Select,
  type SelectOption,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import { createItem } from '../_actions/create-item';
import {
  CANONICAL_UOMS,
  ITEM_STATUSES,
  ITEM_TYPES,
  type ItemsActionError,
  type OutputUom,
  OUTPUT_UOMS,
  SHELF_LIFE_MODES,
  WEIGHT_MODES,
} from '../_actions/shared';
import { updateItem } from '../_actions/update-item';
import { DEFAULT_WIZARD_LABELS, type ItemWizardLabels } from './item-wizard-labels';
export { DEFAULT_WIZARD_LABELS, type ItemWizardLabels } from './item-wizard-labels';

// ── i18n surface (resolved server-side; English fallbacks keep tests green) ─────

const ITEM_TYPE_LABELS: Record<(typeof ITEM_TYPES)[number], string> = {
  rm: 'Raw material',
  ingredient: 'Ingredient',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
  packaging: 'Packaging',
};
const STATUS_LABELS: Record<(typeof ITEM_STATUSES)[number], string> = {
  draft: 'Draft',
  active: 'Active',
  deprecated: 'Deprecated',
  blocked: 'Blocked',
};
const WEIGHT_MODE_LABELS: Record<(typeof WEIGHT_MODES)[number], string> = {
  fixed: 'Fixed weight',
  catch: 'Catch weight',
};
const SHELF_MODE_LABELS: Record<(typeof SHELF_LIFE_MODES)[number], string> = {
  use_by: 'Use by',
  best_before: 'Best before',
};

// (item-type options are built per-render from the localized labels bundle —
// see `typeOptions` inside the component — so co_product / byproduct / packaging
// surface with translated labels, not the hardcoded English fallback below.)
const STATUS_OPTIONS = ITEM_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const WEIGHT_MODE_OPTIONS = WEIGHT_MODES.map((value) => ({ value, label: WEIGHT_MODE_LABELS[value] }));
const SHELF_MODE_OPTIONS = SHELF_LIFE_MODES.map((value) => ({ value, label: SHELF_MODE_LABELS[value] }));

const STEP_KEYS = ['basic', 'classification', 'weight', 'review'] as const;
type StepKey = (typeof STEP_KEYS)[number];

export type WizardFormState = {
  itemCode: string;
  name: string;
  description: string;
  itemType: (typeof ITEM_TYPES)[number];
  status: (typeof ITEM_STATUSES)[number];
  productGroup: string;
  // A11 — optional supplier link. Stores the supplier CODE (not name/id); an empty
  // string means "no supplier" and the payload omits supplierCode (it is optional).
  supplierCode: string;
  uomBase: string;
  uomSecondary: string;
  weightMode: (typeof WEIGHT_MODES)[number];
  nominalWeight: string;
  tareWeight: string;
  grossWeightMax: string;
  gs1Gtin: string;
  varianceTolerancePct: string;
  shelfLifeDays: string;
  shelfLifeMode: '' | (typeof SHELF_LIFE_MODES)[number];
  // Pack hierarchy (migration 267).
  outputUom: OutputUom;
  netQtyPerEach: string;
  eachPerBox: string;
  boxesPerPallet: string;
  listPriceGbp: string;
};

export function emptyWizardForm(): WizardFormState {
  return {
    itemCode: '',
    name: '',
    description: '',
    itemType: 'rm',
    status: 'active',
    productGroup: '',
    supplierCode: '',
    uomBase: 'kg',
    uomSecondary: '',
    weightMode: 'fixed',
    nominalWeight: '',
    tareWeight: '',
    grossWeightMax: '',
    gs1Gtin: '',
    varianceTolerancePct: '',
    shelfLifeDays: '',
    shelfLifeMode: '',
    outputUom: 'base',
    netQtyPerEach: '',
    eachPerBox: '',
    boxesPerPallet: '',
    listPriceGbp: '',
  };
}

function trimOrUndefined(value: string): string | undefined {
  const t = value.trim();
  return t.length ? t : undefined;
}

function numOrUndefined(value: string): number | undefined {
  const t = value.trim();
  if (!t.length) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Net/total quantities in the live conversion helper render at a fixed 3 decimals
 * so the line reads consistently, e.g. "1 box = 10 × 0.100 kg = 1.000 kg" (per the
 * locked product example). Multipliers (each-per-box) stay integers.
 */
function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '0.000';
  return n.toFixed(3);
}

/**
 * Design-system modal form field (`.ff` — uppercase label + `.form-input`-styled
 * control). Mirrors the prototype `<Field>` primitive (_shared/modals.jsx:64-71):
 * a `.ff` block whose label is uppercase 11px muted and whose child input/select/
 * textarea inherits the `.ff input` rule. `required` renders the red `.req` glyph;
 * `help` renders `.ff-help`.
 */
function Field({
  label,
  required,
  help,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  help?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ff">
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
      {children}
      {help ? <div className="ff-help">{help}</div> : null}
    </div>
  );
}

/**
 * Compositional Select wrapper: puts the accessible name on the trigger
 * (role="combobox") rather than the wrapper div, so the field is reachable by its
 * label via getByRole('combobox', { name }). The shared @monopilot/ui Select only
 * names the trigger when used in its SelectTrigger form (the `options` prop form
 * names the wrapper div).
 */
function LabeledSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} options={options}>
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? ariaLabel} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StepDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  stepper,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  stepper: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box wide outline-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div id={titleId} className="modal-title">
              {title}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {subtitle}
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {stepper}
          <div style={{ marginTop: 14 }}>{children}</div>
        </div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export type ItemWizardMode =
  | { kind: 'create' }
  | { kind: 'edit'; itemId: string };

export function ItemWizard({
  open,
  onClose,
  mode,
  initialForm,
  labels = DEFAULT_WIZARD_LABELS,
  supplierOptions = [],
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: ItemWizardMode;
  initialForm?: WizardFormState;
  labels?: ItemWizardLabels;
  /**
   * A11 — optional supplier master list (org suppliers), resolved server-side by
   * the page (via the planning `listSuppliers` action) and threaded down the same
   * way `labels` is — the wizard never calls actions on mount. Each option's
   * `value` is the supplier CODE; `label` is the human "CODE — Name". Defaults to
   * an empty list so the field renders only the "none" choice (e.g. RTL/edit).
   */
  supplierOptions?: SelectOption[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [form, setForm] = React.useState<WizardFormState>(() => initialForm ?? emptyWizardForm());
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Reseed the form whenever the dialog (re)opens so an Edit-mode reuse picks up
  // the latest row and a fresh Create starts clean.
  // Reseed only on the open→true transition. We intentionally key on `open` alone:
  // `initialForm` is a fresh object identity per render in edit mode, so including
  // it would reseed on every keystroke and discard the user's edits.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setForm(initialForm ?? emptyWizardForm());
      setStepIndex(0);
      setError(null);
    }
    wasOpen.current = open;
  }, [open, initialForm]);

  const step: StepKey = STEP_KEYS[stepIndex];
  const isEdit = mode.kind === 'edit';
  const codeReadOnly = isEdit;

  // Localized option sets (built from labels so the UoM/output-unit dropdowns are
  // a CLOSED canonical list — no free text anywhere).
  const uomOptions: SelectOption[] = React.useMemo(
    () => CANONICAL_UOMS.map((value) => ({ value, label: labels.uomLabels[value] })),
    [labels.uomLabels],
  );
  const uomSecondaryOptions: SelectOption[] = React.useMemo(
    () => [{ value: '', label: labels.uomNone }, ...uomOptions],
    [labels.uomNone, uomOptions],
  );
  // A11 — optional supplier select: a leading "none" choice (empty value) over the
  // threaded org supplier list. Same shape/idiom as the secondary-UoM "none" row.
  const supplierSelectOptions: SelectOption[] = React.useMemo(
    () => [{ value: '', label: labels.supplierNone }, ...supplierOptions],
    [labels.supplierNone, supplierOptions],
  );
  const outputUomOptions: SelectOption[] = React.useMemo(
    () => OUTPUT_UOMS.map((value) => ({ value, label: labels.outputUomLabels[value] })),
    [labels.outputUomLabels],
  );
  // Item-type select — LOCALIZED labels (co_product / byproduct / packaging are
  // all legal per mig 248 + 255; co_product/byproduct were the reported gap).
  const typeOptions: SelectOption[] = React.useMemo(
    () => ITEM_TYPES.map((value) => ({ value, label: labels.typeLabels[value] ?? ITEM_TYPE_LABELS[value] })),
    [labels.typeLabels],
  );
  // Status select — LOCALIZED labels (draft/active/deprecated/blocked) resolved
  // from the wizard label bundle (create.statusLabels.*), English fallback kept.
  const statusOptions: SelectOption[] = React.useMemo(
    () => ITEM_STATUSES.map((value) => ({ value, label: labels.statusLabels[value] ?? STATUS_LABELS[value] })),
    [labels.statusLabels],
  );
  const filteredStatusOptions: SelectOption[] = React.useMemo(() => {
    if (!isEdit || initialForm?.status === 'blocked') return statusOptions;
    return statusOptions.filter((option) => option.value !== 'blocked');
  }, [initialForm?.status, isEdit, statusOptions]);

  const basicValid =
    form.itemCode.trim().length >= 1 && form.name.trim().length >= 1 && form.uomBase.trim().length >= 1;

  // Pack-hierarchy client validation mirrors the DB CHECK (migration 267):
  //   each ⇒ net > 0 ; box ⇒ net > 0 ∧ each_per_box > 0.
  const netNum = Number(form.netQtyPerEach);
  const eachPerBoxNum = Number(form.eachPerBox);
  const netValid = form.netQtyPerEach.trim().length > 0 && Number.isFinite(netNum) && netNum > 0;
  const eachPerBoxValid =
    form.eachPerBox.trim().length > 0 && Number.isFinite(eachPerBoxNum) && eachPerBoxNum > 0;
  const packagingValid =
    form.outputUom === 'base'
      ? true
      : form.outputUom === 'each'
        ? netValid
        : netValid && eachPerBoxValid;

  // Live conversion helper, e.g. "1 box = 10 × 0.100 kg = 1.000 kg".
  const conversionHint = (() => {
    if (form.outputUom === 'base' || !netValid) return null;
    const base = form.uomBase;
    const net = netNum;
    const eachLine = `1 ${labels.outputUomLabels.each} = ${formatQty(net)} ${base}`;
    if (form.outputUom === 'each') return eachLine;
    if (!eachPerBoxValid) return eachLine;
    const perBox = eachPerBoxNum;
    return `1 ${labels.outputUomLabels.box} = ${perBox} × ${formatQty(net)} ${base} = ${formatQty(perBox * net)} ${base}`;
  })();

  // Review-step summary of the pack hierarchy (output unit + conversion).
  const packagingReview =
    form.outputUom === 'base'
      ? labels.outputUomLabels.base
      : conversionHint ?? labels.outputUomLabels[form.outputUom];

  function update<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    setError(null);
    if (step === 'basic' && !basicValid) {
      if (form.itemCode.trim().length < 1) setError(labels.errors.codeRequired);
      else if (form.name.trim().length < 1) setError(labels.errors.nameRequired);
      else setError(labels.errors.uomRequired);
      return;
    }
    if (step === 'weight' && !packagingValid) {
      if (!netValid) setError(labels.errors.netRequired);
      else setError(labels.errors.eachPerBoxRequired);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEP_KEYS.length - 1));
  }
  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function submit() {
    setError(null);
    // Final client guard mirrors the DB CHECK before the round-trip.
    if (!packagingValid) {
      setStepIndex(STEP_KEYS.indexOf('weight'));
      setError(!netValid ? labels.errors.netRequired : labels.errors.eachPerBoxRequired);
      return;
    }
    const common = {
      name: form.name,
      itemType: form.itemType,
      status: form.status,
      uomBase: form.uomBase,
      weightMode: form.weightMode,
      description: trimOrUndefined(form.description),
      productGroup: trimOrUndefined(form.productGroup),
      uomSecondary: trimOrUndefined(form.uomSecondary),
      gs1Gtin: trimOrUndefined(form.gs1Gtin),
      nominalWeight: numOrUndefined(form.nominalWeight),
      tareWeight: numOrUndefined(form.tareWeight),
      grossWeightMax: numOrUndefined(form.grossWeightMax),
      varianceTolerancePct: numOrUndefined(form.varianceTolerancePct),
      shelfLifeDays: numOrUndefined(form.shelfLifeDays),
      shelfLifeMode: form.shelfLifeMode === '' ? undefined : form.shelfLifeMode,
      // Pack hierarchy (migration 267). For 'base' output the conversion fields are
      // omitted (sent undefined) so the action stores NULL.
      outputUom: form.outputUom,
      netQtyPerEach: form.outputUom === 'base' ? undefined : numOrUndefined(form.netQtyPerEach),
      eachPerBox: form.outputUom === 'box' ? numOrUndefined(form.eachPerBox) : undefined,
      boxesPerPallet: form.outputUom === 'base' ? undefined : numOrUndefined(form.boxesPerPallet),
      listPriceGbp: numOrUndefined(form.listPriceGbp),
    };
    // A11 — supplier link is create-only (it auto-creates an approved supplier
    // spec). Empty selection ⇒ omit supplierCode (the field is optional).
    const supplierCode = trimOrUndefined(form.supplierCode);
    startTransition(async () => {
      const result = isEdit
        ? await updateItem({ id: (mode as { itemId: string }).itemId, ...common })
        : await createItem({
            itemCode: form.itemCode,
            ...common,
            ...(supplierCode ? { supplierCode } : {}),
          });
      if (result.ok) {
        onClose();
        onSaved?.();
        router.refresh();
      } else {
        setError(labels.actionErrors[result.error]);
      }
    });
  }

  const stepLabels: Record<StepKey, string> = {
    basic: labels.steps.basic,
    classification: labels.steps.classification,
    weight: labels.steps.weight,
    review: labels.steps.review,
  };

  // Wizard step indicator — design-system `.wiz-stepper` (prototype `<Stepper>`,
  // _shared/modals.jsx:46-62): numbered pills + connecting line, current = blue,
  // completed = green ✓. We keep role="tablist"/role="tab" semantics (and the
  // back-only click affordance) on the step pills for a11y + interaction.
  const stepper = (
    <div className="wiz-stepper" role="tablist" aria-label="Wizard steps">
      {STEP_KEYS.map((key, index) => {
        const active = index === stepIndex;
        const done = index < stepIndex;
        const navigable = index < stepIndex;
        return (
          <React.Fragment key={key}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'step' : undefined}
              data-step={key}
              data-state={active ? 'active' : done ? 'complete' : 'inactive'}
              // Only allow jumping back to a completed step (forward gated by validation).
              disabled={index > stepIndex}
              onClick={() => navigable && setStepIndex(index)}
              className={`wiz-step${active ? ' current' : ''}${done ? ' done' : ''}`}
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: navigable ? 'pointer' : 'default',
              }}
            >
              <span className="wiz-step-num">{done ? '✓' : index + 1}</span>
              <span className="wiz-step-label">{stepLabels[key]}</span>
            </button>
            {index < STEP_KEYS.length - 1 ? (
              <div className={`wiz-step-line${done ? ' done' : ''}`} />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );

  const footer = (
    <>
      {stepIndex > 0 ? (
        <Button type="button" className="btn-ghost" onClick={goBack} disabled={pending}>
          {labels.back}
        </Button>
      ) : null}
      <span style={{ flex: 1 }} />
      <Button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
        {labels.cancel}
      </Button>
      {step !== 'review' ? (
        <Button type="button" className="btn-primary" data-action="next" onClick={goNext} disabled={pending}>
          {labels.next}
        </Button>
      ) : (
        <Button type="button" className="btn-primary" data-action="submit" onClick={submit} disabled={pending}>
          {pending ? labels.creating : labels.create}
        </Button>
      )}
    </>
  );

  return (
    <StepDialog
      open={open}
      onClose={onClose}
      title={labels.title}
      subtitle={labels.subtitle}
      footer={footer}
      stepper={stepper}
    >
      {step === 'basic' ? (
        <div data-step-panel="basic">
          <Field label={labels.fields.itemCode} required help={labels.fields.itemCodeHelp}>
            <Input
              name="itemCode"
              required
              maxLength={64}
              className="form-input font-mono"
              readOnly={codeReadOnly}
              value={form.itemCode}
              onChange={(e) => update('itemCode', e.currentTarget.value)}
            />
          </Field>
          <Field label={labels.fields.name} required>
            <Input
              name="name"
              required
              maxLength={256}
              className="form-input"
              value={form.name}
              onChange={(e) => update('name', e.currentTarget.value)}
            />
          </Field>
          <Field label={labels.fields.description}>
            <Input
              name="description"
              maxLength={2000}
              className="form-input"
              value={form.description}
              onChange={(e) => update('description', e.currentTarget.value)}
            />
          </Field>
        </div>
      ) : null}

      {step === 'classification' ? (
        <div data-step-panel="classification">
          <Field
            label={labels.fields.itemType}
            required
            help={form.itemType === 'intermediate' ? labels.intermediateHint : undefined}
          >
            <LabeledSelect
              value={form.itemType}
              onValueChange={(v) => update('itemType', v as WizardFormState['itemType'])}
              options={typeOptions}
              ariaLabel={labels.fields.itemType}
            />
          </Field>
          <div className="ff-inline">
            <Field label={labels.fields.status} required>
              <LabeledSelect
                value={form.status}
                onValueChange={(v) => update('status', v as WizardFormState['status'])}
                options={filteredStatusOptions}
                ariaLabel={labels.fields.status}
              />
            </Field>
            <Field label={labels.fields.productGroup}>
              <Input
                name="productGroup"
                maxLength={128}
                className="form-input"
                value={form.productGroup}
                onChange={(e) => update('productGroup', e.currentTarget.value)}
              />
            </Field>
          </div>
          <div className="ff-inline">
            <Field label={labels.fields.uomBase} required>
              <LabeledSelect
                value={form.uomBase}
                onValueChange={(v) => update('uomBase', v)}
                options={uomOptions}
                ariaLabel={labels.fields.uomBase}
              />
            </Field>
            <Field label={labels.fields.uomSecondary}>
              <LabeledSelect
                value={form.uomSecondary}
                onValueChange={(v) => update('uomSecondary', v)}
                options={uomSecondaryOptions}
                placeholder={labels.uomNone}
                ariaLabel={labels.fields.uomSecondary}
              />
            </Field>
          </div>
          {/* A11 — optional supplier link (create only). Selecting a supplier makes
              createItem auto-create an approved+active supplier spec for the item. */}
          {!isEdit ? (
            <Field label={labels.fields.supplier} help={labels.fields.supplierHelp}>
              <LabeledSelect
                value={form.supplierCode}
                onValueChange={(v) => update('supplierCode', v)}
                options={supplierSelectOptions}
                placeholder={labels.supplierNone}
                ariaLabel={labels.fields.supplier}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {step === 'weight' ? (
        <div data-step-panel="weight">
          <Field label={labels.fields.weightMode} required>
            <LabeledSelect
              value={form.weightMode}
              onValueChange={(v) => update('weightMode', v as WizardFormState['weightMode'])}
              options={WEIGHT_MODE_OPTIONS}
              ariaLabel={labels.fields.weightMode}
            />
          </Field>
          <Field label={labels.fields.gs1Gtin} htmlFor="wiz-gs1-gtin">
            <Input
              id="wiz-gs1-gtin"
              name="gs1Gtin"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={14}
              aria-label={labels.fields.gs1Gtin}
              className="form-input"
              value={form.gs1Gtin}
              onChange={(e) => update('gs1Gtin', e.currentTarget.value)}
            />
          </Field>
          {form.weightMode === 'catch' ? (
            <div
              className="alert alert-blue"
              data-reveal="catch"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span aria-hidden="true">ⓘ</span>
                <span>{labels.catchHint}</span>
              </div>
              <div className="ff-inline" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Field label={labels.fields.nominalWeight} htmlFor="wiz-nominal-weight">
                  <Input
                    id="wiz-nominal-weight"
                    name="nominalWeight"
                    type="number"
                    min={0}
                    step="0.0001"
                    aria-label={labels.fields.nominalWeight}
                    className="form-input"
                    value={form.nominalWeight}
                    onChange={(e) => update('nominalWeight', e.currentTarget.value)}
                  />
                </Field>
                <Field label={labels.fields.tareWeight} htmlFor="wiz-tare-weight">
                  <Input
                    id="wiz-tare-weight"
                    name="tareWeight"
                    type="number"
                    min={0}
                    step="0.0001"
                    aria-label={labels.fields.tareWeight}
                    className="form-input"
                    value={form.tareWeight}
                    onChange={(e) => update('tareWeight', e.currentTarget.value)}
                  />
                </Field>
                <Field label={labels.fields.grossWeightMax} htmlFor="wiz-gross-weight">
                  <Input
                    id="wiz-gross-weight"
                    name="grossWeightMax"
                    type="number"
                    min={0}
                    step="0.0001"
                    aria-label={labels.fields.grossWeightMax}
                    className="form-input"
                    value={form.grossWeightMax}
                    onChange={(e) => update('grossWeightMax', e.currentTarget.value)}
                  />
                </Field>
                <Field label={labels.fields.varianceTolerance} htmlFor="wiz-variance">
                  <Input
                    id="wiz-variance"
                    name="varianceTolerancePct"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    aria-label={labels.fields.varianceTolerance}
                    className="form-input"
                    value={form.varianceTolerancePct}
                    onChange={(e) => update('varianceTolerancePct', e.currentTarget.value)}
                  />
                </Field>
              </div>
            </div>
          ) : null}
          <div className="ff-inline">
            <Field label={labels.fields.shelfLifeDays} htmlFor="wiz-shelf-days">
              <Input
                id="wiz-shelf-days"
                name="shelfLifeDays"
                type="number"
                min={0}
                aria-label={labels.fields.shelfLifeDays}
                className="form-input"
                value={form.shelfLifeDays}
                onChange={(e) => update('shelfLifeDays', e.currentTarget.value)}
              />
            </Field>
            <Field label={labels.fields.listPriceGbp} htmlFor="wiz-list-price-gbp">
              <Input
                id="wiz-list-price-gbp"
                name="listPriceGbp"
                type="number"
                min={0}
                step="0.0001"
                aria-label={labels.fields.listPriceGbp}
                className="form-input"
                value={form.listPriceGbp}
                onChange={(e) => update('listPriceGbp', e.currentTarget.value)}
              />
            </Field>
          </div>

          <div className="ff-inline">
            <Field label={labels.fields.shelfLifeMode}>
              <LabeledSelect
                value={form.shelfLifeMode}
                onValueChange={(v) => update('shelfLifeMode', v as WizardFormState['shelfLifeMode'])}
                options={SHELF_MODE_OPTIONS}
                placeholder="—"
                ariaLabel={labels.fields.shelfLifeMode}
              />
            </Field>
          </div>

          {/* ── Packaging / output unit (migration 267 pack hierarchy) ───────── */}
          <fieldset
            data-section="packaging"
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', marginTop: 6 }}
          >
            <legend style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '0 6px' }}>
              {labels.fields.packaging}
            </legend>
            <Field label={labels.fields.outputUom} required help={labels.packagingHelp}>
              <LabeledSelect
                value={form.outputUom}
                onValueChange={(v) => update('outputUom', v as OutputUom)}
                options={outputUomOptions}
                ariaLabel={labels.fields.outputUom}
              />
            </Field>

            {form.outputUom !== 'base' ? (
              <div className="ff-inline" data-reveal="packaging">
                <Field
                  label={`${labels.fields.netQtyPerEach} (${form.uomBase})`}
                  required
                  htmlFor="wiz-net-per-each"
                >
                  <Input
                    id="wiz-net-per-each"
                    name="netQtyPerEach"
                    type="number"
                    min={0}
                    step="0.0001"
                    aria-label={labels.fields.netQtyPerEach}
                    className="form-input"
                    value={form.netQtyPerEach}
                    onChange={(e) => update('netQtyPerEach', e.currentTarget.value)}
                  />
                </Field>
                {form.outputUom === 'box' ? (
                  <Field label={labels.fields.eachPerBox} required htmlFor="wiz-each-per-box">
                    <Input
                      id="wiz-each-per-box"
                      name="eachPerBox"
                      type="number"
                      min={1}
                      step="1"
                      aria-label={labels.fields.eachPerBox}
                      className="form-input"
                      value={form.eachPerBox}
                      onChange={(e) => update('eachPerBox', e.currentTarget.value)}
                    />
                  </Field>
                ) : null}
                <Field label={labels.fields.boxesPerPallet} htmlFor="wiz-boxes-per-pallet">
                  <Input
                    id="wiz-boxes-per-pallet"
                    name="boxesPerPallet"
                    type="number"
                    min={1}
                    step="1"
                    aria-label={labels.fields.boxesPerPallet}
                    className="form-input"
                    value={form.boxesPerPallet}
                    onChange={(e) => update('boxesPerPallet', e.currentTarget.value)}
                  />
                </Field>
              </div>
            ) : null}

            {conversionHint ? (
              <div className="ff-help" data-conversion-hint style={{ marginTop: 8, color: 'var(--text)' }}>
                {conversionHint}
              </div>
            ) : null}
          </fieldset>
        </div>
      ) : null}

      {step === 'review' ? (
        <div data-step-panel="review">
          {/* Read-only review block — prototype <Summary> (_shared/modals.jsx:87-97):
              key/value rows, value in mono, the code row emphasised. */}
          <dl
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--gray-050)',
              padding: '4px 12px',
              marginBottom: 12,
            }}
          >
            {(
              [
                [labels.fields.itemCode, form.itemCode, true],
                [labels.fields.name, form.name, false],
                [labels.fields.itemType, labels.typeLabels[form.itemType] ?? ITEM_TYPE_LABELS[form.itemType], false],
                [labels.fields.status, labels.statusLabels[form.status] ?? STATUS_LABELS[form.status], false],
                [labels.fields.uomBase, labels.uomLabels[form.uomBase as keyof typeof labels.uomLabels] ?? form.uomBase, true],
                [labels.review.packaging, packagingReview, false],
                [labels.fields.weightMode, WEIGHT_MODE_LABELS[form.weightMode], false],
                [labels.fields.gs1Gtin, form.gs1Gtin, true],
                [labels.fields.nominalWeight, form.nominalWeight, true],
                [labels.fields.tareWeight, form.tareWeight, true],
                [labels.fields.grossWeightMax, form.grossWeightMax, true],
                [labels.fields.listPriceGbp, form.listPriceGbp, true],
              ] as Array<[string, string, boolean]>
            ).map(([label, value, mono], i, rows) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '7px 0',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <dt className="muted">{label}</dt>
                <dd className={mono ? 'mono' : ''} style={{ fontWeight: 500, color: 'var(--text)' }}>
                  {value || '—'}
                </dd>
              </div>
            ))}
          </dl>
          <div className="alert alert-green" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 0 }}>
            <span aria-hidden="true">✓</span>
            <span>{labels.review.ready}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
          {error}
        </p>
      ) : null}
    </StepDialog>
  );
}

export default ItemWizard;
