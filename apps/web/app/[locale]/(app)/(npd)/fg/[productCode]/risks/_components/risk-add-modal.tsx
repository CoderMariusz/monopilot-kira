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

// Design-system badge tone class (the @monopilot/ui Badge BEM `.badge--*` variant is
// unstyled in globals.css; the explicit `.badge-{tone}` class carries the real color).
function scoreBadgeClass(score: number): string {
  if (score >= 6) return 'badge-red';
  if (score >= 3) return 'badge-amber';
  return 'badge-gray';
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
            <div className="ff">
              <label htmlFor="risk-description">
                {labels.fieldDescription} <span className="req" aria-label="required">*</span>
              </label>
              <Textarea
                id="risk-description"
                className="form-input"
                rows={2}
                aria-invalid={errors.description ? 'true' : undefined}
                aria-describedby={errors.description ? 'risk-description-error' : 'risk-description-hint'}
                {...register('description')}
              />
              {errors.description ? (
                <div id="risk-description-error" role="alert" className="ff-error">
                  {errors.description.message}
                </div>
              ) : (
                <div id="risk-description-hint" className="ff-help">
                  {labels.fieldDescriptionHint}
                </div>
              )}
            </div>

            <div className="ff-inline">
              <div className="ff">
                <label id="risk-likelihood-label" htmlFor="risk-likelihood">
                  {labels.fieldLikelihood} <span className="req" aria-label="required">*</span>
                </label>
                <Controller
                  control={control}
                  name="likelihood"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={likelihoodOptions}>
                      <SelectTrigger id="risk-likelihood" aria-label={labels.fieldLikelihood}>
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
              <div className="ff">
                <label id="risk-impact-label" htmlFor="risk-impact">
                  {labels.fieldImpact} <span className="req" aria-label="required">*</span>
                </label>
                <Controller
                  control={control}
                  name="impact"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={impactOptions}>
                      <SelectTrigger id="risk-impact" aria-label={labels.fieldImpact}>
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

            <div
              style={{
                padding: '10px 14px',
                background: 'var(--gray-050)',
                borderRadius: 6,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              {labels.scoreLabel}:{' '}
              <Badge
                variant={scoreVariant(score)}
                className={scoreBadgeClass(score)}
                aria-label={`${labels.scoreLabel} ${score}`}
              >
                {score}
              </Badge>
            </div>

            <div className="ff">
              <label htmlFor="risk-mitigation">{labels.fieldMitigation}</label>
              <Textarea
                id="risk-mitigation"
                className="form-input"
                rows={2}
                aria-invalid={errors.mitigation ? 'true' : undefined}
                aria-describedby={errors.mitigation ? 'risk-mitigation-error' : 'risk-mitigation-hint'}
                {...register('mitigation')}
              />
              {errors.mitigation ? (
                <div id="risk-mitigation-error" role="alert" className="ff-error">
                  {errors.mitigation.message}
                </div>
              ) : (
                <div id="risk-mitigation-hint" className="ff-help">
                  {labels.fieldMitigationHint}
                </div>
              )}
            </div>

            <div className="ff">
              <label htmlFor="risk-owner">{labels.fieldOwner}</label>
              <Input id="risk-owner" className="form-input" {...register('owner')} />
            </div>

            {mode === 'edit' && risk ? (
              <div
                className="ff"
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}
              >
                <label>{labels.fieldStatus}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {risk.state === 'Open' ? (
                    <Button type="button" className="btn-secondary btn-sm" onClick={() => startTransition('Mitigated')}>
                      {labels.mitigate}
                    </Button>
                  ) : null}
                  {risk.state === 'Mitigated' ? (
                    <Button type="button" className="btn-secondary btn-sm" onClick={() => startTransition('Closed')}>
                      {labels.close}
                    </Button>
                  ) : null}
                  {risk.state === 'Closed' ? (
                    <Button type="button" className="btn-secondary btn-sm" onClick={() => startTransition('Open')}>
                      {labels.reopen}
                    </Button>
                  ) : null}
                </div>

                {transition ? (
                  <div className="ff" style={{ marginTop: 10, marginBottom: 0 }}>
                    <label htmlFor="risk-reason">
                      {labels.fieldReason} <span className="req" aria-label="required">*</span>
                    </label>
                    <Textarea
                      id="risk-reason"
                      className="form-input"
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
                      <div id="risk-reason-error" role="alert" className="ff-error">
                        {reasonError}
                      </div>
                    ) : (
                      <div id="risk-reason-hint" className="ff-help">
                        {labels.fieldReasonHint}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {serverError ? (
              <div role="alert" className="alert alert-red">
                {serverError}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary btn-sm" disabled={isSubmitting}>
              {mode === 'edit' ? labels.save : labels.create}
            </Button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

export default RiskAddModal;
