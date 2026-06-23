'use client';

/**
 * C-R3 — Edit-metadata modal for the LP detail action group.
 *
 * Reversibility UI for license-plate corrections: an operator fixes the LP's
 * expiry date and/or batch number (e.g. a mis-keyed receipt) by recording a
 * server-side metadata correction (NO e-sign — same low-stakes tier as the GRN
 * line cancel). The expiry + batch inputs are PREFILLED from the current LP
 * detail; a shared correction reason code + optional note are required.
 *
 * MODAL-GENERALIZATION DECISION (documented): this is a SIBLING modal — see the
 * grn-line-cancel-modal note. The updateLpMetadata shape is editorial (it carries
 * payload fields expiryDate/batchNumber, NOT a target id + counter-entry), so it
 * shares only the reason Select + note textarea + typed-error→copy mapping with
 * the production void/reverse modals. It sits NEXT TO Move/QA in the LP action
 * group and replaces nothing.
 *
 * The Server Action (updateLpMetadata) is OWNED by the warehouse corrections lane
 * (warehouse/_actions/lp-metadata-actions.ts — built IN PARALLEL; not yet present
 * at authoring time) and is imported by the RSC page through an import-only
 * adapter seam, then threaded here as a prop. lp_not_editable maps to honest copy.
 *
 * All five UI states: idle (prefilled form), error (typed → alert banner),
 * optimistic (submit disabled + "Saving…"); empty/permission-denied are owned by
 * the caller (the action button is hidden for terminal LPs / read-only).
 */

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

// ── Pinned contract (lp-metadata-actions.ts — backend lane owns the impl). ──────
export const LP_METADATA_REASON_CODES = [
  'entry_error',
  'wrong_quantity',
  'wrong_batch',
  'wrong_product',
  'other',
] as const;
export type LpMetadataReasonCode = (typeof LP_METADATA_REASON_CODES)[number];

export type UpdateLpMetadataInput = {
  lpId: string;
  expiryDate?: string | null;
  batchNumber?: string;
  reasonCode: LpMetadataReasonCode;
  note?: string;
};
export type UpdateLpMetadataError =
  | 'forbidden'
  | 'not_found'
  | 'lp_not_editable'
  | 'invalid_input'
  | 'persistence_failed';
export type UpdateLpMetadataResult =
  | { ok: true }
  | { ok: false; error: UpdateLpMetadataError; message?: string };

export type LpMetadataEditLabels = {
  /** Action-group button label. */
  action: string;
  title: string;
  intro: string;
  expiry: string;
  expiryHelp: string;
  batch: string;
  batchHelp: string;
  reasonCode: string;
  reasonPlaceholder: string;
  reasonOptions: Record<LpMetadataReasonCode, string>;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  /** Shown when nothing was changed from the prefilled values. */
  noChange: string;
  cancel: string;
  submit: string;
  submitting: string;
  /** Typed-error copy. lp_not_editable is bespoke (terminal/locked LP). */
  errors: {
    forbidden: string;
    not_found: string;
    lp_not_editable: string;
    invalid_input: string;
    persistence_failed: string;
    generic: string;
  };
};

/** YYYY-MM-DD slice of an ISO date, or '' when absent. */
function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function dateInputToIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function LpMetadataEditModal({
  open,
  lp,
  labels,
  updateLpMetadataAction,
  onClose,
  onSaved,
}: {
  open: boolean;
  lp: { id: string; expiryDate: string | null; batchNumber: string | null };
  labels: LpMetadataEditLabels;
  updateLpMetadataAction: (input: UpdateLpMetadataInput) => Promise<UpdateLpMetadataResult>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialExpiry = dateInputValue(lp.expiryDate);
  const initialBatch = lp.batchNumber ?? '';

  const [expiry, setExpiry] = useState(initialExpiry);
  const [batch, setBatch] = useState(initialBatch);
  const [reasonCode, setReasonCode] = useState<LpMetadataReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // (Re)prefill from the current LP whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setExpiry(initialExpiry);
    setBatch(initialBatch);
    setReasonCode('');
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lp.id]);

  const expiryChanged = expiry !== initialExpiry;
  const batchChanged = batch.trim() !== initialBatch;
  const somethingChanged = expiryChanged || batchChanged;
  const valid = reasonCode !== '' && somethingChanged && !pending;

  function mapError(code: string): string {
    switch (code) {
      case 'forbidden':
        return labels.errors.forbidden;
      case 'not_found':
        return labels.errors.not_found;
      case 'lp_not_editable':
        return labels.errors.lp_not_editable;
      case 'invalid_input':
        return labels.errors.invalid_input;
      case 'persistence_failed':
        return labels.errors.persistence_failed;
      default:
        return labels.errors.generic;
    }
  }

  function submit() {
    if (reasonCode === '' || !somethingChanged) return;
    setError(null);
    startTransition(async () => {
      const note_ = note.trim() ? note.trim() : undefined;
      const payload: UpdateLpMetadataInput = {
        lpId: lp.id,
        reasonCode,
        note: note_,
      };
      if (expiryChanged) {
        payload.expiryDate = expiry ? dateInputToIso(expiry) : null;
      }
      if (batchChanged) {
        payload.batchNumber = batch.trim();
      }
      const result = await updateLpMetadataAction(payload);
      if (!result.ok) {
        setError(mapError(result.error));
        return;
      }
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : onClose())}
      modalId="lp-metadata-edit"
      size="sm"
      dismissible={!pending}
    >
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="lp-metadata-form" className="flex flex-col gap-4 text-sm">
          <p className="text-slate-600">{labels.intro}</p>

          {/* Expiry (prefilled). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.expiry}</span>
            <input
              type="date"
              data-testid="lp-metadata-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.expiryHelp}</span>
          </label>

          {/* Batch (prefilled). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.batch}</span>
            <input
              type="text"
              data-testid="lp-metadata-batch"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.batchHelp}</span>
          </label>

          {/* Shared reason-code select (no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="lp-metadata-reason">
              <Select
                aria-label={labels.reasonCode}
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as LpMetadataReasonCode)}
                placeholder={labels.reasonPlaceholder}
                disabled={pending}
                options={LP_METADATA_REASON_CODES.map((c) => ({ value: c, label: labels.reasonOptions[c] }))}
              />
            </div>
          </label>

          {/* Optional note. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.note} <span className="text-xs font-normal text-slate-400">({labels.noteOptional})</span>
            </span>
            <textarea
              data-testid="lp-metadata-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {!somethingChanged ? (
            <p data-testid="lp-metadata-nochange" className="text-xs text-slate-400">
              {labels.noChange}
            </p>
          ) : null}

          {error ? (
            <p role="alert" data-testid="lp-metadata-error" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-metadata-cancel"
          disabled={pending}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-metadata-submit"
          disabled={!valid}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
