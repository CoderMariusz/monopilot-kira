'use client';

/**
 * C-R3 — Cancel-receipt-line modal for the GRN detail receipt-lines table.
 *
 * Reversibility UI for goods-receipt corrections: an operator cancels a single
 * GRN receipt line (NO e-sign — receiving corrections are lower-stakes than a
 * production e-sign event) by recording a server-side cancellation that voids the
 * created LP when it is still cancellable. The modal collects the shared
 * correction reason code + an optional note.
 *
 * MODAL-GENERALIZATION DECISION (documented): this is a SIBLING of the production
 * R2/R3 modals, NOT a shared generalization. The receipt-corrections action shape
 * differs (grnItemId, NO signature, a different typed-error union including
 * lp_not_cancellable / already_cancelled) and it lives in the warehouse module's
 * label/staging world (getWhcTranslator + warehouse-c.json), not the production
 * next-intl bundle. Folding it into the production VoidCorrectionModal would force
 * a cross-module dependency for ~30 lines of shared layout. Per the task's "else
 * sibling modals" branch it reuses the *contract shape* (CORRECTION_REASON_CODES,
 * the reason Select + note textarea + typed-error→copy mapping) without coupling.
 *
 * The Server Action (cancelGrnLine) is OWNED by the warehouse corrections lane
 * (warehouse/_actions/receipt-corrections-actions.ts — built IN PARALLEL; not yet
 * present at this lane's authoring time) and is imported by the RSC page through
 * an import-only adapter seam, then threaded here as a prop. lp_not_cancellable is
 * mapped to honest copy ("move/reserve/consume → use a stock adjustment instead").
 *
 * All five UI states: idle (form), error (typed → alert banner), optimistic
 * (submit disabled + "Cancelling…"); empty/permission-denied are owned by the
 * caller (the affordance is hidden on already-cancelled lines + read-only).
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

// ── Pinned contract (receipt-corrections-actions.ts — backend lane owns impl). ──
export const GRN_CANCEL_REASON_CODES = [
  'entry_error',
  'wrong_quantity',
  'wrong_batch',
  'wrong_product',
  'other',
] as const;
export type GrnCancelReasonCode = (typeof GRN_CANCEL_REASON_CODES)[number];

export type CancelGrnLineInput = {
  grnItemId: string;
  reasonCode: GrnCancelReasonCode;
  note?: string;
};
export type CancelGrnLineError =
  | 'forbidden'
  | 'not_found'
  | 'lp_not_cancellable'
  | 'already_cancelled'
  | 'grn_completed'
  | 'invalid_input'
  | 'persistence_failed';
export type CancelGrnLineResult =
  | { ok: true }
  | { ok: false; error: CancelGrnLineError; message?: string };

export type GrnLineCancelLabels = {
  /** Title. `{line}` interpolated with the line number. */
  title: string;
  intro: string;
  reasonCode: string;
  reasonPlaceholder: string;
  reasonOptions: Record<GrnCancelReasonCode, string>;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  /** Typed-error copy. lp_not_cancellable is bespoke (→ stock adjustment hint). */
  errors: {
    forbidden: string;
    not_found: string;
    lp_not_cancellable: string;
    already_cancelled: string;
    grn_completed: string;
    invalid_input: string;
    persistence_failed: string;
    session_expired: string;
    generic: string;
  };
};

export type GrnLineCancelTarget = { grnItemId: string; lineLabel: string };

export function GrnLineCancelModal({
  open,
  target,
  labels,
  sessionExpiredLoginHref,
  cancelGrnLineAction,
  onClose,
  onCancelled,
}: {
  open: boolean;
  target: GrnLineCancelTarget | null;
  labels: GrnLineCancelLabels;
  sessionExpiredLoginHref: string;
  cancelGrnLineAction: (input: CancelGrnLineInput) => Promise<CancelGrnLineResult>;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState<GrnCancelReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setReasonCode('');
    setNote('');
    setError(null);
  }, [open, target?.grnItemId]);

  const valid = reasonCode !== '' && !pending;

  function mapError(code: string): string {
    switch (code) {
      case 'forbidden':
        return labels.errors.forbidden;
      case 'not_found':
        return labels.errors.not_found;
      case 'lp_not_cancellable':
        return labels.errors.lp_not_cancellable;
      case 'already_cancelled':
        return labels.errors.already_cancelled;
      case 'grn_completed':
        return labels.errors.grn_completed;
      case 'invalid_input':
        return labels.errors.invalid_input;
      case 'persistence_failed':
        return labels.errors.persistence_failed;
      default:
        return labels.errors.generic;
    }
  }

  function submit() {
    if (!target || reasonCode === '') return;
    setError(null);
    startTransition(async () => {
      const note_ = note.trim() ? note.trim() : undefined;
      let result: CancelGrnLineResult;
      try {
        result = await cancelGrnLineAction({ grnItemId: target.grnItemId, reasonCode, note: note_ });
      } catch {
        setError(labels.errors.session_expired);
        window.setTimeout(() => router.push(sessionExpiredLoginHref), 0);
        return;
      }
      if (!result.ok) {
        setError(mapError(result.error));
        return;
      }
      onCancelled();
    });
  }

  const title = target ? labels.title.replace('{line}', target.lineLabel) : '';

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : onClose())}
      modalId="grn-line-cancel"
      size="sm"
      dismissible={!pending}
    >
      <Modal.Header title={title} />
      <Modal.Body>
        <div data-testid="grn-cancel-form" className="flex flex-col gap-4 text-sm">
          <p className="text-slate-600">{labels.intro}</p>

          {/* Shared reason-code select (no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="grn-cancel-reason">
              <Select
                aria-label={labels.reasonCode}
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as GrnCancelReasonCode)}
                placeholder={labels.reasonPlaceholder}
                disabled={pending}
                options={GRN_CANCEL_REASON_CODES.map((c) => ({ value: c, label: labels.reasonOptions[c] }))}
              />
            </div>
          </label>

          {/* Optional note. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.note} <span className="text-xs font-normal text-slate-400">({labels.noteOptional})</span>
            </span>
            <textarea
              data-testid="grn-cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error ? (
            <p role="alert" data-testid="grn-cancel-error" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="grn-cancel-dismiss"
          disabled={pending}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="grn-cancel-submit"
          disabled={!valid}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
