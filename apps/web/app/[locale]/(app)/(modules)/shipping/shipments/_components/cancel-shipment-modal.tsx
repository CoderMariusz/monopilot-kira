'use client';

/**
 * Wave-R (shipping reversibility) — Cancel-shipment e-sign modal (client island).
 *
 * Reversibility UI for the shipping reverse lane: a user cancels a non-delivered,
 * non-cancelled shipment (e-sign required) which releases allocations / returns
 * LPs / recomputes the SO status server-side via the reviewed `cancelShipment`
 * action. The modal collects a reason code + optional note + the account password,
 * mirroring the in-repo e-sign reverse precedent
 * (production/wos/[id]/_components/void-correction-modal.tsx, which itself mirrors
 * quality/holds/_components/hold-release-modal.client.tsx). No prototype
 * cancel-shipment screen exists in shipping/pack-screens.jsx — the danger action
 * itself is the prototype's right-rail ship action group (pack-screens.jsx:211-216,
 * V-SHIP-SHIP) + the per-status danger button pattern; the e-sign confirm is
 * spec-driven off the void-output precedent.
 *
 * The Server Action (cancelShipment) is OWNED by the shipping reverse backend lane
 * (shipping/_actions/cancelShipment.ts) and is imported by the RSC page and threaded
 * here as a prop — this island never authors it and never client-trusts the RBAC
 * (`ship.so.cancel`) or the state guard (delivered/cancelled blocked); both are
 * re-checked server-side. The `canCancel` cap is an advisory server probe used ONLY
 * to disable + tooltip the trigger.
 *
 * All five UI states: idle (form), error (typed → copy banner), optimistic (submit
 * disabled + "Cancelling…"); empty/permission-denied are owned by the caller — the
 * trigger is hidden when the shipment is terminal and disabled+tooltipped when the
 * caller lacks the permission.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

// ── Reason codes for the cancel select (UI-side enum; the backend accepts any
// trimmed 1..64-char reasonCode string — these are the curated options). ────────
export const CANCEL_SHIPMENT_REASON_CODES = [
  'customer_request',
  'order_error',
  'stock_shortage',
  'duplicate_shipment',
  'other',
] as const;
export type CancelShipmentReasonCode = (typeof CANCEL_SHIPMENT_REASON_CODES)[number];

/** Narrow seam type matching the reviewed cancelShipment input/result. The page
 *  threads the action verbatim; this island only narrows the shape it needs. */
export type CancelShipmentInput = {
  shipmentId: string;
  reasonCode?: string | null;
  note?: string | null;
  signature: { password: string };
};
export type CancelShipmentResult = { ok: true } | { ok: false; error: string; message?: string };

export type CancelShipmentLabels = {
  /** Trigger button copy. */
  trigger: string;
  /** Modal title; `{shipment}` is interpolated. */
  title: string;
  intro: string;
  reasonCode: string;
  reasonPlaceholder: string;
  reasonOptions: Record<CancelShipmentReasonCode, string>;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  esign: { title: string; meaning: string; password: string; passwordPlaceholder: string; passwordHelp: string };
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  /** Tooltip when the trigger is disabled because the user lacks ship.so.cancel. */
  noPermission: string;
  /** Typed-error copy. */
  errors: {
    forbidden: string;
    not_found: string;
    invalid_input: string;
    invalid_state: string;
    illegal_transition: string;
    downstream_financial_record: string;
    esign_failed: string;
    persistence_failed: string;
    generic: string;
  };
};

export function CancelShipmentModal({
  shipmentNumber,
  shipmentId,
  canCancel,
  labels,
  cancelShipmentAction,
}: {
  shipmentNumber: string;
  shipmentId: string;
  /** Advisory server probe (ship.so.cancel). Never client-trusted; disables the
   *  trigger + tooltips when false — the action re-checks server-side. */
  canCancel: boolean;
  labels: CancelShipmentLabels;
  cancelShipmentAction: (input: CancelShipmentInput) => Promise<CancelShipmentResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<CancelShipmentReasonCode | ''>('');
  const [note, setNote] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const disabled = !canCancel;
  const tooltip = disabled ? labels.noPermission : undefined;
  const valid = reasonCode !== '' && password.length > 0 && !pending;

  function reset() {
    setReasonCode('');
    setNote('');
    setPassword('');
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) reset();
    setOpen(next);
  }

  function mapError(code: string): string {
    switch (code) {
      case 'forbidden':
        return labels.errors.forbidden;
      case 'not_found':
        return labels.errors.not_found;
      case 'invalid_input':
        return labels.errors.invalid_input;
      case 'invalid_state':
        return labels.errors.invalid_state;
      case 'illegal_transition':
        return labels.errors.illegal_transition;
      case 'downstream_financial_record':
        return labels.errors.downstream_financial_record;
      case 'esign_failed':
        return labels.errors.esign_failed;
      case 'persistence_failed':
        return labels.errors.persistence_failed;
      default:
        return labels.errors.generic;
    }
  }

  async function onSubmit() {
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      const result = await cancelShipmentAction({
        shipmentId,
        reasonCode: reasonCode || null,
        note: note.trim() ? note.trim() : null,
        signature: { password },
      });
      if (!result.ok) {
        setError(mapError(result.error));
        setPending(false);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="shipment-cancel-trigger"
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
        disabled={disabled}
        title={tooltip}
        onClick={() => onOpenChange(true)}
      >
        {labels.trigger}
      </button>

      <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="shipment_cancel" dismissible={!pending}>
        <Modal.Header title={labels.title.replace('{shipment}', shipmentNumber || '—')} />
        <Modal.Body>
          <div data-testid="shipment-cancel-form" className="flex flex-col gap-4 text-sm">
            <p className="text-slate-600">{labels.intro}</p>

            {/* Reason-code select (no raw <select>). */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.reasonCode} <span aria-hidden className="text-red-500">*</span>
              </span>
              <div data-testid="shipment-cancel-reason">
                <Select
                  aria-label={labels.reasonCode}
                  value={reasonCode}
                  onValueChange={(v) => setReasonCode(v as CancelShipmentReasonCode)}
                  placeholder={labels.reasonPlaceholder}
                  disabled={pending}
                  options={CANCEL_SHIPMENT_REASON_CODES.map((c) => ({ value: c, label: labels.reasonOptions[c] }))}
                />
              </div>
            </label>

            {/* Optional note. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.note} <span className="text-xs font-normal text-slate-400">({labels.noteOptional})</span>
              </span>
              <textarea
                data-testid="shipment-cancel-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={labels.notePlaceholder}
                rows={2}
                disabled={pending}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>

            {/* E-sign block (mirrors void-correction-modal). */}
            <div data-testid="shipment-cancel-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
              <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">
                  {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  data-testid="shipment-cancel-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={labels.esign.passwordPlaceholder}
                  autoComplete="current-password"
                  disabled={pending}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
            </div>

            {error ? (
              <p role="alert" data-testid="shipment-cancel-error" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="shipment-cancel-dismiss"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            data-testid="shipment-cancel-submit"
            disabled={!valid}
            onClick={() => void onSubmit()}
            title={!valid ? labels.formIncomplete : undefined}
            aria-busy={pending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? labels.submitting : labels.submit}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
