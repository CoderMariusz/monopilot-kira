'use client';

/**
 * T-035 — BriefCreateModal (MODAL-02, New Brief).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:46-86 (BriefCreateModal)
 *
 * Translation notes (from the prototype / prototype-index-npd.json#brief_create_modal):
 *   - window.Modal + foot Cancel/Create          → @monopilot/ui Modal (Radix dialog) + RHF FormProvider.
 *   - Template radio-card grid (2 clickable divs) → accessible role="radiogroup" of two role="radio"
 *     cards; values mapped to the createBrief enum 'single_component' | 'multi_component'.
 *   - Local useState per field                    → useForm({ resolver: zodResolver(schema) }).
 *   - devCode regex /^DEV\d{4}-\d+$/              → z.string().regex(...) — mirrors the createBrief
 *     server schema (/^DEV(?:\d{2}|\d{4})-\d+$/) so the modal accepts the same codes the action accepts.
 *   - Mock redirect comment                       → onCreated(briefId, npdProjectId) callback; the page
 *     maps it to router.push to the new Brief editor.
 *
 * 2026-05-03 E2E spine patch (applied):
 *   - Copy states that a Brief creates a linked NPD project at G0 (subtitle + info note).
 *
 * Deviations (logged):
 *   - The prototype has "Product name" and "Volume (pcs/week)" fields. The merged createBrief
 *     Server Action (T-031) accepts only (template, devCode) — product name + volume are captured
 *     in the Brief editor (T-034), not at creation. Those two fields are therefore omitted so the
 *     modal cannot collect data the action would silently drop. The two prototype fields that map
 *     to the real action (Template + Dev Code) are kept 1:1.
 *
 * The Server Action is injected (createBriefAction) so the component stays a pure client form;
 * the page wires the real T-031 createBrief action
 * (apps/web/app/(npd)/brief/actions/create-brief.ts) — imported, never authored here.
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';

export type BriefTemplate = 'single_component' | 'multi_component';

// Server Action signature (owned by T-031 — imported by the page, injected here).
export type CreateBriefAction = (
  template: BriefTemplate,
  devCode: string,
) => Promise<{ ok: true; briefId: string; npdProjectId: string; devCode: string }>;

export type BriefCreateLabels = {
  title: string;
  subtitle: string;
  templateLabel: string;
  templateSingle: string;
  templateSingleHint: string;
  templateMulti: string;
  templateMultiHint: string;
  fieldDevCode: string;
  fieldDevCodeHint: string;
  projectNote: string;
  cancel: string;
  create: string;
  creating: string;
  errorDevCode: string;
  errorGeneric: string;
};

// devCode mirror of the merged createBrief schema (/^DEV(?:\d{2}|\d{4})-\d+$/).
const DEV_CODE_PATTERN = /^DEV(?:\d{2}|\d{4})-\d+$/;

const TEMPLATE_VALUES: BriefTemplate[] = ['single_component', 'multi_component'];

function makeSchema(labels: BriefCreateLabels) {
  return z.object({
    template: z.enum(['single_component', 'multi_component']),
    devCode: z.string().trim().min(1, labels.errorDevCode).regex(DEV_CODE_PATTERN, labels.errorDevCode),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function BriefCreateModal({
  open,
  labels,
  createBriefAction,
  onCreated,
  onClose,
}: {
  open: boolean;
  labels: BriefCreateLabels;
  createBriefAction?: CreateBriefAction;
  /** Called with the new brief + project ids on success; the page maps this to navigation. */
  onCreated: (result: { briefId: string; npdProjectId: string }) => void;
  onClose: () => void;
}) {
  const schema = React.useMemo(() => makeSchema(labels), [labels]);
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { template: 'single_component', devCode: '' },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = methods;

  const selectedTemplate = watch('template');
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      methods.reset({ template: 'single_component', devCode: '' });
      setServerError(null);
    }
  }, [open, methods]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createBriefAction?.(values.template, values.devCode);
      if (result?.ok) {
        onCreated({ briefId: result.briefId, npdProjectId: result.npdProjectId });
      }
    } catch {
      setServerError(labels.errorGeneric);
    }
  });

  const submitDisabled = !isValid || isSubmitting || !createBriefAction;

  const templateCards: { value: BriefTemplate; label: string; hint: string }[] = [
    { value: 'single_component', label: labels.templateSingle, hint: labels.templateSingleHint },
    { value: 'multi_component', label: labels.templateMulti, hint: labels.templateMultiHint },
  ];

  function selectTemplate(value: BriefTemplate) {
    setValue('template', value, { shouldValidate: true, shouldDirty: true });
  }

  function handleTemplateKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = TEMPLATE_VALUES[(index + 1) % TEMPLATE_VALUES.length];
      selectTemplate(next);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = TEMPLATE_VALUES[(index - 1 + TEMPLATE_VALUES.length) % TEMPLATE_VALUES.length];
      selectTemplate(prev);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      selectTemplate(TEMPLATE_VALUES[index]);
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="briefCreate">
      <Modal.Header title={labels.title} />
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <Modal.Body>
            <div className="grid gap-4">
              <p className="text-xs text-slate-500">{labels.subtitle}</p>

              <fieldset className="grid gap-1">
                <legend className="text-sm font-medium text-slate-700">
                  {labels.templateLabel} <span aria-label="required">*</span>
                </legend>
                <div
                  role="radiogroup"
                  aria-label={labels.templateLabel}
                  data-testid="brief-create-template"
                  className="mt-1 flex gap-2"
                >
                  {templateCards.map((card, index) => {
                    const checked = selectedTemplate === card.value;
                    return (
                      <button
                        key={card.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        data-value={card.value}
                        onClick={() => selectTemplate(card.value)}
                        onKeyDown={(event) => handleTemplateKeyDown(event, index)}
                        className={[
                          'flex-1 rounded-md border-2 p-3 text-left',
                          checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white',
                        ].join(' ')}
                      >
                        <span className="block text-sm font-semibold text-slate-900">{card.label}</span>
                        <span className="block text-[11px] text-slate-500">{card.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-1">
                <label htmlFor="brief-create-dev-code" className="text-sm font-medium text-slate-700">
                  {labels.fieldDevCode} <span aria-label="required">*</span>
                </label>
                <Input
                  id="brief-create-dev-code"
                  className="font-mono"
                  placeholder="DEV26-052"
                  aria-invalid={errors.devCode ? 'true' : undefined}
                  aria-describedby={errors.devCode ? 'brief-create-dev-code-error' : 'brief-create-dev-code-hint'}
                  {...register('devCode')}
                />
                {errors.devCode ? (
                  <span id="brief-create-dev-code-error" role="alert" className="text-xs text-red-700">
                    {errors.devCode.message}
                  </span>
                ) : (
                  <span id="brief-create-dev-code-hint" className="text-xs text-slate-500">
                    {labels.fieldDevCodeHint}
                  </span>
                )}
              </div>

              <div
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
                data-testid="brief-create-project-note"
                role="note"
              >
                {labels.projectNote}
              </div>

              {serverError ? (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {serverError}
                </div>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn--secondary text-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="text-sm" disabled={submitDisabled}>
              {isSubmitting ? labels.creating : labels.create}
            </Button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

export default BriefCreateModal;
