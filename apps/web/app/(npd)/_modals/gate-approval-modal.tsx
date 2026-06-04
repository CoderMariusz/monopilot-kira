'use client';

/**
 * T-109 — GateApprovalModal (NPD-010 · Stage-Gate G3/G4 e-sign approval).
 *
 * Prototype parity source (1:1, literal anchor — verified `wc -l` = 616 lines):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:378-522 (GateApprovalModal)
 *
 * Translation notes (prototype → production):
 *   - window.Modal (foot/title)                  → @monopilot/ui Modal + Modal.Header / Modal.Footer.
 *   - project header (code mono + name)          → REAL project passed in as a prop by the RSC parent
 *     (T-111) from the T-057 getProject Server Action; this island NEVER queries the DB.
 *   - gate-transition visual (══>/— X —)         → accessible gate-transition card; data-decision flips
 *     to "reject" → red/dashed styling + a text rejection warning (a11y: never colour-only).
 *   - checklist Progress div                      → role="progressbar" (aria-valuenow/min/max) + % text
 *     + "{done} of {total} required items complete" — values computed server-side, passed as props.
 *   - approve/reject native radios                → accessible radio group (role=radio, fieldset/legend);
 *     decision='approve' default. shadcn has no RadioGroup primitive in @monopilot/ui, and adding a
 *     Radix primitive there is out of scope (STRICT SCOPE: no packages/ui surface changes) — native
 *     inputs are NOT a red-line (only raw <select> is); they carry full a11y semantics. (deviation log)
 *   - notes <textarea>                            → @monopilot/ui Textarea, RHF-bound, required min 10
 *     trimmed chars; label switches "Approval Notes" / "Rejection Reason".
 *   - e-signature overlay (password + checkbox)   → step state machine ('decision' → 'esign' → 'submitted'),
 *     ONLY reachable on the approve path. Password is a type=password Input (value never in the DOM as
 *     text); confirmation @monopilot/ui Checkbox; Confirm&Sign disabled until both filled.
 *
 * Real-data wiring: the modal calls the MERGED `approveProjectGate` Server Action (T-058) via the
 * injected `onApprove` caller. T-058 implements ONE action that discriminates on `decision`
 * ('approved' | 'rejected'); there is no separate `rejectProjectGate` export (see closeout deviation).
 * On approve the action verifies the e-sign PIN/password via @monopilot/e-sign and records a
 * gate_approvals row + outbox event server-side. The client never trusts itself for the gate decision.
 *
 * Required UI states: loading / empty / error / permission-denied (via `status`) +
 * optimistic processing → success confirmation.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';
import Input from '@monopilot/ui/Input';
import { Button } from '@monopilot/ui/Button';
import { Badge } from '@monopilot/ui/Badge';
import { Checkbox } from '@monopilot/ui/Checkbox';

const NOTES_MIN_LENGTH = 10;

export type GateApprovalGate = 'G3' | 'G4';
export type GateApprovalDecision = 'approve' | 'reject';
export type GateApprovalStatus = 'ready' | 'loading' | 'empty' | 'error' | 'forbidden';

/** Server-fetched project context for the gate awaiting approval (passed in by the RSC parent). */
export type GateApprovalProject = {
  id: string;
  code: string;
  name: string;
  /** The gate the user is approving/rejecting (G3 or G4 — the only e-sign gates). */
  gateCode: GateApprovalGate;
  /** Required checklist items already complete for this gate. */
  requiredDone: number;
  /** Total required checklist items for this gate. */
  requiredTotal: number;
  /** Overall checklist completion percent (0-100). */
  pct: number;
};

/** Approve payload — matches the merged approveProjectGate Server Action (T-058) input. */
export type ApproveGateInput = {
  projectId: string;
  gateCode: GateApprovalGate;
  decision: 'approved';
  notes: string;
  password: string;
};

/** Reject payload — same merged action, decision='rejected', NO password (red-line). */
export type RejectGateInput = {
  projectId: string;
  gateCode: GateApprovalGate;
  decision: 'rejected';
  notes: string;
};

export type GateActionResult = { ok: true } | { ok: false; error: string };

/** Server Action caller (owned by T-058 — imported by the parent, passed in here as a prop). */
export type OnApproveGate = (input: ApproveGateInput | RejectGateInput) => Promise<GateActionResult>;

export type GateApprovalModalProps = {
  open: boolean;
  project: GateApprovalProject;
  status?: GateApprovalStatus;
  onApprove: OnApproveGate;
  onClose: () => void;
};

type Step = 'decision' | 'esign' | 'submitted';
type NotesForm = { notes: string };

// Domain constant gate metadata (static sequence; mirrors prototype GATE_INFO — not data).
const GATE_META: Record<GateApprovalGate, { next: string }> = {
  G3: { next: 'G4' },
  G4: { next: 'Launched' },
};

function errorKey(code: string): 'errorEsign' | 'errorBlockers' | 'errorGeneric' {
  switch (code) {
    case 'ESIGN_FAILED':
      return 'errorEsign';
    case 'BLOCKERS_PRESENT':
      return 'errorBlockers';
    default:
      return 'errorGeneric';
  }
}

export function GateApprovalModal({ open, project, status = 'ready', onApprove, onClose }: GateApprovalModalProps) {
  const t = useTranslations('npd.gateApprovalModal');

  const [decision, setDecision] = React.useState<GateApprovalDecision>('approve');
  const [step, setStep] = React.useState<Step>('decision');
  const [password, setPassword] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  const {
    register,
    watch,
    reset,
    formState: { errors },
  } = useForm<NotesForm>({ defaultValues: { notes: '' } });

  const notes = watch('notes') ?? '';
  const notesValid = notes.trim().length >= NOTES_MIN_LENGTH;

  // Reset all transient state whenever the modal is (re)opened/closed.
  React.useEffect(() => {
    if (!open) {
      setDecision('approve');
      setStep('decision');
      setPassword('');
      setConfirmed(false);
      setSubmitting(false);
      setErrorCode(null);
      reset({ notes: '' });
    }
  }, [open, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const gateMeta = GATE_META[project.gateCode];
  const nextLabel = project.gateCode === 'G3' ? t('nextLabelG3') : t('nextLabelG4');
  const gateLabel = project.gateCode === 'G3' ? t('gateLabelG3') : t('gateLabelG4');

  // ── decision-step submit: approve → e-sign overlay; reject → action directly ──
  const handleDecisionSubmit = async () => {
    if (!notesValid || submitting) return;
    setErrorCode(null);
    if (decision === 'approve') {
      setStep('esign');
      return;
    }
    setSubmitting(true);
    try {
      const result = await onApprove({
        projectId: project.id,
        gateCode: project.gateCode,
        decision: 'rejected',
        notes: notes.trim(),
      });
      if (result.ok) {
        setStep('submitted');
      } else {
        setErrorCode(result.error);
      }
    } catch {
      setErrorCode('UNKNOWN');
    } finally {
      setSubmitting(false);
    }
  };

  // ── e-sign-step submit: requires both password + confirmation checkbox ──
  const canSign = password.length > 0 && confirmed && !submitting;
  const handleSign = async () => {
    if (!canSign) return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      const result = await onApprove({
        projectId: project.id,
        gateCode: project.gateCode,
        decision: 'approved',
        notes: notes.trim(),
        password,
      });
      if (result.ok) {
        setStep('submitted');
      } else {
        setErrorCode(result.error);
      }
    } catch {
      setErrorCode('UNKNOWN');
    } finally {
      setSubmitting(false);
    }
  };

  // ───────────────────────────── non-ready states ─────────────────────────────
  if (status !== 'ready') {
    return (
      <Modal open={open} onOpenChange={handleOpenChange} size="md" modalId="npd-gate-approval">
        <Modal.Header title={t('title')} />
        <Modal.Body>
          {status === 'loading' ? (
            <p data-testid="gate-approval-loading" role="status" aria-live="polite" className="py-6 text-sm text-slate-600">
              {t('loading')}
            </p>
          ) : status === 'empty' ? (
            <p data-testid="gate-approval-empty" role="status" className="py-6 text-sm text-slate-600">
              {t('empty')}
            </p>
          ) : status === 'forbidden' ? (
            <p data-testid="gate-approval-forbidden" role="alert" className="py-6 text-sm text-red-700">
              {t('forbidden')}
            </p>
          ) : (
            <div role="alert" className="my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {t('errorGeneric')}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  const showFooter = step === 'decision';

  return (
    <Modal open={open} onOpenChange={handleOpenChange} size="md" modalId="npd-gate-approval">
      <Modal.Header title={t('title')} />
      <Modal.Body>
        {/* ── submitted confirmation ── */}
        {step === 'submitted' && (
          <div
            role="status"
            data-testid="gate-approval-done"
            data-decision={decision}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-emerald-800"
          >
            <div aria-hidden="true" className="mb-2 text-3xl">
              {decision === 'approve' ? '✓' : '✗'}
            </div>
            <div className="font-semibold">{decision === 'approve' ? t('doneApproved') : t('doneRejected')}</div>
            <div className="mt-1 text-xs text-emerald-700">{t('doneDetail')}</div>
          </div>
        )}

        {/* ── e-signature overlay (approve path only) ── */}
        {step === 'esign' && (
          <div
            data-testid="gate-approval-esign"
            className="rounded-lg border-2 border-blue-500 bg-blue-50 p-5"
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-blue-900">
              <span aria-hidden="true">🔐</span> {t('esignTitle')}
            </div>
            <p className="mb-4 text-xs text-slate-600">{t('esignSubtitle')}</p>

            <div className="mb-3">
              <label htmlFor="gate-approval-password" className="mb-1 block text-xs font-medium text-slate-700">
                {t('passwordLabel')}
              </label>
              <Input
                id="gate-approval-password"
                type="password"
                autoFocus
                autoComplete="off"
                value={password}
                placeholder={t('passwordPlaceholder')}
                onChange={(e) => setPassword(e.target.value)}
                aria-label={t('passwordLabel')}
              />
            </div>

            <label
              htmlFor="gate-approval-esign-confirm"
              className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"
            >
              <Checkbox
                id="gate-approval-esign-confirm"
                checked={confirmed}
                onCheckedChange={setConfirmed}
                aria-label={t('esignConfirm')}
                className="mt-0.5"
              />
              <span>{t('esignConfirm')}</span>
            </label>

            {errorCode && (
              <div role="alert" data-testid="gate-approval-error" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {t(errorKey(errorCode))}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setStep('decision');
                  setErrorCode(null);
                }}
              >
                {t('back')}
              </Button>
              <Button
                type="button"
                className="btn-primary btn-sm"
                disabled={!canSign}
                aria-disabled={!canSign}
                onClick={() => void handleSign()}
              >
                {submitting ? t('processing') : t('confirmSign')}
              </Button>
            </div>
          </div>
        )}

        {/* ── decision step (default) ── */}
        {step === 'decision' && (
          <>
            {/* Project header */}
            <div data-testid="gate-approval-project" className="mb-3.5 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="font-mono text-[11px] text-slate-500">{project.code}</div>
              <div className="font-semibold">{project.name}</div>
            </div>

            {/* Gate transition visual */}
            <section
              data-testid="gate-transition-card"
              data-decision={decision}
              aria-label={t('gateTransition')}
              className={[
                'mb-3.5 rounded-md border px-4 py-3',
                decision === 'reject' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50',
              ].join(' ')}
            >
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">{t('gateTransition')}</div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <span
                    aria-hidden="true"
                    className={[
                      'mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-md text-xs font-bold text-white',
                      decision === 'reject' ? 'bg-red-500' : 'bg-blue-600',
                    ].join(' ')}
                  >
                    {project.gateCode}
                  </span>
                  <div className="text-[11px] text-slate-500">{gateLabel}</div>
                </div>
                <div aria-hidden="true" className="flex-1 text-center text-base">
                  {decision === 'approve' ? '══════>' : '— — ✕ — —'}
                </div>
                <div className="text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-500"
                  >
                    {gateMeta.next === 'Launched' ? '✓' : gateMeta.next}
                  </span>
                  <div className="text-[11px] text-slate-500">{nextLabel}</div>
                </div>
              </div>
              {decision === 'reject' && (
                <div className="mt-2 text-xs font-medium text-red-800">
                  <span aria-hidden="true">⚠</span> {t('rejectWarning', { gate: project.gateCode, label: gateLabel })}
                </div>
              )}
            </section>

            {/* Checklist completion */}
            <div className="mb-3.5">
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">{t('checklistCompletion')}</div>
              <div className="mb-1.5 flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-valuenow={project.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('checklistCompletion')}
                  data-testid="gate-approval-progress"
                  className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100"
                >
                  <div
                    className={project.pct >= 100 ? 'h-full bg-emerald-600' : 'h-full bg-blue-600'}
                    style={{ width: `${project.pct}%` }}
                  />
                </div>
                <span className="font-mono text-xs">{project.pct}%</span>
              </div>
              <div className="text-xs text-slate-500">
                {t('requiredComplete', { done: project.requiredDone, total: project.requiredTotal })}
              </div>
            </div>

            {/* Decision radio group */}
            <fieldset className="mb-3.5 border-0 p-0">
              <legend className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">{t('decision')}</legend>
              <div className="flex gap-2.5">
                {(
                  [
                    { value: 'approve' as const, label: t('approveOption'), active: 'border-emerald-600 bg-emerald-50 text-emerald-700' },
                    { value: 'reject' as const, label: t('rejectOption'), active: 'border-red-500 bg-red-50 text-red-600' },
                  ]
                ).map((opt) => {
                  const selected = decision === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={[
                        'flex flex-1 cursor-pointer items-center gap-2 rounded-md border-2 px-3.5 py-2.5 text-sm font-medium',
                        selected ? opt.active : 'border-slate-200 bg-white text-slate-700',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="gate-decision"
                        value={opt.value}
                        checked={selected}
                        onChange={() => setDecision(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Notes */}
            <div>
              <label htmlFor="gate-approval-notes" className="mb-1 block text-xs font-medium text-slate-700">
                {decision === 'approve' ? t('approvalNotes') : t('rejectionReason')}{' '}
                <span aria-hidden="true" className="text-red-600">
                  *
                </span>
              </label>
              <Textarea
                id="gate-approval-notes"
                rows={3}
                aria-label={decision === 'approve' ? t('approvalNotes') : t('rejectionReason')}
                aria-invalid={notes.length > 0 && !notesValid ? 'true' : undefined}
                aria-describedby={notes.length > 0 && !notesValid ? 'gate-approval-notes-error' : 'gate-approval-notes-help'}
                placeholder={decision === 'approve' ? t('approvalNotesPlaceholder') : t('rejectionReasonPlaceholder')}
                {...register('notes')}
              />
              {notes.length > 0 && !notesValid ? (
                <span id="gate-approval-notes-error" role="alert" className="mt-1 block text-[11px] text-red-600">
                  {t('notesTooShort')}
                </span>
              ) : (
                <span id="gate-approval-notes-help" className="mt-1 block text-[11px] text-slate-500">
                  {t('notesHelp')}
                </span>
              )}
              {/* RHF errors surface (kept for completeness; native min handled above) */}
              {errors.notes?.message ? <span className="sr-only">{errors.notes.message}</span> : null}
            </div>

            {errorCode && (
              <div role="alert" data-testid="gate-approval-error" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {t(errorKey(errorCode))}
              </div>
            )}
          </>
        )}
      </Modal.Body>

      {showFooter && (
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className={decision === 'reject' ? 'btn-danger btn-sm' : 'btn-success btn-sm'}
            disabled={!notesValid || submitting}
            aria-disabled={!notesValid || submitting}
            onClick={() => void handleDecisionSubmit()}
          >
            {submitting ? t('processing') : decision === 'approve' ? t('submitApproval') : t('submitRejection')}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

export default GateApprovalModal;
