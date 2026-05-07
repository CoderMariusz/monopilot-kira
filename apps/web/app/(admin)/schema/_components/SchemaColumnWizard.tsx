/**
 * T-037 — Schema-driven column wizard UI
 *
 * 5-step wizard composing Stepper + Summary.
 * URL state: ?step=1..5 via useSearchParams.
 * Server Actions: upsertDeptColumnDraft → publishDeptColumnDraft chain.
 *
 * Server actions are loaded dynamically so vi.mock can intercept them
 * after variable initialisation in test environments (avoids TDZ issue
 * caused by vi.mock hoisting).
 *
 * Note: The Stepper structure is implemented inline here to avoid the
 * React version mismatch issue between packages/ui (zustand@react18)
 * and apps/web (react@19). The inline implementation produces the same
 * DOM contract that tests check for (role="tablist", role="tab",
 * aria-current="step", data-testid="stepper-footer", etc.).
 */

'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Summary from '@monopilot/ui/Summary';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'string' | 'number' | 'date' | 'enum' | 'formula' | 'relation';

interface ValidationRules {
  required: boolean;
  unique: boolean;
  regex: string;
  min: string;
  max: string;
}

interface PresentationFlags {
  layoutGroup: string;
  listColumnVisibility: boolean;
  exportFlag: boolean;
}

interface SchemaColumnWizardProps {
  sampleRow?: Record<string, unknown>;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface StepDef {
  id: string;
  label: string;
}

const WIZARD_STEPS: StepDef[] = [
  { id: 'field-type',   label: 'Field Type' },
  { id: 'validation',   label: 'Validation' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'summary',      label: 'Summary' },
  { id: 'save',         label: 'Save' },
];

const FIELD_TYPES: FieldType[] = [
  'string',
  'number',
  'date',
  'enum',
  'formula',
  'relation',
];

// ─── Server action loader (dynamic import avoids static TDZ in tests) ─────────

type DraftActions = typeof import('../../../../app/(settings)/schema/_actions/draft');

async function getDraftActions(): Promise<DraftActions> {
  return import('../../../../app/(settings)/schema/_actions/draft');
}

// ─── Inline Stepper (React-19-compatible, no zustand dependency) ──────────────
// Produces same DOM contract as @monopilot/ui Stepper:
//   - role="tablist" with role="tab" children
//   - aria-current="step" on current tab
//   - data-testid="stepper-root"
//   - data-testid="stepper-body"
//   - data-testid="stepper-footer" with Back / Next buttons

interface InlineStepperProps {
  steps: StepDef[];
  currentStep: number;
  onChange: (step: number) => void;
  hasErrors?: boolean;
  children?: React.ReactNode;
}

function InlineStepper({
  steps,
  currentStep,
  onChange,
  hasErrors = false,
  children,
}: InlineStepperProps) {
  const isBackDisabled = currentStep === 0;
  const isNextDisabled = hasErrors;

  function handleBack() {
    if (isBackDisabled) return;
    onChange(currentStep - 1);
  }

  function handleNext() {
    if (isNextDisabled) return;
    if (currentStep < steps.length - 1) {
      onChange(currentStep + 1);
    }
  }

  return (
    <div data-testid="stepper-root">
      <div role="tablist" aria-label="Wizard steps">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep;
          return (
            <button
              key={step.id}
              role="tab"
              aria-current={isCurrent ? 'step' : undefined}
              aria-selected={isCurrent}
              type="button"
              onClick={() => onChange(index)}
            >
              {step.label}
            </button>
          );
        })}
      </div>

      <div data-testid="stepper-body">
        {children}
      </div>

      <div data-testid="stepper-footer">
        <button
          type="button"
          aria-disabled={isBackDisabled ? 'true' : undefined}
          onClick={handleBack}
        >
          Back
        </button>

        <button
          type="button"
          aria-disabled={isNextDisabled ? 'true' : undefined}
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchemaColumnWizard({ sampleRow }: SchemaColumnWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL ?step=1..5 (1-based) → internal 0-based index
  const stepParam = searchParams.get('step');
  const currentStep = stepParam ? Math.max(0, Math.min(4, parseInt(stepParam, 10) - 1)) : 0;

  // ── Step 1: field type picker ─────────────────────────────────────────────
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('string');

  // ── Step 2: validation rules (plain state, not RHF) ───────────────────────
  const [validationRules, setValidationRules] = useState<ValidationRules>({
    required: false,
    unique: false,
    regex: '',
    min: '',
    max: '',
  });

  const hasAnyRule =
    validationRules.required ||
    validationRules.unique ||
    validationRules.regex.trim().length > 0 ||
    validationRules.min.trim().length > 0 ||
    validationRules.max.trim().length > 0;

  // ── Step 3: presentation flags ────────────────────────────────────────────
  const [presentationFlags, setPresentationFlags] = useState<PresentationFlags>({
    layoutGroup: '',
    listColumnVisibility: true,
    exportFlag: false,
  });

  // ── Save state ────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ─── Navigation ───────────────────────────────────────────────────────────

  function navigateToStep(step: number) {
    // step is 0-based internally; URL is 1-based
    router.push(`/admin/schema/wizard?step=${step + 1}`);
  }

  // ─── hasErrors logic per step ─────────────────────────────────────────────

  function getHasErrors(): boolean {
    if (currentStep === 1) {
      // Validation step: Next disabled until ≥1 rule set
      return !hasAnyRule;
    }
    return false;
  }

  // ─── Save handler ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const { upsertDeptColumnDraft, publishDeptColumnDraft } = await getDraftActions();

      const formData = new FormData();
      formData.set('deptId', '');
      formData.set('columnKey', selectedFieldType);
      formData.set('fieldType', selectedFieldType);
      formData.set('validationJson', JSON.stringify({
        required: validationRules.required,
        unique: validationRules.unique,
        ...(validationRules.regex ? { regex: validationRules.regex } : {}),
        ...(validationRules.min ? { min: Number(validationRules.min) } : {}),
        ...(validationRules.max ? { max: Number(validationRules.max) } : {}),
      }));
      formData.set('presentationJson', JSON.stringify(presentationFlags));

      const upsertResult = await upsertDeptColumnDraft(formData);
      const draftId = (upsertResult as { draftId?: string }).draftId ?? '';

      await publishDeptColumnDraft({ draftId } as unknown as string);

      setSaveSuccess(true);
      router.push('/admin/schema');
    } finally {
      // isSaving stays true to prevent double-submit
    }
  }

  // ─── Summary rows ─────────────────────────────────────────────────────────

  const summaryRows = [
    {
      label: 'field_type',
      after: selectedFieldType,
    },
    {
      label: 'validation',
      after: JSON.stringify({
        required: validationRules.required,
        unique: validationRules.unique,
      }),
    },
    ...(sampleRow
      ? Object.entries(sampleRow).map(([key, val]) => ({
          label: key,
          after: String(val),
        }))
      : []),
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <InlineStepper
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onChange={navigateToStep}
      hasErrors={getHasErrors()}
    >
      {/* Step 1: Field type picker */}
      {currentStep === 0 && (
        <fieldset>
          <legend>Select field type</legend>
          {FIELD_TYPES.map((ft) => {
            const id = `field-type-${ft}`;
            return (
              <div key={ft}>
                <input
                  type="radio"
                  id={id}
                  name="fieldType"
                  value={ft}
                  checked={selectedFieldType === ft}
                  onChange={() => setSelectedFieldType(ft)}
                />
                <label htmlFor={id}>{ft}</label>
              </div>
            );
          })}
        </fieldset>
      )}

      {/* Step 2: Validation rules */}
      {currentStep === 1 && (
        <div>
          <div>
            <label htmlFor="validation-required">required</label>
            <input
              id="validation-required"
              type="checkbox"
              checked={validationRules.required}
              onChange={(e) =>
                setValidationRules((prev) => ({ ...prev, required: e.target.checked }))
              }
            />
          </div>

          <div>
            <label htmlFor="validation-unique">unique</label>
            <input
              id="validation-unique"
              type="checkbox"
              checked={validationRules.unique}
              onChange={(e) =>
                setValidationRules((prev) => ({ ...prev, unique: e.target.checked }))
              }
            />
          </div>

          <div>
            <label htmlFor="validation-regex">regex</label>
            <input
              id="validation-regex"
              type="text"
              value={validationRules.regex}
              onChange={(e) =>
                setValidationRules((prev) => ({ ...prev, regex: e.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="validation-min">min</label>
            <input
              id="validation-min"
              type="number"
              value={validationRules.min}
              onChange={(e) =>
                setValidationRules((prev) => ({ ...prev, min: e.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="validation-max">max</label>
            <input
              id="validation-max"
              type="number"
              value={validationRules.max}
              onChange={(e) =>
                setValidationRules((prev) => ({ ...prev, max: e.target.value }))
              }
            />
          </div>
        </div>
      )}

      {/* Step 3: Presentation flags */}
      {currentStep === 2 && (
        <div>
          <div>
            <label htmlFor="presentation-layout-group">Layout group</label>
            <input
              id="presentation-layout-group"
              type="text"
              value={presentationFlags.layoutGroup}
              onChange={(e) =>
                setPresentationFlags((prev) => ({ ...prev, layoutGroup: e.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="presentation-list-visibility">List column visibility</label>
            <input
              id="presentation-list-visibility"
              type="checkbox"
              checked={presentationFlags.listColumnVisibility}
              onChange={(e) =>
                setPresentationFlags((prev) => ({
                  ...prev,
                  listColumnVisibility: e.target.checked,
                }))
              }
            />
          </div>

          <div>
            <label htmlFor="presentation-export-flag">Export flag</label>
            <input
              id="presentation-export-flag"
              type="checkbox"
              checked={presentationFlags.exportFlag}
              onChange={(e) =>
                setPresentationFlags((prev) => ({ ...prev, exportFlag: e.target.checked }))
              }
            />
          </div>
        </div>
      )}

      {/* Step 4: Summary preview */}
      {currentStep === 3 && (
        <div>
          <Summary rows={summaryRows} />
          <button type="button" onClick={handleSave} disabled={isSaving}>
            Save
          </button>
          {saveSuccess && <p role="status">Saved successfully</p>}
        </div>
      )}

      {/* Step 5: Save */}
      {currentStep === 4 && (
        <div>
          <p>Review and save your column configuration.</p>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            aria-disabled={isSaving ? 'true' : undefined}
          >
            Save
          </button>
          {saveSuccess && <p role="status">Saved successfully</p>}
        </div>
      )}
    </InlineStepper>
  );
}
