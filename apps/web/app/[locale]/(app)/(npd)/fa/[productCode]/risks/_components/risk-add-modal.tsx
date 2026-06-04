'use client';

/**
 * T-082 — RiskAddModal (MODAL-07, Add / Edit risk + lifecycle transitions).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:297-346 (RiskAddModal)
 *
 * Translation notes (from the prototype):
 *   - Modal/Field/foot Cancel+Save     → @monopilot/ui Modal (Radix dialog) + RHF FormProvider
 *   - <textarea> description (max 300)  → shadcn Textarea + zod max(300)
 *   - raw <select> Low/Med/High         → shadcn Select (combobox); mapped to numeric 1/2/3 for the action
 *   - score = nmap[L] * nmap[I] badge   → live-computed RiskScoreBadge (color + text, a11y)
 *   - <textarea> mitigation (max 500)   → shadcn Textarea + zod max(500)
 *   - raw <select> status Open/Mit/Closed→ lifecycle action buttons (Mitigate/Close/Reopen) per §18
 *
 * §18 reason contract: a lifecycle transition (Mitigate / Close / Reopen) requires a
 * reason ≥10 chars. Save is gated by zod and the Server Action (updateRisk) is NOT
 * invoked while the reason is too short — a red-line for this task.
 *
 * Actions are injected (createRiskAction / updateRiskAction) so the component stays a
 * pure client form; the page wires the real T-081 Server Actions. They are owned by T-081
 * (imported, never authored here).
 */

import React from 'react';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';
import Input from '@monopilot/ui/Input';

import type { RiskRegisterLabels, RiskRow, RiskState } from './risk-register-screen';

// Server Action signatures (owned by T-081 — imported by the page, injected here).
export type CreateRiskAction = (input: {
  productCode: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  mitigation?: string | null;
}) => Promise<{ ok: boolean } & Record<string, unknown>>;

export type UpdateRiskAction = (input: {
  productCode: string;
  riskId: string;
  patch?: {
    title?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    mitigation?: string | null;
  };
  transition?: { toState: RiskState; reason: string };
}) => Promise<{ ok: boolean } & Record<string, unknown>>;

type Level = '1' | '2' | '3';
type Transition = { toState: RiskState; reason: string };

const LEVELS: Level[] = ['1', '2', '3'];

function makeSchema(labels: RiskRegisterLabels) {
  return z.object({
    description: z
      .string()
      .trim()
      .min(1, labels.errorRequired)
      .max(300, labels.errorTooLong),
    likelihood: z.enum(['1', '2', '3']),
    impact: z.enum(['1', '2', '3']),
    mitigation: z.string().max(500, labels.errorTooLong).optional().or(z.literal('')),
    owner: z.string().optional().or(z.literal('')),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function scoreVariant(score: number): BadgeVariant {
  if (score >= 6) return 'danger';
  if (score >= 3) return 'warning';
  return 'muted';
}

function levelLabel(level: Level, kind: 'likelihood' | 'impact', labels: RiskRegisterLabels): string {
  if (kind === 'likelihood') {
    return level === '1' ? labels.likelihoodLow : level === '2' ? labels.likelihoodMed : labels.likelihoodHigh;
  }
  return level === '1' ? labels.impactLow : level === '2' ? labels.impactMed : labels.impactHigh;
}

export function RiskAddModal({
  open,
  mode,
  productCode,
  risk,
  labels,
  onClose,
  createRiskAction,
  updateRiskAction,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  productCode: string;
  risk?: RiskRow;
  labels: RiskRegisterLabels;
  onClose: () => void;
  createRiskAction?: CreateRiskAction;
  updateRiskAction?: UpdateRiskAction;
}) {
  const schema = React.useMemo(() => makeSchema(labels), [labels]);
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: {
      description: risk?.description ?? '',
      likelihood: (String(risk?.likelihood ?? 2) as Level) ?? '2',
      impact: (String(risk?.impact ?? 2) as Level) ?? '2',
      mitigation: risk?.mitigation ?? '',
      owner: risk?.owner ?? '',
    },
  });

  const {
    control,
    handleSubmit,
    register,
    watch,
    formState: { errors, isSubmitting },
  } = methods;

  // Pending lifecycle transition (edit mode only). Buttons set the target state;
  // the reason textarea then appears and must be ≥10 chars (§18).
  const [transition, setTransition] = React.useState<Transition | null>(null);
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const likelihood = Number(watch('likelihood') ?? 2);
  const impact = Number(watch('impact') ?? 2);
  const score = likelihood * impact;

  const startTransition = (toState: RiskState) => {
    setReasonError(null);
    setTransition({ toState, reason: '' });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    // Lifecycle transition path: reason gating (§18 ≥10 chars). The Server Action
    // is NOT called while the reason is too short.
    if (transition) {
      const reason = transition.reason.trim();
      if (reason.length < 10) {
        setReasonError(labels.errorReasonShort);
        return;
      }
      const result = await updateRiskAction?.({
        productCode,
        riskId: risk!.id,
        patch: {
          description: values.description,
          likelihood: Number(values.likelihood),
          impact: Number(values.impact),
          mitigation: values.mitigation ? values.mitigation : null,
        },
        transition: { toState: transition.toState, reason },
      });
      if (result && !result.ok) {
        setServerError(labels.error);
        return;
      }
      onClose();
      return;
    }

    if (mode === 'edit') {
      const result = await updateRiskAction?.({
        productCode,
        riskId: risk!.id,
        patch: {
          description: values.description,
          likelihood: Number(values.likelihood),
          impact: Number(values.impact),
          mitigation: values.mitigation ? values.mitigation : null,
        },
      });
      if (result && !result.ok) {
        setServerError(labels.error);
        return;
      }
      onClose();
      return;
    }

    const result = await createRiskAction?.({
      productCode,
      title: values.description.slice(0, 120),
      description: values.description,
      likelihood: Number(values.likelihood),
      impact: Number(values.impact),
      mitigation: values.mitigation ? values.mitigation : null,
    });
    if (result && !result.ok) {
      setServerError(labels.error);
      return;
    }
    onClose();
  });

  const likelihoodOptions = LEVELS.map((l) => ({ value: l, label: levelLabel(l, 'likelihood', labels) }));
  const impactOptions = LEVELS.map((l) => ({ value: l, label: levelLabel(l, 'impact', labels) }));

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="riskAdd">
      <Modal.Header title={mode === 'edit' ? labels.modalTitleEdit : labels.modalTitleAdd} />
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <Modal.Body>
            <div className="grid gap-4">
              <div className="grid gap-1">
                <label htmlFor="risk-description" className="text-sm font-medium text-slate-700">
                  {labels.fieldDescription} <span aria-label="required">*</span>
                </label>
                <Textarea
                  id="risk-description"
                  rows={2}
                  aria-invalid={errors.description ? 'true' : undefined}
                  aria-describedby={errors.description ? 'risk-description-error' : 'risk-description-hint'}
                  {...register('description')}
                />
                {errors.description ? (
                  <span id="risk-description-error" role="alert" className="text-xs text-red-700">
                    {errors.description.message}
                  </span>
                ) : (
                  <span id="risk-description-hint" className="text-xs text-slate-500">
                    {labels.fieldDescriptionHint}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <span id="risk-likelihood-label" className="text-sm font-medium text-slate-700">
                    {labels.fieldLikelihood} <span aria-label="required">*</span>
                  </span>
                  <Controller
                    control={control}
                    name="likelihood"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} options={likelihoodOptions}>
                        <SelectTrigger aria-label={labels.fieldLikelihood}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {likelihoodOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="grid gap-1">
                  <span id="risk-impact-label" className="text-sm font-medium text-slate-700">
                    {labels.fieldImpact} <span aria-label="required">*</span>
                  </span>
                  <Controller
                    control={control}
                    name="impact"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} options={impactOptions}>
                        <SelectTrigger aria-label={labels.fieldImpact}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {impactOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {labels.scoreLabel}:{' '}
                <Badge variant={scoreVariant(score)} aria-label={`${labels.scoreLabel} ${score}`}>
                  {score}
                </Badge>
              </div>

              <div className="grid gap-1">
                <label htmlFor="risk-mitigation" className="text-sm font-medium text-slate-700">
                  {labels.fieldMitigation}
                </label>
                <Textarea
                  id="risk-mitigation"
                  rows={2}
                  aria-invalid={errors.mitigation ? 'true' : undefined}
                  aria-describedby={errors.mitigation ? 'risk-mitigation-error' : 'risk-mitigation-hint'}
                  {...register('mitigation')}
                />
                {errors.mitigation ? (
                  <span id="risk-mitigation-error" role="alert" className="text-xs text-red-700">
                    {errors.mitigation.message}
                  </span>
                ) : (
                  <span id="risk-mitigation-hint" className="text-xs text-slate-500">
                    {labels.fieldMitigationHint}
                  </span>
                )}
              </div>

              <div className="grid gap-1">
                <label htmlFor="risk-owner" className="text-sm font-medium text-slate-700">
                  {labels.fieldOwner}
                </label>
                <Input id="risk-owner" {...register('owner')} />
              </div>

              {mode === 'edit' && risk ? (
                <div className="grid gap-2 rounded-md border border-slate-200 p-3">
                  <span className="text-sm font-medium text-slate-700">{labels.fieldStatus}</span>
                  <div className="flex flex-wrap gap-2">
                    {risk.state === 'Open' ? (
                      <Button type="button" className="btn--secondary text-sm" onClick={() => startTransition('Mitigated')}>
                        {labels.mitigate}
                      </Button>
                    ) : null}
                    {risk.state === 'Mitigated' ? (
                      <Button type="button" className="btn--secondary text-sm" onClick={() => startTransition('Closed')}>
                        {labels.close}
                      </Button>
                    ) : null}
                    {risk.state === 'Closed' ? (
                      <Button type="button" className="btn--secondary text-sm" onClick={() => startTransition('Open')}>
                        {labels.reopen}
                      </Button>
                    ) : null}
                  </div>

                  {transition ? (
                    <div className="grid gap-1">
                      <label htmlFor="risk-reason" className="text-sm font-medium text-slate-700">
                        {labels.fieldReason} <span aria-label="required">*</span>
                      </label>
                      <Textarea
                        id="risk-reason"
                        rows={2}
                        value={transition.reason}
                        aria-invalid={reasonError ? 'true' : undefined}
                        aria-describedby={reasonError ? 'risk-reason-error' : 'risk-reason-hint'}
                        onChange={(event) => {
                          setReasonError(null);
                          setTransition((prev) => (prev ? { ...prev, reason: event.target.value } : prev));
                        }}
                      />
                      {reasonError ? (
                        <span id="risk-reason-error" role="alert" className="text-xs text-red-700">
                          {reasonError}
                        </span>
                      ) : (
                        <span id="risk-reason-hint" className="text-xs text-slate-500">
                          {labels.fieldReasonHint}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {serverError ? (
                <div role="alert" className="text-sm text-red-700">
                  {serverError}
                </div>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn--secondary text-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="text-sm" disabled={isSubmitting}>
              {mode === 'edit' ? labels.save : labels.create}
            </Button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

export default RiskAddModal;
