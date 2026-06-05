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
  ITEM_STATUSES,
  ITEM_TYPES,
  type ItemsActionError,
  SHELF_LIFE_MODES,
  WEIGHT_MODES,
} from '../_actions/shared';
import { updateItem } from '../_actions/update-item';

// ── i18n surface (resolved server-side; English fallbacks keep tests green) ─────
export type ItemWizardLabels = {
  title: string;
  subtitle: string;
  cancel: string;
  back: string;
  next: string;
  create: string;
  creating: string;
  steps: { basic: string; classification: string; weight: string; review: string };
  fields: {
    itemCode: string;
    itemCodeHelp: string;
    name: string;
    description: string;
    itemType: string;
    status: string;
    uomBase: string;
    uomSecondary: string;
    productGroup: string;
    weightMode: string;
    nominalWeight: string;
    grossWeightMax: string;
    varianceTolerance: string;
    shelfLifeDays: string;
    shelfLifeMode: string;
  };
  catchHint: string;
  review: { ready: string };
  errors: { codeRequired: string; nameRequired: string; uomRequired: string };
  actionErrors: Record<ItemsActionError, string>;
};

export const DEFAULT_WIZARD_LABELS: ItemWizardLabels = {
  title: 'Create item',
  subtitle: 'Universal item master — links to BOM, spec and allergen matrix.',
  cancel: 'Cancel',
  back: 'Back',
  next: 'Next',
  create: 'Create item',
  creating: 'Creating…',
  steps: { basic: 'Basic info', classification: 'Classification', weight: 'Weight & shelf life', review: 'Review & create' },
  fields: {
    itemCode: 'Item code',
    itemCodeHelp: 'Alphanumeric with . _ - separators. Unique per organization.',
    name: 'Name',
    description: 'Short description',
    itemType: 'Item type',
    status: 'Status',
    uomBase: 'Base UoM',
    uomSecondary: 'Secondary UoM',
    productGroup: 'Product group',
    weightMode: 'Weight mode',
    nominalWeight: 'Nominal weight',
    grossWeightMax: 'Gross weight max',
    varianceTolerance: 'Variance tolerance (%)',
    shelfLifeDays: 'Shelf life (days)',
    shelfLifeMode: 'Shelf-life mode',
  },
  catchHint: 'Catch weight requires nominal weight, gross weight max and a variance tolerance.',
  review: { ready: 'Ready to create. An audit record will be logged.' },
  errors: {
    codeRequired: 'Item code is required (min 1 char).',
    nameRequired: 'Name is required (min 1 char).',
    uomRequired: 'Base UoM is required.',
  },
  actionErrors: {
    already_exists: 'An item with that code already exists in this organization.',
    forbidden: 'You do not have permission to perform this action.',
    invalid_input: 'Please check the values and try again.',
    not_found: 'That item no longer exists.',
    persistence_failed: 'Could not save. Please try again.',
  },
};

const ITEM_TYPE_LABELS: Record<(typeof ITEM_TYPES)[number], string> = {
  rm: 'Raw material',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
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

const TYPE_OPTIONS = ITEM_TYPES.map((value) => ({ value, label: ITEM_TYPE_LABELS[value] }));
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
  uomBase: string;
  uomSecondary: string;
  weightMode: (typeof WEIGHT_MODES)[number];
  nominalWeight: string;
  grossWeightMax: string;
  varianceTolerancePct: string;
  shelfLifeDays: string;
  shelfLifeMode: '' | (typeof SHELF_LIFE_MODES)[number];
};

export function emptyWizardForm(): WizardFormState {
  return {
    itemCode: '',
    name: '',
    description: '',
    itemType: 'rm',
    status: 'active',
    productGroup: '',
    uomBase: 'kg',
    uomSecondary: '',
    weightMode: 'fixed',
    nominalWeight: '',
    grossWeightMax: '',
    varianceTolerancePct: '',
    shelfLifeDays: '',
    shelfLifeMode: '',
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
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: ItemWizardMode;
  initialForm?: WizardFormState;
  labels?: ItemWizardLabels;
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

  const basicValid =
    form.itemCode.trim().length >= 1 && form.name.trim().length >= 1 && form.uomBase.trim().length >= 1;

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
    setStepIndex((i) => Math.min(i + 1, STEP_KEYS.length - 1));
  }
  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function submit() {
    setError(null);
    const common = {
      name: form.name,
      itemType: form.itemType,
      status: form.status,
      uomBase: form.uomBase,
      weightMode: form.weightMode,
      description: trimOrUndefined(form.description),
      productGroup: trimOrUndefined(form.productGroup),
      uomSecondary: trimOrUndefined(form.uomSecondary),
      varianceTolerancePct: numOrUndefined(form.varianceTolerancePct),
      shelfLifeDays: numOrUndefined(form.shelfLifeDays),
      shelfLifeMode: form.shelfLifeMode === '' ? undefined : form.shelfLifeMode,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateItem({ id: (mode as { itemId: string }).itemId, ...common })
        : await createItem({ itemCode: form.itemCode, ...common });
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
          <Field label={labels.fields.itemType} required>
            <LabeledSelect
              value={form.itemType}
              onValueChange={(v) => update('itemType', v as WizardFormState['itemType'])}
              options={TYPE_OPTIONS}
              ariaLabel={labels.fields.itemType}
            />
          </Field>
          <div className="ff-inline">
            <Field label={labels.fields.status} required>
              <LabeledSelect
                value={form.status}
                onValueChange={(v) => update('status', v as WizardFormState['status'])}
                options={STATUS_OPTIONS}
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
              <Input
                name="uomBase"
                required
                maxLength={32}
                className="form-input"
                value={form.uomBase}
                onChange={(e) => update('uomBase', e.currentTarget.value)}
              />
            </Field>
            <Field label={labels.fields.uomSecondary}>
              <Input
                name="uomSecondary"
                maxLength={32}
                className="form-input"
                value={form.uomSecondary}
                onChange={(e) => update('uomSecondary', e.currentTarget.value)}
              />
            </Field>
          </div>
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
              <div className="ff-inline" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
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
                [labels.fields.itemType, ITEM_TYPE_LABELS[form.itemType], false],
                [labels.fields.status, STATUS_LABELS[form.status], false],
                [labels.fields.uomBase, form.uomBase, true],
                [labels.fields.weightMode, WEIGHT_MODE_LABELS[form.weightMode], false],
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
