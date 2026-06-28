'use client';

/**
 * UnlockVersionModal (A6) — return a LOCKED formulation version back to draft,
 * gated by an e-sign PIN.
 *
 * There is NO prototype for this control. Parity is achieved by REUSING the
 * existing in-app e-sign modal pattern that GateRevertModal
 * (apps/web/app/(npd)/_modals/gate-revert-modal.tsx) already established for
 * sensitive, PIN-signed NPD actions:
 *   - @monopilot/ui Modal (Modal.Header/Body/Footer) at size="md";
 *   - a reason Textarea (optional here — the unlock action treats reason as
 *     optional, so it is NOT a submit gate);
 *   - an e-signature block: type=password Input (PIN never rendered as text) +
 *     a confirmation Checkbox; the submit is disabled until the PIN AND the
 *     confirmation are provided;
 *   - per-code error mapping handled by the HOST (the editor) and threaded down as
 *     a pre-localized `errorMessage` string + an optimistic "Unlocking…" submit.
 *
 * Real-data wiring: this island NEVER queries the DB and NEVER authors the Server
 * Action. The host editor owns the injected `unlockVersion` Server Action and
 * passes a thin `onConfirm({ pin, reason })` callback. On success the host closes
 * the modal + revalidates so the editor re-reads the now-draft (editable) version.
 *
 * The shared GateRevertModal is intentionally NOT modified — it serves the
 * gate-revert flow. This is a parallel, narrowly-scoped copy of the SAME pattern.
 */

import React from 'react';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';
import Input from '@monopilot/ui/Input';
import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';

import type { FormulationLabels } from './formulation-editor';

export type UnlockVersionModalProps = {
  open: boolean;
  /** Current version number — substituted into the "{n}" body copy. */
  versionNumber: number;
  labels: FormulationLabels;
  /** Optimistic submitting flag, owned by the host (drives the "Unlocking…" label). */
  submitting: boolean;
  /** Pre-localized inline error (host maps the action's error code → message), or null. */
  errorMessage: string | null;
  /** Host callback — invokes the injected `unlockVersion` Server Action. */
  onConfirm: (input: { pin: string; reason: string }) => void | Promise<void>;
  onClose: () => void;
};

export function UnlockVersionModal({
  open,
  versionNumber,
  labels,
  submitting,
  errorMessage,
  onConfirm,
  onClose,
}: UnlockVersionModalProps) {
  const [reason, setReason] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);

  // Reset the transient form whenever the modal is closed (re-opening starts clean).
  React.useEffect(() => {
    if (!open) {
      setReason('');
      setPin('');
      setConfirmed(false);
    }
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const canSubmit = pin.trim().length > 0 && confirmed && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onConfirm({ pin: pin.trim(), reason: reason.trim() });
  };

  const body = labels.unlockBody.replace('{n}', String(versionNumber));

  return (
    <Modal open={open} onOpenChange={handleOpenChange} size="md" modalId="npd-formulation-unlock">
      <Modal.Header title={labels.unlockTitle} />
      <Modal.Body>
        <div className="grid gap-4" data-testid="unlock-version-modal">
          {/* Warning notice — unlocking returns the version to draft (editable). */}
          <div role="note" data-testid="unlock-warning" className="alert alert-amber text-xs">
            <span aria-hidden="true">⚠</span> {body}
          </div>

          {/* Reason (optional — mirrors the gate-revert reason field, not a gate). */}
          <div className="ff">
            <label htmlFor="unlock-reason">{labels.unlockReasonLabel}</label>
            <Textarea
              id="unlock-reason"
              rows={3}
              aria-label={labels.unlockReasonLabel}
              placeholder={labels.unlockReasonPlaceholder}
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="unlock-reason"
            />
          </div>

          {/* E-signature block (PIN + confirm) — mirrors the gate-revert esign step. */}
          <div
            data-testid="unlock-esign"
            className="rounded-lg border-2 p-5"
            style={{ borderColor: 'var(--blue)', background: 'var(--info-050a, #eff6ff)' }}
          >
            <div className="ff mb-3">
              <label htmlFor="unlock-pin">{labels.unlockPinLabel}</label>
              <Input
                id="unlock-pin"
                type="password"
                autoComplete="off"
                value={pin}
                placeholder={labels.unlockPinPlaceholder}
                onChange={(e) => setPin(e.target.value)}
                aria-label={labels.unlockPinLabel}
                className="form-input"
                data-testid="unlock-pin"
              />
            </div>

            <label
              htmlFor="unlock-confirm"
              className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"
            >
              <Checkbox
                id="unlock-confirm"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(Boolean(v))}
                aria-label={labels.unlockConfirmCheckbox}
                className="mt-0.5"
                data-testid="unlock-confirm-checkbox"
              />
              <span>{labels.unlockConfirmCheckbox}</span>
            </label>
          </div>

          {errorMessage ? (
            <div role="alert" data-testid="unlock-error" className="alert alert-red text-sm">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button type="button" className="btn--secondary btn-sm" onClick={onClose} disabled={submitting}>
          {labels.unlockCancel}
        </Button>
        <Button
          type="button"
          className="btn-primary btn-sm"
          data-testid="unlock-submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? labels.unlocking : labels.unlockSubmit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default UnlockVersionModal;
