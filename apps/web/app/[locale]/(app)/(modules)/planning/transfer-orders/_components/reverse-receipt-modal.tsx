'use client';

/**
 * R4-CL1 — Reverse-received-line modal for the Transfer Order detail screen.
 *
 * Reversibility UI for inter-warehouse receipts: a warehouse supervisor reverses a
 * RECEIVED transfer-order line by returning its destination LP to the source and
 * reopening the line. The modal collects the shared correction reason code + an
 * optional note + the account password / supervisor PIN (e-sign), mirroring the
 * production void/reverse-consumption modals
 * (production/wos/[id]/_components/void-correction-modal.tsx +
 * reverse-consumption-modal.tsx — the in-repo precedent; no prototype reverse-receipt
 * screen exists under prototypes/design/Monopilot Design System/planning/, so this is
 * spec-driven off that pattern + the reverseToReceiveLine action contract).
 *
 * The Server Action (reverseToReceiveLine) is OWNED by the planning reversibility lane
 * (planning/transfer-orders/_actions/reverse-receive.ts) and is imported by the RSC
 * page then threaded here as a prop — this island never authors it and never trusts a
 * client-only RBAC / state decision (the affordance is hidden/disabled with a tooltip
 * when the caller lacks warehouse.transfer.correct, and the action re-checks server-side).
 * Typed errors map to honest copy; lp_active + invalid_quantity get bespoke lines.
 *
 * No raw UUIDs are surfaced — the modal shows the TO number, line item code/name, the
 * destination LP number and the received quantity (all resolved server-side).
 *
 * All five UI states: idle (form), error (typed → alert banner), optimistic (submit
 * disabled + "Reversing…"); empty/permission-denied are owned by the caller.
 */

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

// ── Pinned contract (reverse-receive.ts — the planning lane owns the impl). ─────
// Shared correction reason codes — identical set to the production void/reverse
// modals (lib/corrections/correct-ledger-entry CORRECTION_REASON_CODES). Re-declared
// locally so this island stays import-only against the action module.
export const REVERSE_RECEIPT_REASON_CODES = [
  'entry_error',
  'wrong_quantity',
  'wrong_batch',
  'wrong_product',
  'other',
] as const;
export type ReverseReceiptReasonCode = (typeof REVERSE_RECEIPT_REASON_CODES)[number];

export type ReverseToReceiveLineInput = {
  toId: string;
  lineId: string;
  destLpId: string;
  quantity: string;
  reasonCode: ReverseReceiptReasonCode;
  note?: string;
  signature: { password: string };
};
export type ReverseToReceiveLineError =
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_state'
  | 'invalid_quantity'
  | 'lp_active'
  | 'esign_failed'
  | 'persistence_failed';
export type ReverseToReceiveLineResult =
  | { ok: true; data: unknown }
  | { ok: false; error: ReverseToReceiveLineError; message?: string };

// ── i18n labels (resolved server-side, threaded down). ─────────────────────────
export type ReverseReceiptModalLabels = {
  /** Modal title. `{line}` is interpolated (line number). */
  title: string;
  intro: string;
  summary: { toNumber: string; product: string; destLp: string; quantity: string };
  reasonCode: string;
  reasonPlaceholder: string;
  reasonOptions: Record<ReverseReceiptReasonCode, string>;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  esign: { title: string; meaning: string; password: string; passwordPlaceholder: string; passwordHelp: string };
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  /** Typed-error copy. lp_active + invalid_quantity are bespoke. */
  errors: {
    forbidden: string;
    not_found: string;
    invalid_input: string;
    invalid_state: string;
    invalid_quantity: string;
    lp_active: string;
    esign_failed: string;
    persistence_failed: string;
    generic: string;
  };
};

export type ReverseReceiptTarget = {
  toId: string;
  toNumber: string;
  lineId: string;
  lineNo: number;
  itemLabel: string;
  destLpId: string;
  destLpNumber: string;
  quantity: string;
  uom: string;
};

export function ReverseReceiptModal({
  open,
  target,
  labels,
  reverseToReceiveLineAction,
  onClose,
  onReversed,
}: {
  open: boolean;
  /** Null when no row is selected (modal closed). */
  target: ReverseReceiptTarget | null;
  labels: ReverseReceiptModalLabels;
  reverseToReceiveLineAction: (input: ReverseToReceiveLineInput) => Promise<ReverseToReceiveLineResult>;
  onClose: () => void;
  onReversed: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<ReverseReceiptReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset whenever a new target is selected / the modal (re)opens.
  useEffect(() => {
    if (!open) return;
    setReasonCode('');
    setNote('');
    setPassword('');
    setError(null);
  }, [open, target?.lineId]);

  // E-sign is mandatory (the reversal action requires it server-side).
  const valid = reasonCode !== '' && password.length > 0 && !pending;

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
      case 'invalid_quantity':
        return labels.errors.invalid_quantity;
      case 'lp_active':
        return labels.errors.lp_active;
      case 'esign_failed':
        return labels.errors.esign_failed;
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
      const result = await reverseToReceiveLineAction({
        toId: target.toId,
        lineId: target.lineId,
        destLpId: target.destLpId,
        quantity: target.quantity,
        reasonCode,
        note: note_,
        signature: { password },
      });
      if (!result.ok) {
        setError(mapError(result.error));
        return;
      }
      onReversed();
    });
  }

  const title = target ? labels.title.replace('{line}', String(target.lineNo)) : '';

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : onClose())}
      modalId="to-reverse-receipt"
      size="sm"
      dismissible={!pending}
    >
      <Modal.Header title={title} />
      <Modal.Body>
        <div data-testid="to-reverse-form" className="flex flex-col gap-4 text-sm">
          <p className="text-slate-600">{labels.intro}</p>

          {/* Human-readable target summary — no raw UUIDs. */}
          {target ? (
            <dl
              data-testid="to-reverse-summary"
              className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              <dt className="text-slate-500">{labels.summary.toNumber}</dt>
              <dd className="text-right font-mono text-slate-800">{target.toNumber}</dd>
              <dt className="text-slate-500">{labels.summary.product}</dt>
              <dd className="text-right text-slate-800">{target.itemLabel}</dd>
              <dt className="text-slate-500">{labels.summary.destLp}</dt>
              <dd className="text-right font-mono text-slate-800">{target.destLpNumber}</dd>
              <dt className="text-slate-500">{labels.summary.quantity}</dt>
              <dd className="text-right font-mono tabular-nums text-slate-800">
                {target.quantity} {target.uom}
              </dd>
            </dl>
          ) : null}

          {/* Shared reason-code select (no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="to-reverse-reason">
              <Select
                aria-label={labels.reasonCode}
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as ReverseReceiptReasonCode)}
                placeholder={labels.reasonPlaceholder}
                disabled={pending}
                options={REVERSE_RECEIPT_REASON_CODES.map((c) => ({ value: c, label: labels.reasonOptions[c] }))}
              />
            </div>
          </label>

          {/* Optional note. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.note} <span className="text-xs font-normal text-slate-400">({labels.noteOptional})</span>
            </span>
            <textarea
              data-testid="to-reverse-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* E-sign block — ALWAYS required (mirrors the production reverse modal). */}
          <div data-testid="to-reverse-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="to-reverse-password"
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
            <p role="alert" data-testid="to-reverse-error" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="to-reverse-cancel"
          disabled={pending}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="to-reverse-submit"
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
