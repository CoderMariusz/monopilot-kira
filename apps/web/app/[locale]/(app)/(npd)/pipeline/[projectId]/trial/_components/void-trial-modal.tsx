'use client';

/**
 * 01-NPD TRIAL stage — corrective-reversal dialog (void a trial / release its
 * booked line time).
 *
 * Mirrors the house void/cancel modal pattern (production void-correction-modal,
 * shipping cancel-shipment-modal, warehouse grn-line-cancel-modal): reason-code
 * <Select> + optional note, submit disabled until a reason is chosen, error
 * codes mapped to labels by the island (never a server string).
 *
 * No e-sign block: neighbouring trial/pilot writes are permission-gated only —
 * NPD trials are not a GMP execution record like a production output.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';

import type { TrialLabels } from './trial-screen';
import { TRIAL_VOID_REASON_CODES, type TrialVoidReasonCode } from '../_actions/errors';

export type TrialReversalMode = 'void' | 'releaseLineTime';

export type TrialReversalValues = {
  reasonCode: TrialVoidReasonCode;
  note: string | null;
};

export type TrialReversalOutcome = { ok: boolean; error?: string };

function reasonLabel(labels: TrialLabels, code: TrialVoidReasonCode): string {
  switch (code) {
    case 'entry_error':
      return labels.voidReasonEntryError;
    case 'trial_not_run':
      return labels.voidReasonTrialNotRun;
    case 'wrong_project':
      return labels.voidReasonWrongProject;
    case 'duplicate_entry':
      return labels.voidReasonDuplicateEntry;
    default:
      return labels.voidReasonOther;
  }
}

function errorMessage(labels: TrialLabels, code: string | undefined): string {
  switch (code) {
    case 'forbidden':
      return labels.voidErrorForbidden;
    case 'not_found':
      return labels.voidErrorNotFound;
    case 'already_voided':
      return labels.voidErrorAlreadyVoided;
    case 'gate_approved':
      return labels.voidErrorGateApproved;
    case 'not_booked':
      return labels.voidErrorNotBooked;
    default:
      return labels.voidError;
  }
}

export function VoidTrialModal({
  open,
  onOpenChange,
  mode,
  trialNo,
  labels,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** void = withdraw the trial; releaseLineTime = only free the booked slot. */
  mode: TrialReversalMode;
  trialNo: string;
  labels: TrialLabels;
  onSubmit: (values: TrialReversalValues) => Promise<TrialReversalOutcome>;
}) {
  const [reasonCode, setReasonCode] = React.useState<TrialVoidReasonCode | ''>('');
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReasonCode('');
      setNote('');
      setPending(false);
      setError(null);
    }
  }, [open, mode]);

  const title = (mode === 'void' ? labels.voidTrialTitle : labels.releaseLineTimeTitle).replace(
    '{trial}',
    trialNo,
  );
  const intro = mode === 'void' ? labels.voidTrialIntro : labels.releaseLineTimeIntro;
  const submitLabel = mode === 'void' ? labels.voidSubmit : labels.releaseLineTimeSubmit;
  const valid = reasonCode !== '' && !pending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(null);
    const outcome = await onSubmit({
      reasonCode: reasonCode as TrialVoidReasonCode,
      note: note.trim() === '' ? null : note.trim(),
    });
    if (outcome.ok) {
      onOpenChange(false);
      return;
    }
    setError(errorMessage(labels, outcome.error));
    setPending(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      modalId="npd-trial-void"
      size="sm"
      dismissible={!pending}
    >
      <Modal.Header title={title} />
      <form onSubmit={handleSubmit} data-testid="void-trial-form">
        <Modal.Body>
          <div className="space-y-3">
            <p className="muted text-sm">{intro}</p>
            <div className="field">
              <label id="void-reason-label">
                {labels.voidReasonLabel}
                <span className="req" aria-label="required"> *</span>
              </label>
              <Select
                aria-labelledby="void-reason-label"
                aria-required="true"
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as TrialVoidReasonCode)}
                placeholder={labels.voidReasonPlaceholder}
                disabled={pending}
                options={TRIAL_VOID_REASON_CODES.map((code) => ({
                  value: code,
                  label: reasonLabel(labels, code),
                }))}
              />
            </div>
            <div className="field">
              <label htmlFor="void-note">{labels.voidNoteLabel}</label>
              <Textarea
                id="void-note"
                rows={3}
                value={note}
                disabled={pending}
                placeholder={labels.voidNotePlaceholder}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error ? (
              <div role="alert" className="alert alert-red" data-testid="void-trial-error">
                {error}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            variant="default"
            className="btn-ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            data-testid="void-trial-dismiss"
          >
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            disabled={!valid}
            aria-busy={pending || undefined}
            title={!valid && !pending ? labels.voidReasonPlaceholder : undefined}
            data-testid="void-trial-submit"
          >
            {pending ? labels.voidSubmitting : submitLabel}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default VoidTrialModal;
