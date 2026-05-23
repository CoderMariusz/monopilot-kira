'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import Summary from '@monopilot/ui/Summary';
import Textarea from '@monopilot/ui/Textarea';

type PromotionTarget = 'L2-local' | 'L1-core';
type PromotionStep = 'select' | 'diff' | 'review';

export type PromotionPreview = {
  before: string;
  after: string;
  affectedRows: number;
  affectedLabel?: string;
  l3OverridesPreserved: boolean;
};

export type PromotionCandidate = {
  id: string;
  artefact: string;
  from: 'L3-tenant' | 'L2-local';
  to: PromotionTarget;
  diff: string;
};

export type PromotionResult =
  | { ok: true; promotionId: string }
  | { ok: false; error: 'PROMOTION_REQUIRES_ADMIN' | 'PREVIEW_UPGRADE_FAILED' | string };

export type PromoteToL2ModalProps = {
  isAdmin: boolean;
  defaultOpen?: boolean;
  promotion?: PromotionCandidate;
  previewUpgrade: (input: { artefact: string; target: PromotionTarget }) => Promise<PromotionPreview>;
  submitPromotion: (input: {
    artefact: string;
    target: PromotionTarget;
    reason: string;
    preview: PromotionPreview;
  }) => Promise<PromotionResult>;
  onOpenChange?: (open: boolean) => void;
};

const STEPS: Array<{ key: PromotionStep; label: string }> = [
  { key: 'select', label: 'Select artefact' },
  { key: 'diff', label: 'Preview diff' },
  { key: 'review', label: 'Confirm + reason' },
];

const TARGET_OPTIONS: Array<{ value: PromotionTarget; label: string }> = [
  { value: 'L2-local', label: 'L2 · Shared local' },
  { value: 'L1-core', label: 'L1 · Core / universal' },
];

function nextPaint() {
  return new Promise((resolve) => window.setTimeout(resolve, 50));
}

function Field({
  id,
  label,
  required = false,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
      {help ? <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>{help}</div> : null}
    </div>
  );
}

function Stepper({ current, completed }: { current: PromotionStep; completed: Set<PromotionStep> }) {
  return (
    <nav aria-label="Wizard steps" style={{ display: 'flex', gap: 8 }}>
      {STEPS.map((step) => {
        const active = step.key === current;
        const done = completed.has(step.key);

        return (
          <div
            key={step.key}
            aria-current={active ? 'step' : undefined}
            data-complete={done ? 'true' : undefined}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 999,
              color: active ? 'var(--blue)' : 'var(--muted)',
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              padding: '4px 10px',
            }}
          >
            {step.label}
          </div>
        );
      })}
    </nav>
  );
}

function previewAffectsText(preview: PromotionPreview | null, promotion?: PromotionCandidate) {
  if (preview) return `${preview.affectedRows} ${preview.affectedLabel ?? 'rows'}`;
  return promotion?.diff ?? '—';
}

function CodeBlock({ value, target = false }: { value: string; target?: boolean }) {
  return React.createElement(
    'pre',
    {
      className: 'mono',
      style: {
        background: target ? '#ecfccb' : 'var(--gray-100)',
        padding: 10,
        borderRadius: 6,
        fontSize: 11,
        margin: 0,
        minHeight: 180,
      },
    },
    React.createElement('span', null, value),
  );
}

export function PromoteToL2Modal({
  isAdmin,
  defaultOpen = false,
  promotion,
  previewUpgrade,
  submitPromotion,
  onOpenChange,
}: PromoteToL2ModalProps) {
  const artefactId = React.useId();
  const targetId = React.useId();
  const reasonId = React.useId();
  const artefactRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [openState, setOpenState] = React.useState(defaultOpen && isAdmin);
  const [step, setStep] = React.useState<PromotionStep>('select');
  const [completed, setCompleted] = React.useState<Set<PromotionStep>>(new Set());
  const [artefact, setArtefact] = React.useState(promotion?.artefact ?? '');
  const [target, setTarget] = React.useState<PromotionTarget>(promotion?.to ?? 'L2-local');
  const [reason, setReason] = React.useState('');
  const [preview, setPreview] = React.useState<PromotionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const open = isAdmin && openState;
  const selectValid = artefact.trim().length >= 3;
  const reasonValid = reason.trim().length >= 10;
  const title = promotion ? `Promotion ${promotion.id}` : 'Start L1→L2→L3 promotion';
  const subtitle = promotion?.diff ?? 'Promote a rule, flag, schema column or email template to a wider environment.';

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);

    if (step === 'select') artefactRef.current?.focus();

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [open, step]);

  function setOpen(nextOpen: boolean) {
    if (nextOpen && !isAdmin) return;
    setOpenState(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function markComplete(currentStep: PromotionStep) {
    setCompleted((current) => new Set([...current, currentStep]));
  }

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    await nextPaint();

    try {
      const result = await previewUpgrade({ artefact: artefact.trim(), target });
      setPreview(result);
    } catch {
      setPreviewError('PREVIEW_UPGRADE_FAILED');
    } finally {
      setPreviewLoading(false);
    }
  }

  function goNext() {
    if (step === 'select') {
      if (!selectValid) return;
      markComplete('select');
      setStep('diff');
      void loadPreview();
      return;
    }

    if (step === 'diff') {
      if (previewLoading || previewError || !preview) return;
      markComplete('diff');
      setStep('review');
    }
  }

  function goBack() {
    setSubmitError(null);
    setStep(step === 'review' ? 'diff' : 'select');
  }

  async function submit() {
    if (!preview || !reasonValid || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    await nextPaint();

    try {
      const result = await submitPromotion({ artefact: artefact.trim(), target, reason: reason.trim(), preview });
      if (result.ok) {
        setOpen(false);
        return;
      }
      if ('error' in result) {
        setSubmitError(result.error || 'PROMOTION_SUBMIT_FAILED');
      }
    } catch {
      setSubmitError('PROMOTION_SUBMIT_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    setOpen(false);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <Button
        type="button"
        aria-controls="SM-05"
        aria-haspopup="dialog"
        disabled={!isAdmin}
        onClick={() => setOpen(true)}
        className="btn-primary btn-sm"
      >
        Start promotion
      </Button>

      {open ? (
        <div
          ref={dialogRef}
          id="SM-05"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sm-05-promote-title"
          aria-describedby="sm-05-promote-subtitle"
          data-focus-trap="radix-dialog"
          data-modal-id="SM-05"
          data-size="wide"
          data-testid="promote-to-l2-modal"
          onKeyDown={handleDialogKeyDown}
          style={{ maxWidth: 'var(--modal-size-wide-width)' }}
        >
          <div data-testid="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 id="sm-05-promote-title" style={{ margin: 0 }}>
              {title}
            </h2>
          </div>
          <p id="sm-05-promote-subtitle" style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 12px' }}>
            {subtitle}
          </p>
          <div data-testid="modal-body">
            <Stepper current={step} completed={completed} />

            {step === 'select' ? (
              <div style={{ marginTop: 14 }}>
                <Field
                  id={artefactId}
                  label="Artefact to promote"
                  required
                  help="Rule / flag / schema / email template. Format: category.code."
                >
                  <Input
                    ref={artefactRef}
                    id={artefactId}
                    value={artefact}
                    onChange={(event) => setArtefact(event.target.value)}
                    className="mono"
                    placeholder="rules.cycle_count_variance_v1"
                  />
                </Field>

                <Field id={targetId} label="Target stage" required>
                  <Select value={target} onValueChange={(value) => setTarget(value as PromotionTarget)} options={TARGET_OPTIONS}>
                    <SelectTrigger aria-label="Target stage">
                      <SelectValue placeholder="Target stage" />
                    </SelectTrigger>
                  </Select>
                </Field>

                <div className="alert alert-blue" style={{ marginTop: 10, fontSize: 12 }}>
                  L1 promotions are reviewed by Monopilot SRE. Turnaround: 3–5 business days.
                </div>
              </div>
            ) : null}

            {step === 'diff' ? (
              <div style={{ marginTop: 14 }}>
                {previewLoading ? (
                  <div role="status" aria-label="Loading promotion preview" style={{ padding: 20, textAlign: 'center' }}>
                    ⟳ Loading promotion preview…
                  </div>
                ) : previewError ? (
                  <div>
                    <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>
                      {previewError}
                    </div>
                    <Button type="button" className="btn-secondary btn-sm" onClick={() => void loadPreview()}>
                      Retry preview
                    </Button>
                  </div>
                ) : preview ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                          Current (before)
                        </div>
                        <CodeBlock value={preview.before} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                          Target ({target})
                        </div>
                        <CodeBlock value={preview.after} target />
                      </div>
                    </div>
                    <div role="status" aria-label="Promotion impact" className="alert alert-amber" style={{ marginTop: 10, fontSize: 12 }}>
                      <b>Impact:</b> This migration affects <b>{preview.affectedRows} {preview.affectedLabel ?? 'rows'}</b>.
                      {preview.l3OverridesPreserved ? ' Existing L3 overrides will be preserved.' : ''}
                    </div>
                  </>
                ) : (
                  <div role="status" style={{ color: 'var(--muted)', fontSize: 12 }}>
                    No preview available
                  </div>
                )}
              </div>
            ) : null}

            {step === 'review' ? (
              <div style={{ marginTop: 14 }}>
                <Summary
                  rows={[
                    { label: 'Artefact', after: artefact.trim() },
                    { label: 'From → To', after: `${promotion?.from ?? 'L3-tenant'} → ${target}`, status: 'changed' },
                    { label: 'Affects', after: previewAffectsText(preview, promotion) },
                  ]}
                />
                <Field id={reasonId} label="Justification (audit-logged)" required>
                  <Textarea
                    id={reasonId}
                    value={reason}
                    minLength={10}
                    placeholder="Why should this be promoted now?"
                    onChange={(event) => {
                      setReason(event.target.value);
                      if (submitError) setSubmitError(null);
                    }}
                    style={{ minHeight: 72, width: '100%' }}
                  />
                </Field>
                {submitError ? (
                  <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>
                    {submitError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            {step === 'select' ? (
              <>
                <Button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="button" className="btn-primary btn-sm" disabled={!selectValid} onClick={goNext}>
                  Next: preview →
                </Button>
              </>
            ) : step === 'diff' ? (
              <>
                <Button type="button" className="btn-ghost btn-sm" onClick={goBack}>
                  ← Back
                </Button>
                <span className="spacer" style={{ flex: 1 }} />
                <Button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="button" className="btn-primary btn-sm" disabled={previewLoading || Boolean(previewError) || !preview} onClick={goNext}>
                  Next: confirm →
                </Button>
              </>
            ) : (
              <>
                <Button type="button" className="btn-ghost btn-sm" disabled={submitting} onClick={goBack}>
                  ← Back
                </Button>
                <span className="spacer" style={{ flex: 1 }} />
                <Button type="button" className="btn-secondary btn-sm" disabled={submitting} onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="button" className="btn-primary btn-sm" disabled={!reasonValid || submitting} onClick={() => void submit()}>
                  {submitting ? 'Submitting…' : 'Submit promotion'}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default PromoteToL2Modal;
