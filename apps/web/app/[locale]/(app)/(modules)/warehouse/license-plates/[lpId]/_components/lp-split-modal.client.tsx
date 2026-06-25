'use client';

/**
 * WH-R3 — LP Split modal (client island).
 *
 * Wires the hardened `splitLp(lpId, splitQty, reason, clientOpId)` Server Action
 * (lp-split-merge-destroy-actions.ts). Mirrors the in-codebase modal pattern
 * (LpReserveModal / LpBlockModal): shadcn/ui Modal + Input + Textarea, an inline
 * error region, refresh-on-success via the caller's onSuccess.
 *
 * Idempotency: `splitLp` REQUIRES a clientOpId. We mint a FRESH crypto.randomUUID()
 * when the modal OPENS and keep it stable for that open, so a double-click /
 * automatic retry replays the same operation rather than minting a second child
 * (the backend keys split-transaction + deterministic child on this id).
 *
 * Client-side quantity guard mirrors the backend's STRICT `<` rule:
 * split qty must be > 0 AND < available (= quantity − reserved_qty). Splitting the
 * whole available amount is a relabel, not a split, and the action rejects it.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';

import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

import type { splitLp } from '../_actions/lp-split-merge-destroy-actions';

export type LpSplitModalLabels = {
  title: string;
  intro: string;
  qty: string;
  qtyHint: string;
  reason: string;
  reasonPlaceholder: string;
  cancel: string;
  confirm: string;
  submitting: string;
  validation: {
    positive: string;
    lessThanAvailable: string;
    reasonRequired: string;
  };
  errors: {
    forbidden: string;
    notFound: string;
    invalidInput: string;
    invalidState: string;
    onHold: string;
    qtyTooLarge: string;
    generic: string;
  };
};

/**
 * Maps the action's flat `error` string to localized copy. The action returns the
 * machine reasons (`forbidden` / `not_found` / `invalid_input` / `error`) plus a
 * few human-readable guard strings — match every one, fall back to generic.
 */
function splitErrorMessage(error: string, labels: LpSplitModalLabels): string {
  switch (error) {
    case 'forbidden':
      return labels.errors.forbidden;
    case 'not_found':
      return labels.errors.notFound;
    case 'invalid_input':
      return labels.errors.invalidInput;
    case 'LP status does not allow split':
      return labels.errors.invalidState;
    case 'LP is under an active quality hold':
      return labels.errors.onHold;
    case 'split quantity must be less than available quantity':
      return labels.errors.qtyTooLarge;
    default:
      return labels.errors.generic;
  }
}

/** Decimal-safe compare against the available quantity using the same 6dp basis
 *  the backend uses for the strict-less-than guard. Returns null on non-numeric. */
function parseQty(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function LpSplitModal({
  open,
  onOpenChange,
  lpId,
  lpNumber,
  availableQty,
  uom,
  labels,
  splitAction,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lpId: string;
  lpNumber: string;
  /** quantity − reserved_qty as a decimal string (LicensePlateDetail.availableQty). */
  availableQty: string;
  uom: string;
  labels: LpSplitModalLabels;
  splitAction: typeof splitLp;
  onSuccess: () => void;
}) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Fresh idempotency key per modal open; stable across retries within this open.
  const [clientOpId, setClientOpId] = useState('');
  const [isPending, startTransition] = useTransition();

  const available = useMemo(() => parseQty(availableQty), [availableQty]);

  // Client-side mirror of the backend guards (> 0 AND strict < available).
  const parsedQty = useMemo(() => parseQty(qty), [qty]);
  const validationError = useMemo<string | null>(() => {
    if (qty.trim().length === 0) return null;
    if (parsedQty === null || parsedQty <= 0) return labels.validation.positive;
    if (available !== null && parsedQty >= available) return labels.validation.lessThanAvailable;
    return null;
  }, [available, labels.validation.lessThanAvailable, labels.validation.positive, parsedQty, qty]);

  const canSubmit =
    parsedQty !== null &&
    parsedQty > 0 &&
    (available === null || parsedQty < available) &&
    reason.trim().length > 0 &&
    !isPending;

  useEffect(() => {
    if (open) {
      // Mint the idempotency key once per open.
      setClientOpId(crypto.randomUUID());
    } else {
      setQty('');
      setReason('');
      setError(null);
      setClientOpId('');
    }
  }, [open]);

  function close() {
    if (isPending) return;
    onOpenChange(false);
  }

  function submit() {
    if (!canSubmit || parsedQty === null) return;
    setError(null);
    startTransition(async () => {
      const result = await splitAction(lpId, parsedQty, reason.trim(), clientOpId);
      if (result.ok) {
        onOpenChange(false);
        onSuccess();
        return;
      }
      setError(splitErrorMessage(result.error, labels));
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="lp-split-modal" dismissible={!isPending}>
      <Modal.Header title={labels.title.replace('{lp}', lpNumber)} />
      <Modal.Body>
        <div data-testid="lp-split-modal" className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{labels.intro}</p>

          <label htmlFor="lp-split-qty" className="text-sm font-medium text-slate-700">
            {labels.qty}
          </label>
          <Input
            id="lp-split-qty"
            data-testid="lp-split-qty"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            inputMode="decimal"
            disabled={isPending}
            aria-describedby="lp-split-qty-hint"
          />
          <p id="lp-split-qty-hint" className="text-xs text-slate-500" data-testid="lp-split-qty-hint">
            {labels.qtyHint.replace('{qty}', availableQty).replace('{uom}', uom)}
          </p>
          {validationError ? (
            <p role="alert" data-testid="lp-split-validation" className="text-xs text-amber-700">
              {validationError}
            </p>
          ) : null}

          <label htmlFor="lp-split-reason" className="text-sm font-medium text-slate-700">
            {labels.reason}
          </label>
          <Textarea
            id="lp-split-reason"
            data-testid="lp-split-reason"
            rows={2}
            value={reason}
            placeholder={labels.reasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
          />

          {error ? (
            <p role="alert" data-testid="lp-split-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-split-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-split-confirm"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? labels.submitting : labels.confirm}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
