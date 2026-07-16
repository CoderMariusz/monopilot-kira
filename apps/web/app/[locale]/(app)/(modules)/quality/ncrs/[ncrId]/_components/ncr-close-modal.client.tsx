'use client';

/**
 * MODAL-NCR-CLOSE — close a Non-Conformance Report with conditional e-sign.
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:384-466 (NcrCloseModal):
 *     summary rows (NCR / title / severity / status)     → modals.jsx:408-413
 *     closure notes (required, min 10)                    → modals.jsx:422-424
 *     critical dual-sign warning (V-QA-NCR-006)           → modals.jsx:437-442
 *     e-sign block + signature input                      → modals.jsx:444-462
 *     footer Cancel / Close NCR (disabled until valid)    → modals.jsx:403-406
 *
 * Wires the reviewed closeNcr Server Action (imported, never authored). Per the
 * contract closeNcr({ncrId, resolution, signature:{password}}) — every NCR close
 * requires e-sign (21 CFR Part 11); the server re-verifies via signEvent and
 * rejects when no receipt hash is produced. Critical NCRs additionally enforce
 * dual-sign SoD server-side; failures are surfaced VERBATIM.
 *
 * DEVIATIONS (red-lines): the prototype's 6-digit numeric PINs + the dual second
 * signer PIN block (modals.jsx:444-462) collapse to a single account-password
 * e-sign field (the backend signature contract is {password}); the second
 * Production-Manager signature for critical NCRs is enforced SERVER-side (SoD), not
 * collected as a second client PIN. The pre-close checklist + root-cause/category
 * re-entry (modals.jsx:415-435) live on the detail Investigation section (saved via
 * updateNcrInvestigation before close), so the modal stays a focused close action.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import type { CloseNcrAction, NcrSeverity, NcrStatus } from '../../_components/ncr-contracts';

const RESOLUTION_MIN = 10;

export type NcrCloseLabels = {
  title: string;
  summary: { ncr: string; title: string; severity: string; status: string };
  resolution: string;
  resolutionHelp: string;
  resolutionPlaceholder: string;
  dualSignWarning: string;
  esign: { title: string; meaning: string; password: string; passwordHelp: string; passwordPlaceholder: string };
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { resolutionRequired: string; passwordRequired: string };
  policyErrors: Record<'second_signature_required' | 'signer_role_not_allowed', string>;
  error: string;
  success: string;
  severityValues: Record<string, string>;
  statusValues: Record<string, string>;
};

function closeErrorMessage(
  labels: NcrCloseLabels,
  result: { reason: string; code?: string; message?: string },
): string {
  const code = (result.reason === 'policy' ? (result.code ?? result.message) : (result.message ?? result.reason)) ?? result.reason;
  if (code === 'second_signature_required' || code === 'signer_role_not_allowed') {
    return labels.policyErrors[code];
  }
  return labels.error.replace('{message}', code);
}

export type NcrCloseTarget = {
  id: string;
  ncrNumber: string;
  title: string | null;
  severity: NcrSeverity;
  status: NcrStatus;
};

export function NcrCloseModal({
  open,
  onOpenChange,
  ncr,
  labels,
  closeNcrAction,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ncr: NcrCloseTarget;
  labels: NcrCloseLabels;
  closeNcrAction: CloseNcrAction;
  onClosed?: () => void;
}) {
  const [resolution, setResolution] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCritical = ncr.severity === 'critical';
  const trimmedResolution = resolution.trim();
  const valid = trimmedResolution.length >= RESOLUTION_MIN && password.length > 0;

  function reset() {
    setResolution('');
    setPassword('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (trimmedResolution.length < RESOLUTION_MIN) {
      setError(labels.validation.resolutionRequired);
      return;
    }
    if (password.length === 0) {
      setError(labels.validation.passwordRequired);
      return;
    }

    startTransition(async () => {
      const result = await closeNcrAction({
        ncrId: ncr.id,
        resolution: trimmedResolution,
        signature: { password },
      });
      if (!result.ok) {
        setError(closeErrorMessage(labels, result));
        return;
      }
      reset();
      onOpenChange(false);
      onClosed?.();
    });
  }

  const summaryRows: Array<[string, string]> = [
    [labels.summary.ncr, ncr.ncrNumber],
    [labels.summary.title, ncr.title ?? '—'],
    [labels.summary.severity, labels.severityValues[ncr.severity] ?? ncr.severity],
    [labels.summary.status, labels.statusValues[ncr.status] ?? ncr.status],
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="ncr_close_modal" dismissible={!pending}>
      <Modal.Header title={labels.title.replace('{number}', ncr.ncrNumber)} />
      <Modal.Body>
        <div data-testid="ncr-close-form" className="flex flex-col gap-4 text-sm">
          {/* Summary (parity modals.jsx:408-413). */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Closure notes (parity modals.jsx:422-424). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.resolution} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="ncr-close-resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={labels.resolutionPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.resolutionHelp}</span>
          </label>

          {/* Critical dual-sign warning (parity modals.jsx:437-442). */}
          {isCritical && (
            <div
              role="note"
              data-testid="ncr-close-dualsign-warning"
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              <span aria-hidden>⚠</span>
              <span>{labels.dualSignWarning}</span>
            </div>
          )}

          {/* E-sign block — required for every NCR close (parity modals.jsx:444-462). */}
          <div data-testid="ncr-close-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="ncr-close-password"
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
            <p role="alert" data-testid="ncr-close-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="ncr-close-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="ncr-close-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-emerald-700 disabled:opacity-50"
        >
          🔒 {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
