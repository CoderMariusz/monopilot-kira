'use client';

/**
 * C-R3 — Reverse-consumption modal for WO-detail Genealogy (consumed-input) rows.
 *
 * Reversibility UI for material consumption: an operator reverses a recorded
 * `wo_material_consumption` entry (e-sign required, desktop-only) by recording a
 * counter "correction" row server-side that restores the consumed LP. The modal
 * collects the shared correction reason code + an optional note + the account
 * password, mirroring the R2 void/correction modal's e-sign block
 * (void-correction-modal.tsx — the in-repo precedent; no prototype reverse screen
 * exists in prototypes/design/Monopilot Design System/production/, so this is
 * spec-driven off that pattern + the pinned corrections-actions contract).
 *
 * MODAL-GENERALIZATION DECISION (documented): the R2 VoidCorrectionModal is a
 * discriminated-union (output|waste) island bound to TWO action props
 * (voidWoOutput/voidWasteEntry) and two title shapes. Folding a THIRD kind +
 * action prop into it would widen its union, re-thread every call site and risk
 * regressing the green R2 suite for no shared-surface gain (the only common parts
 * are the reason Select + note textarea + e-sign block, which are ~30 lines). Per
 * the task's "else sibling modals" branch this ships as a SIBLING modal that
 * reuses the R2 *contract shape* (VOID_REASON_CODES === CORRECTION_REASON_CODES,
 * the same e-sign layout, the same typed-error→copy mapping) without touching the
 * working R2 file.
 *
 * The Server Action (reverseConsumption) is OWNED by the corrections backend lane
 * (production/_actions/corrections-actions.ts — built in PARALLEL; not present at
 * authoring time) and is imported by the RSC page through an import-only adapter
 * seam, then threaded here as a prop — this island never authors it and never
 * trusts a client-only RBAC / state decision. Typed errors map to honest copy;
 * lp_not_restorable + inconsistent_ledger get bespoke lines.
 *
 * All five UI states: idle (form), error (typed → alert banner), optimistic
 * (submit disabled + "Reversing…"); empty/permission-denied are owned by the
 * caller (the affordance is hidden when forbidden or already reversed).
 */

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

// ── Pinned contract (corrections-actions.ts — backend lane owns the impl). ──────
// Shared correction reason codes — identical set to the R2 void modal
// (lib/corrections/correct-ledger-entry CORRECTION_REASON_CODES). Re-declared
// locally so this island stays import-only against the backend lane.
export const REVERSE_REASON_CODES = [
  'entry_error',
  'wrong_quantity',
  'wrong_batch',
  'wrong_product',
  'other',
] as const;
export type ReverseReasonCode = (typeof REVERSE_REASON_CODES)[number];

export type ReverseConsumptionInput = {
  consumptionId: string;
  reasonCode: ReverseReasonCode;
  note?: string;
  signature: { password: string };
};
export type ReverseConsumptionError =
  | 'forbidden'
  | 'not_found'
  | 'already_corrected'
  | 'lp_not_restorable'
  | 'inconsistent_ledger'
  | 'invalid_input'
  | 'esign_failed'
  | 'persistence_failed';
export type ReverseConsumptionResult =
  | { ok: true }
  | { ok: false; error: ReverseConsumptionError; message?: string };

// ── i18n labels (resolved server-side, threaded down). ─────────────────────────
export type ReverseModalLabels = {
  /** Modal title. `{lp}` is interpolated (short LP id). */
  title: string;
  intro: string;
  reasonCode: string;
  reasonPlaceholder: string;
  reasonOptions: Record<ReverseReasonCode, string>;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  /** Closed-WO supervisor-authorization warning (shown only when woClosed). */
  closedWarning: string;
  esign: { title: string; meaning: string; password: string; passwordPlaceholder: string; passwordHelp: string };
  cancel: string;
  submit: string;
  submitting: string;
  /** Typed-error copy. lp_not_restorable + inconsistent_ledger are bespoke. */
  errors: {
    forbidden: string;
    not_found: string;
    already_corrected: string;
    lp_not_restorable: string;
    inconsistent_ledger: string;
    invalid_input: string;
    esign_failed: string;
    persistence_failed: string;
    generic: string;
  };
};

export type ReverseTarget = { consumptionId: string; lpLabel: string };

export function ReverseConsumptionModal({
  open,
  target,
  woClosed,
  labels,
  reverseConsumptionAction,
  onClose,
  onReversed,
}: {
  open: boolean;
  /** Null when no row is selected (modal closed). */
  target: ReverseTarget | null;
  /** True when the WO status is `closed` → renders the supervisor-auth warning. */
  woClosed: boolean;
  labels: ReverseModalLabels;
  reverseConsumptionAction: (input: ReverseConsumptionInput) => Promise<ReverseConsumptionResult>;
  onClose: () => void;
  onReversed: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<ReverseReasonCode | ''>('');
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
  }, [open, target?.consumptionId]);

  // E-sign is mandatory (desktop-only consumption reversal).
  const valid = reasonCode !== '' && password.length > 0 && !pending;

  function mapError(code: string): string {
    switch (code) {
      case 'forbidden':
        return labels.errors.forbidden;
      case 'not_found':
        return labels.errors.not_found;
      case 'already_corrected':
        return labels.errors.already_corrected;
      case 'lp_not_restorable':
        return labels.errors.lp_not_restorable;
      case 'inconsistent_ledger':
        return labels.errors.inconsistent_ledger;
      case 'invalid_input':
        return labels.errors.invalid_input;
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
      const result = await reverseConsumptionAction({
        consumptionId: target.consumptionId,
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

  const title = target ? labels.title.replace('{lp}', target.lpLabel) : '';

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : onClose())}
      modalId="wo-reverse-consumption"
      size="sm"
      dismissible={!pending}
    >
      <Modal.Header title={title} />
      <Modal.Body>
        <div data-testid="wo-reverse-form" className="flex flex-col gap-4 text-sm">
          <p className="text-slate-600">{labels.intro}</p>

          {/* Closed-WO supervisor-authorization warning. */}
          {woClosed ? (
            <div
              role="note"
              data-testid="wo-reverse-closed-warning"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠ {labels.closedWarning}
            </div>
          ) : null}

          {/* Shared reason-code select (no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="wo-reverse-reason">
              <Select
                aria-label={labels.reasonCode}
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as ReverseReasonCode)}
                placeholder={labels.reasonPlaceholder}
                disabled={pending}
                options={REVERSE_REASON_CODES.map((c) => ({ value: c, label: labels.reasonOptions[c] }))}
              />
            </div>
          </label>

          {/* Optional note. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.note} <span className="text-xs font-normal text-slate-400">({labels.noteOptional})</span>
            </span>
            <textarea
              data-testid="wo-reverse-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* E-sign block — ALWAYS required (mirrors the R2 output void modal). */}
          <div data-testid="wo-reverse-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="wo-reverse-password"
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
            <p role="alert" data-testid="wo-reverse-error" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="wo-reverse-cancel"
          disabled={pending}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="wo-reverse-submit"
          disabled={!valid}
          onClick={submit}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
