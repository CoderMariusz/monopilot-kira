'use client';

/**
 * MODAL-HOLD-RELEASE — release a quality hold with e-sign (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:98-156 (HoldReleaseModal):
 *     summary rows (hold / reference / reason / priority) → modals.jsx:115-121
 *     disposition select (required, not Pending)          → modals.jsx:123-128
 *     release notes (required)                            → modals.jsx:130-132
 *     SoD warning copy (V-QA-HOLD-006)                    → modals.jsx:134-139
 *     e-sign block (21 CFR Part 11) + password            → modals.jsx:141-153
 *     footer Cancel / Release Hold (disabled until valid) → modals.jsx:110-113
 *
 * Wires the reviewed releaseHold Server Action (imported, never authored). The
 * action verifies the signature via signEvent and gates quality.hold.release; the
 * SoD block + signature failure are enforced/returned SERVER-side — this island
 * never trusts a client-only SoD flag and surfaces e-sign failures VERBATIM.
 *
 * DEVIATIONS (red-lines): the prototype's 6-digit numeric PIN is replaced by the
 * backend's account-password signature (signEvent verifies the password); the
 * "Release as-is / Scrap / Rework / Return to supplier / Other" disposition list
 * maps to the action's release/scrap/rework/partial union. Server time + signer
 * identity in the e-sign block are rendered by the server (not faked client-side).
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { releaseHold } from '../../_actions/hold-actions';

export type ReleaseDisposition = 'release' | 'scrap' | 'rework' | 'partial';
const DISPOSITIONS: ReleaseDisposition[] = ['release', 'scrap', 'rework', 'partial'];

export type HoldReleaseTarget = {
  id: string;
  holdNumber: string;
  referenceDisplay: string;
  reason: string;
  priority: string;
};

export type HoldReleaseLabels = {
  title: string;
  summary: { hold: string; reference: string; reason: string; priority: string };
  disposition: string;
  dispositionHelp: string;
  dispositionPlaceholder: string;
  dispositionOptions: Record<ReleaseDisposition, string>;
  reasonText: string;
  reasonTextHelp: string;
  reasonTextPlaceholder: string;
  sodWarning: string;
  esign: { title: string; meaning: string; password: string; passwordHelp: string; passwordPlaceholder: string };
  cancel: string;
  submit: string;
  submitting: string;
  validation: { dispositionRequired: string; reasonRequired: string; passwordRequired: string };
  error: string;
  success: string;
};

export function HoldReleaseModal({
  open,
  onOpenChange,
  hold,
  labels,
  releaseHoldAction,
  onReleased,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hold: HoldReleaseTarget;
  labels: HoldReleaseLabels;
  releaseHoldAction: typeof releaseHold;
  onReleased?: () => void;
}) {
  const [disposition, setDisposition] = useState<ReleaseDisposition | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedReason = reasonText.trim();
  const valid = disposition !== '' && trimmedReason.length > 0 && password.length > 0;

  function reset() {
    setDisposition('');
    setReasonText('');
    setPassword('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (disposition === '') return setError(labels.validation.dispositionRequired);
    if (trimmedReason.length === 0) return setError(labels.validation.reasonRequired);
    if (password.length === 0) return setError(labels.validation.passwordRequired);

    startTransition(async () => {
      const result = await releaseHoldAction({
        holdId: hold.id,
        disposition,
        reasonText: trimmedReason,
        signature: { password },
      });
      if (!result.ok) {
        // Surface e-sign / SoD / forbidden failures VERBATIM (action message).
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      reset();
      onOpenChange(false);
      onReleased?.();
    });
  }

  const summaryRows: Array<[string, string]> = [
    [labels.summary.hold, hold.holdNumber],
    [labels.summary.reference, hold.referenceDisplay],
    [labels.summary.reason, hold.reason],
    [labels.summary.priority, hold.priority],
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="hold_release_modal" dismissible={!pending}>
      <Modal.Header title={labels.title.replace('{holdNumber}', hold.holdNumber)} />
      <Modal.Body>
        <div data-testid="hold-release-form" className="flex flex-col gap-4 text-sm">
          {/* Summary (parity modals.jsx:115-121). */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Disposition (parity modals.jsx:123-128) — shadcn Select, no raw <select>. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.disposition} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="hold-release-disposition">
              <Select
                aria-label={labels.disposition}
                value={disposition}
                onValueChange={(v) => setDisposition(v as ReleaseDisposition)}
                placeholder={labels.dispositionPlaceholder}
                options={DISPOSITIONS.map((d) => ({ value: d, label: labels.dispositionOptions[d] }))}
              />
            </div>
            <span className="text-xs text-slate-400">{labels.dispositionHelp}</span>
          </label>

          {/* Release notes (parity modals.jsx:130-132). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonText} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="hold-release-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={labels.reasonTextPlaceholder}
              rows={3}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.reasonTextHelp}</span>
          </label>

          {/* SoD warning copy (parity modals.jsx:134-139) — informational; the
              server enforces the actual block and returns it verbatim. */}
          <div
            role="note"
            data-testid="hold-release-sod-note"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            ⚠ {labels.sodWarning}
          </div>

          {/* E-sign block (parity modals.jsx:141-153). */}
          <div data-testid="hold-release-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="hold-release-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={labels.esign.passwordPlaceholder}
                autoComplete="current-password"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
          </div>

          {error && (
            <p role="alert" data-testid="hold-release-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="hold-release-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="hold-release-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-emerald-700 disabled:opacity-50"
        >
          🔒 {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
