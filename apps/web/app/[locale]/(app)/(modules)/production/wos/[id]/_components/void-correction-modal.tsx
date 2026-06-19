'use client';

/**
 * C-R2 — Void / correction modal for WO-detail Output + Waste rows.
 *
 * Reversibility UI for production records: an operator voids a registered output
 * (e-sign required) or a waste entry (no e-sign) by recording a counter
 * "correction" row server-side. The modal collects a shared reason code + an
 * optional note; for outputs it additionally collects the account password and
 * mirrors the quality holds release modal's e-sign block
 * (quality/holds/_components/hold-release-modal.client.tsx — the in-repo e-sign
 * precedent; no prototype void/correction screen exists in
 * prototypes/design/Monopilot Design System/production/, so this is spec-driven
 * off that pattern + the pinned corrections-actions contract).
 *
 * The Server Actions (voidWoOutput / voidWasteEntry) are OWNED by the corrections
 * backend lane (production/_actions/corrections-actions.ts) and are imported by
 * the RSC page and threaded here as props — this island never authors them and
 * never trusts a client-only RBAC / state decision. Typed errors are mapped to
 * honest copy; 'lp_not_voidable' / 'already_corrected' get bespoke lines.
 *
 * All five UI states: idle (form), error (typed → copy banner), optimistic
 * (submit disabled + "Voiding…"); empty/permission-denied are owned by the
 * caller (the action affordance is hidden when forbidden or already corrected).
 */

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

// ── Pinned contract (corrections-actions.ts — backend lane owns the impl). ──────
// Shared reason codes for the void/correction select.
export const VOID_REASON_CODES = [
  'entry_error',
  'wrong_quantity',
  'wrong_batch',
  'wrong_product',
  'other',
] as const;
export type VoidReasonCode = (typeof VOID_REASON_CODES)[number];

export type VoidWasteEntryInput = { wasteId: string; reasonCode: VoidReasonCode; note?: string };
export type VoidWasteEntryError =
  | 'forbidden'
  | 'not_found'
  | 'already_corrected'
  | 'invalid_input'
  | 'persistence_failed';
export type VoidWasteEntryResult = { ok: true } | { ok: false; error: VoidWasteEntryError; message?: string };

export type VoidWoOutputInput = {
  outputId: string;
  reasonCode: VoidReasonCode;
  note?: string;
  signature: { password: string };
};
export type VoidWoOutputError =
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'invalid_input'
  | 'lp_not_voidable'
  | 'already_corrected'
  | 'esign_failed'
  | 'persistence_failed';
export type VoidWoOutputResult = { ok: true } | { ok: false; error: VoidWoOutputError; message?: string };

// ── i18n labels (resolved server-side, threaded down). ─────────────────────────
export type VoidModalLabels = {
  /** Output modal title (e-sign). `{batch}` is interpolated. */
  outputTitle: string;
  /** Waste modal title (no e-sign). `{category}` is interpolated. */
  wasteTitle: string;
  intro: string;
  reasonCode: string;
  reasonPlaceholder: string;
  reasonOptions: Record<VoidReasonCode, string>;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  /** Closed-WO supervisor-authorization warning (shown only when woClosed). */
  closedWarning: string;
  esign: { title: string; meaning: string; password: string; passwordPlaceholder: string; passwordHelp: string };
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  /** Typed-error copy. lp_not_voidable + already_corrected are bespoke. */
  errors: {
    forbidden: string;
    not_found: string;
    invalid_state: string;
    invalid_input: string;
    lp_not_voidable: string;
    already_corrected: string;
    esign_failed: string;
    persistence_failed: string;
    generic: string;
  };
};

type VoidTarget =
  | { kind: 'output'; id: string; batchLabel: string }
  | { kind: 'waste'; id: string; categoryLabel: string };

export function VoidCorrectionModal({
  open,
  target,
  woClosed,
  labels,
  voidWoOutputAction,
  voidWasteEntryAction,
  onClose,
  onVoided,
}: {
  open: boolean;
  /** Null when no row is selected (modal closed). */
  target: VoidTarget | null;
  /** True when the WO status is `closed` → renders the supervisor-auth warning. */
  woClosed: boolean;
  labels: VoidModalLabels;
  voidWoOutputAction: (input: VoidWoOutputInput) => Promise<VoidWoOutputResult>;
  voidWasteEntryAction: (input: VoidWasteEntryInput) => Promise<VoidWasteEntryResult>;
  onClose: () => void;
  onVoided: () => void;
}) {
  const isOutput = target?.kind === 'output';
  const [reasonCode, setReasonCode] = useState<VoidReasonCode | ''>('');
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
  }, [open, target?.id]);

  const valid =
    reasonCode !== '' &&
    (!isOutput || password.length > 0) &&
    !pending;

  function mapError(code: string): string {
    switch (code) {
      case 'forbidden':
        return labels.errors.forbidden;
      case 'not_found':
        return labels.errors.not_found;
      case 'invalid_state':
        return labels.errors.invalid_state;
      case 'invalid_input':
        return labels.errors.invalid_input;
      case 'lp_not_voidable':
        return labels.errors.lp_not_voidable;
      case 'already_corrected':
        return labels.errors.already_corrected;
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
      const result =
        target.kind === 'output'
          ? await voidWoOutputAction({
              outputId: target.id,
              reasonCode,
              note: note_,
              signature: { password },
            })
          : await voidWasteEntryAction({ wasteId: target.id, reasonCode, note: note_ });
      if (!result.ok) {
        setError(mapError(result.error));
        return;
      }
      onVoided();
    });
  }

  const title = !target
    ? ''
    : target.kind === 'output'
      ? labels.outputTitle.replace('{batch}', target.batchLabel)
      : labels.wasteTitle.replace('{category}', target.categoryLabel);

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : onClose())}
      modalId="wo-void-correction"
      size="sm"
      dismissible={!pending}
    >
      <Modal.Header title={title} />
      <Modal.Body>
        <div data-testid="wo-void-form" className="flex flex-col gap-4 text-sm">
          <p className="text-slate-600">{labels.intro}</p>

          {/* Closed-WO supervisor-authorization warning. */}
          {woClosed ? (
            <div
              role="note"
              data-testid="wo-void-closed-warning"
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
            <div data-testid="wo-void-reason">
              <Select
                aria-label={labels.reasonCode}
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as VoidReasonCode)}
                placeholder={labels.reasonPlaceholder}
                disabled={pending}
                options={VOID_REASON_CODES.map((c) => ({ value: c, label: labels.reasonOptions[c] }))}
              />
            </div>
          </label>

          {/* Optional note. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.note} <span className="text-xs font-normal text-slate-400">({labels.noteOptional})</span>
            </span>
            <textarea
              data-testid="wo-void-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* E-sign block — OUTPUT ONLY (mirrors hold-release-modal). Waste has none. */}
          {isOutput ? (
            <div data-testid="wo-void-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
              <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">
                  {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  data-testid="wo-void-password"
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
          ) : null}

          {error ? (
            <p role="alert" data-testid="wo-void-error" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="wo-void-cancel"
          disabled={pending}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="wo-void-submit"
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
