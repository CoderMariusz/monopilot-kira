'use client';

/**
 * GateRevertModal — admin/owner "revert one gate" e-sign control (NPD pipeline).
 *
 * There is NO prototype for this control. Parity is achieved by REUSING the existing
 * in-app e-sign modal pattern that GateApprovalModal (T-109,
 * apps/web/app/(npd)/_modals/gate-approval-modal.tsx) already established for sensitive
 * NPD gate actions:
 *   - @monopilot/ui Modal (Modal.Header/Body/Footer) at size="md".
 *   - a required reason Textarea (mirrors the approval "Rejection Reason" textarea).
 *   - an e-signature block: type=password Input (PIN/password never rendered as text) +
 *     a confirmation Checkbox; the "Confirm & revert" submit is disabled until both the
 *     reason and the PIN/confirmation are provided.
 *   - per-code error mapping (errorKey) + an optimistic "Processing…" submit label.
 *
 * Real-data wiring: the modal calls the EXISTING `revertNpdGate` Server Action
 * (apps/web/app/(npd)/pipeline/_actions/revert-npd-gate.ts) via the injected
 * `revertProjectGate` caller prop. That action requires an e-sign PIN + a reason and
 * returns { success: true } | { success: false, error, status }. This island NEVER
 * queries the DB and NEVER authors the Server Action — it imports it via the prop.
 *
 * Guards (mirrored from the action so the user gets a clear state, not just an error):
 *   - `atFirstGate` → the Revert button is hidden/disabled by the caller; if the modal is
 *     still opened the action returns ALREADY_AT_FIRST_GATE and we surface a friendly copy.
 *   - release-locked → not knowable from the read shape, so the action's NPD_RELEASE_LOCKED
 *     code is mapped to an explicit, human-readable message (the modal never closes on
 *     failure — it shows the mapped error inline).
 *
 * Required UI states: ready / permission-denied (via `status`) + optimistic processing →
 * success confirmation; every ok:false code maps to a visible message.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';
import Input from '@monopilot/ui/Input';
import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';

const REASON_MIN_LENGTH = 5;

export type GateRevertStatus = 'ready' | 'forbidden';

/** Server-fetched project context for the gate being reverted (passed in by the RSC parent). */
export type GateRevertProject = {
  id: string;
  code: string;
  name: string;
  /** Human label of the gate the project currently sits at (e.g. "G3 — Development"). */
  currentGateLabel: string;
};

/** Result shape of the EXISTING revertNpdGate Server Action (imported, never authored here). */
export type RevertGateResult =
  | { success: true }
  | { success: false; error: string; status: number };

/** Server Action caller (owned by revert-npd-gate.ts — injected by the parent as a prop). */
export type RevertProjectGateAction = (input: {
  projectId: string;
  reason: string;
  pin: string;
}) => Promise<RevertGateResult>;

export type GateRevertModalProps = {
  open: boolean;
  project: GateRevertProject;
  status?: GateRevertStatus;
  revertProjectGate?: RevertProjectGateAction;
  /** Called after a successful revert; the host maps it to close + revalidation. */
  onReverted?: () => void;
  onClose: () => void;
};

type ReasonForm = { reason: string };
type ErrorKey =
  | 'errorReleaseLocked'
  | 'errorFirstGate'
  | 'errorEsign'
  | 'errorInput'
  | 'errorNotFound'
  | 'errorGeneric';

/** Maps the action's error codes to friendly i18n keys (every ok:false is visible). */
function errorKey(code: string): ErrorKey {
  switch (code) {
    case 'NPD_RELEASE_LOCKED':
      return 'errorReleaseLocked';
    case 'ALREADY_AT_FIRST_GATE':
      return 'errorFirstGate';
    case 'ESIGN_FAILED':
      return 'errorEsign';
    case 'INVALID_INPUT':
      return 'errorInput';
    case 'NOT_FOUND':
      return 'errorNotFound';
    default:
      return 'errorGeneric';
  }
}

export function GateRevertModal({
  open,
  project,
  status = 'ready',
  revertProjectGate,
  onReverted,
  onClose,
}: GateRevertModalProps) {
  const t = useTranslations('npd.gateRevertModal');

  const [pin, setPin] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const {
    register,
    watch,
    reset,
  } = useForm<ReasonForm>({ defaultValues: { reason: '' } });

  const reason = watch('reason') ?? '';
  const reasonValid = reason.trim().length >= REASON_MIN_LENGTH;

  // Reset all transient state whenever the modal is (re)opened/closed.
  React.useEffect(() => {
    if (!open) {
      setPin('');
      setConfirmed(false);
      setSubmitting(false);
      setErrorCode(null);
      setDone(false);
      reset({ reason: '' });
    }
  }, [open, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const canSubmit = reasonValid && pin.length > 0 && confirmed && !submitting && !!revertProjectGate;

  const handleSubmit = async () => {
    if (!canSubmit || !revertProjectGate) return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      const result = await revertProjectGate({
        projectId: project.id,
        reason: reason.trim(),
        pin,
      });
      if (result.success) {
        setDone(true);
        onReverted?.();
      } else {
        setErrorCode(result.error || 'UNKNOWN');
      }
    } catch {
      setErrorCode('UNKNOWN');
    } finally {
      setSubmitting(false);
    }
  };

  // ───────────────────────────── permission-denied state ─────────────────────────────
  if (status === 'forbidden') {
    return (
      <Modal open={open} onOpenChange={handleOpenChange} size="md" modalId="npd-gate-revert">
        <Modal.Header title={t('title')} />
        <Modal.Body>
          <p data-testid="gate-revert-forbidden" role="alert" className="py-6 text-sm text-red-700">
            {t('forbidden')}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn--secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <Modal open={open} onOpenChange={handleOpenChange} size="md" modalId="npd-gate-revert">
      <Modal.Header title={t('title')} />
      <Modal.Body>
        {/* ── submitted confirmation ── */}
        {done ? (
          <div role="status" data-testid="gate-revert-done" className="alert alert-green px-4 py-6 text-center">
            <div aria-hidden="true" className="mb-2 text-3xl">
              ✓
            </div>
            <div className="font-semibold">{t('doneTitle')}</div>
            <div className="muted mt-1 text-xs">{t('doneDetail')}</div>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* Project header (parity with GateApprovalModal's project card) */}
            <div
              data-testid="gate-revert-project"
              className="rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5"
            >
              <div className="font-mono text-[11px] text-slate-500">{project.code}</div>
              <div className="font-semibold">{project.name}</div>
            </div>

            {/* Warning notice — reverting moves the project back one gate. */}
            <div role="note" data-testid="gate-revert-warning" className="alert alert-amber text-xs">
              <span aria-hidden="true">⚠</span> {t('warning', { gate: project.currentGateLabel })}
            </div>

            {/* Reason (required) */}
            <div className="ff">
              <label htmlFor="gate-revert-reason">
                {t('reasonLabel')}{' '}
                <span aria-hidden="true" className="req">
                  *
                </span>
              </label>
              <Textarea
                id="gate-revert-reason"
                rows={3}
                aria-label={t('reasonLabel')}
                aria-invalid={reason.length > 0 && !reasonValid ? 'true' : undefined}
                aria-describedby={
                  reason.length > 0 && !reasonValid ? 'gate-revert-reason-error' : 'gate-revert-reason-help'
                }
                placeholder={t('reasonPlaceholder')}
                className="form-input"
                {...register('reason')}
              />
              {reason.length > 0 && !reasonValid ? (
                <span id="gate-revert-reason-error" role="alert" className="ff-error block">
                  {t('reasonTooShort')}
                </span>
              ) : (
                <span id="gate-revert-reason-help" className="ff-help block">
                  {t('reasonHelp')}
                </span>
              )}
            </div>

            {/* E-signature block (PIN + confirm) — mirrors the approval modal's esign step. */}
            <div
              data-testid="gate-revert-esign"
              className="rounded-lg border-2 p-5"
              style={{ borderColor: 'var(--blue)', background: 'var(--info-050a, #eff6ff)' }}
            >
              <div className="mb-1 flex items-center gap-2 text-sm font-bold text-blue-900">
                <span aria-hidden="true">🔐</span> {t('esignTitle')}
              </div>
              <p className="muted mb-4 text-xs">{t('esignSubtitle')}</p>

              <div className="ff mb-3">
                <label htmlFor="gate-revert-pin">{t('pinLabel')}</label>
                <Input
                  id="gate-revert-pin"
                  type="password"
                  autoComplete="off"
                  value={pin}
                  placeholder={t('pinPlaceholder')}
                  onChange={(e) => setPin(e.target.value)}
                  aria-label={t('pinLabel')}
                  className="form-input"
                />
              </div>

              <label
                htmlFor="gate-revert-confirm"
                className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"
              >
                <Checkbox
                  id="gate-revert-confirm"
                  checked={confirmed}
                  onCheckedChange={setConfirmed}
                  aria-label={t('confirm')}
                  className="mt-0.5"
                />
                <span>{t('confirm')}</span>
              </label>
            </div>

            {errorCode && (
              <div role="alert" data-testid="gate-revert-error" className="alert alert-red text-sm">
                {t(errorKey(errorCode))}
              </div>
            )}
          </div>
        )}
      </Modal.Body>

      {!done && (
        <Modal.Footer>
          <Button type="button" className="btn--secondary btn-sm" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className="btn-danger btn-sm"
            data-testid="gate-revert-submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? t('processing') : t('submit')}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

export default GateRevertModal;
