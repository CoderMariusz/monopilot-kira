/**
 * T-037 — Schema-driven column wizard UI
 * T-095 — step 2 refactor: React-Hook-Form + Zod resolver via @monopilot/ui.
 *
 * 5-step wizard composing the real @monopilot/ui <Stepper/> + <Field/> + <Summary/>.
 * URL state: ?step=1..5 via useSearchParams.
 * Server Actions: upsertDeptColumnDraft → publishDeptColumnDraft chain.
 *
 * Server actions are loaded dynamically so vi.mock can intercept them
 * after variable initialisation in test environments (avoids TDZ issue
 * caused by vi.mock hoisting).
 *
 * Step 2 (validation rules) is now driven by react-hook-form + zodResolver
 * (schemaColumnValidationSchema). The earlier "plain state, not RHF" shortcut
 * — a hold-over from the T-037 carry-forward while React-19 peerDeps were
 * unaligned (FT-033 / T-093) — has been removed. The Stepper's Next button is
 * gated on RHF formState; an attempted advance with no rule set runs the RHF
 * validation pass, surfaces the error, and moves focus to the first invalid
 * field (regex).
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Stepper, { type StepDef } from '@monopilot/ui/Stepper';
import Field from '@monopilot/ui/Field';
import Summary from '@monopilot/ui/Summary';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'string' | 'number' | 'date' | 'enum' | 'formula' | 'relation';

interface PresentationFlags {
  layoutGroup: string;
  listColumnVisibility: boolean;
  exportFlag: boolean;
}

interface SchemaColumnWizardProps {
  /**
   * Department whose schema is being edited. The Server Action will reject a
   * blank deptId, so this MUST be provided by the parent route once the
   * department picker / route param is wired. Defaults to '' so existing
   * tests + the placeholder /admin/schema/wizard route compile; the runtime
   * `handleSave` guard throws if it's still blank at submit time.
   */
  deptId?: string;
  sampleRow?: Record<string, unknown>;
}

// ─── Step 2 — Zod schema (T-095) ───────────────────────────────────────────────
// Validation rules DSL for §6 step 2. The cross-field rule requires at least one
// rule to be set; its message is attached to `regex` so RHF focuses that field
// first (matching the prototype field order: regex is the first text control).

const schemaColumnValidationSchema = z
  .object({
    required: z.boolean(),
    unique: z.boolean(),
    regex: z.string(),
    min: z.string(),
    max: z.string(),
  })
  .refine(
    (v) =>
      v.required ||
      v.unique ||
      v.regex.trim().length > 0 ||
      v.min.trim().length > 0 ||
      v.max.trim().length > 0,
    {
      message: 'Set at least one validation rule before continuing.',
      path: ['regex'],
    },
  );

type ValidationRules = z.infer<typeof schemaColumnValidationSchema>;

const VALIDATION_DEFAULTS: ValidationRules = {
  required: false,
  unique: false,
  regex: '',
  min: '',
  max: '',
};

// ─── Step definitions ─────────────────────────────────────────────────────────

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

type DraftActions = typeof import('../../../../app/(settings)/schema/_actions/draft.js');

async function getDraftActions(): Promise<DraftActions> {
  return import('../../../../app/(settings)/schema/_actions/draft.js');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchemaColumnWizard({ deptId: deptIdProp, sampleRow }: SchemaColumnWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // deptId resolution: prop wins, then URL ?deptId=, else empty (handleSave guard catches).
  const deptId = deptIdProp ?? searchParams.get('deptId') ?? '';

  // URL ?step=1..5 (1-based) → internal 0-based index
  const stepParam = searchParams.get('step');
  const currentStep = stepParam ? Math.max(0, Math.min(4, parseInt(stepParam, 10) - 1)) : 0;

  // ── Step 1: field type picker ─────────────────────────────────────────────
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('string');

  // ── Step 2: validation rules — React-Hook-Form + Zod resolver (T-095) ─────
  const form = useForm<ValidationRules>({
    resolver: zodResolver(schemaColumnValidationSchema),
    mode: 'onChange',
    defaultValues: VALIDATION_DEFAULTS,
  });
  const { control, watch, getValues, trigger, setFocus } = form;

  // Subscribe to changes so `hasAnyRule` re-derives on every keystroke/toggle.
  const watched = watch();
  const hasAnyRule =
    watched.required ||
    watched.unique ||
    watched.regex.trim().length > 0 ||
    watched.min.trim().length > 0 ||
    watched.max.trim().length > 0;

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

  const navigateToStep = useCallback(
    (step: number) => {
      // step is 0-based internally; URL is 1-based
      router.push(`/admin/schema/wizard?step=${step + 1}`);
    },
    [router],
  );

  // ─── hasErrors logic per step (drives Stepper Next aria-disabled) ──────────

  function getHasErrors(): boolean {
    if (currentStep === 1) {
      // Validation step: Next gated until ≥1 rule set.
      return !hasAnyRule;
    }
    return false;
  }

  // ─── RHF validation-on-Next interceptor (T-095) ────────────────────────────
  // The @monopilot/ui Stepper owns its Next button and short-circuits when
  // aria-disabled, so it never fires a callback we could validate inside. We
  // catch the click in the CAPTURE phase on a wrapping element — this runs
  // before the Stepper's bubble-phase onClick — and, while on the validation
  // step, run the RHF/Zod pass: surface the error + focus the first invalid
  // field. This keeps the disabled-Next contract (no step advance) while making
  // the failure observable, which the plain-state impl could not do.
  const rootRef = useRef<HTMLDivElement>(null);

  const handleCaptureClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (currentStep !== 1) return;
      const target = e.target as HTMLElement;
      const btn = target.closest('button');
      if (!btn) return;
      // Only react to the footer Next button.
      const footer = btn.closest('[data-testid="stepper-footer"]');
      if (!footer) return;
      if (!/next/i.test(btn.textContent ?? '')) return;

      // Run RHF validation. If invalid, surface error + focus first invalid field.
      void trigger().then((valid) => {
        if (!valid) {
          setFocus('regex');
        }
      });
    },
    [currentStep, trigger, setFocus],
  );

  // ─── Save handler ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!deptId) {
        // Defensive: never silently submit a blank deptId (the upstream Server
        // Action requires a real uuid; an empty string would either FK-fail or
        // worse, succeed with cross-tenant context after RLS coercion).
        throw new Error('SchemaColumnWizard: missing required prop `deptId`');
      }

      const { upsertDeptColumnDraft, publishDeptColumnDraft } = await getDraftActions();

      const rules = getValues();
      const formData = new FormData();
      formData.set('deptId', deptId);
      formData.set('columnKey', selectedFieldType);
      formData.set('fieldType', selectedFieldType);
      formData.set('validationJson', JSON.stringify({
        required: rules.required,
        unique: rules.unique,
        ...(rules.regex ? { regex: rules.regex } : {}),
        ...(rules.min ? { min: Number(rules.min) } : {}),
        ...(rules.max ? { max: Number(rules.max) } : {}),
      }));
      formData.set('presentationJson', JSON.stringify(presentationFlags));

      const upsertResult = await upsertDeptColumnDraft(formData);
      const draftId = (upsertResult as { draftId?: string }).draftId ?? '';
      if (!draftId) {
        throw new Error('SchemaColumnWizard: upsertDeptColumnDraft returned no draftId');
      }

      // publishDeptColumnDraft signature is (draftId: string).
      await publishDeptColumnDraft(draftId);

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
        required: watched.required,
        unique: watched.unique,
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
    <FormProvider {...form}>
      <div ref={rootRef} onClickCapture={handleCaptureClick}>
        <Stepper
          wizardId="schema-column-wizard"
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

          {/* Step 2: Validation rules — RHF + Zod (T-095) */}
          {currentStep === 1 && (
            <div>
              {/* required — boolean toggle (Controller; checkboxes need `checked`) */}
              <div>
                <label htmlFor="validation-required">required</label>
                <Controller
                  name="required"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="validation-required"
                      type="checkbox"
                      name={field.name}
                      ref={field.ref}
                      checked={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  )}
                />
              </div>

              {/* unique — boolean toggle */}
              <div>
                <label htmlFor="validation-unique">unique</label>
                <Controller
                  name="unique"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="validation-unique"
                      type="checkbox"
                      name={field.name}
                      ref={field.ref}
                      checked={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  )}
                />
              </div>

              {/* regex / min / max — text + number via the @monopilot/ui Field
                  primitive, which composes RHF Controller + the shared Input. */}
              <Field name="regex" label="regex" type="text" />
              <Field name="min" label="min" type="number" />
              <Field name="max" label="max" type="number" />
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
        </Stepper>
      </div>
    </FormProvider>
  );
}
