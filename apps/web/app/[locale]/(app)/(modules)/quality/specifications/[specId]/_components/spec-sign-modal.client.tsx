'use client';

/**
 * MODAL-SPEC-SIGN — approve a specification with e-sign (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:158-206 (SpecSignModal):
 *     summary rows (product / spec code / version /
 *       parameters / effective)                           → modals.jsx:176-182
 *     pre-approval checklist (V-QA-SPEC-002/003/005)       → modals.jsx:184-189
 *     info box (allergen snapshot + immutable warning)     → modals.jsx:191-194
 *     e-sign block (21 CFR Part 11) + credential field     → modals.jsx:196-203
 *     footer Cancel / Approve (disabled until valid)       → modals.jsx:170-174
 *
 * Wires the reviewed approveSpec Server Action (imported, never authored). The
 * action verifies the signature + gates only quality_lead (V-QA-SPEC-005) and the
 * pre-approval checks SERVER-side — this island never trusts a client-only flag and
 * surfaces e-sign failures VERBATIM (action message).
 *
 * DEVIATION (red-line, mirrors the hold-release modal): the prototype's 6-digit
 * numeric PIN (modals.jsx:200) is replaced by the backend's account-PASSWORD
 * signature (approveSpec verifies the password). Signer identity + server time are
 * resolved server-side, not faked client-side. The "Effective" summary row is
 * replaced by "Applies to" (the detail contract carries appliesTo, not effective
 * dates).
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import type { ApproveSpecFn } from '../../_components/spec-actions-contract';

export type SpecSignTarget = {
  id: string;
  specCode: string;
  version: number;
  productCode: string;
  productName: string;
  appliesTo: string;
  parameterCount: number;
  criticalCount: number;
};

export type SpecSignLabels = {
  title: string;
  summary: { product: string; specCode: string; version: string; parameters: string; appliesTo: string };
  parametersValue: string;
  checklistTitle: string;
  checklist: { testMethod: string; minLeMax: string; role: string };
  infoBox: string;
  esign: { title: string; meaning: string; password: string; passwordHelp: string; passwordPlaceholder: string };
  cancel: string;
  submit: string;
  submitting: string;
  validation: { passwordRequired: string };
  error: string;
  success: string;
};

export function SpecSignModal({
  open,
  onOpenChange,
  spec,
  labels,
  approveSpecAction,
  onApproved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: SpecSignTarget;
  labels: SpecSignLabels;
  approveSpecAction: ApproveSpecFn;
  onApproved?: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = password.length > 0;

  function reset() {
    setPassword('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (password.length === 0) return setError(labels.validation.passwordRequired);

    startTransition(async () => {
      const result = await approveSpecAction({ specId: spec.id, signature: { password } });
      if (!result.ok) {
        // Surface e-sign / forbidden failures VERBATIM (action message).
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      reset();
      onOpenChange(false);
      onApproved?.();
    });
  }

  const summaryRows: Array<[string, string]> = [
    [labels.summary.product, `${spec.productCode} ${spec.productName}`],
    [labels.summary.specCode, spec.specCode],
    [labels.summary.version, `v${spec.version}`],
    [
      labels.summary.parameters,
      labels.parametersValue
        .replace('{count}', String(spec.parameterCount))
        .replace('{critical}', String(spec.criticalCount)),
    ],
    [labels.summary.appliesTo, spec.appliesTo],
  ];

  const checks = [labels.checklist.testMethod, labels.checklist.minLeMax, labels.checklist.role];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="spec_sign_modal" dismissible={!pending}>
      <Modal.Header title={labels.title.replace('{specCode}', spec.specCode).replace('{version}', String(spec.version))} />
      <Modal.Body>
        <div data-testid="spec-sign-form" className="flex flex-col gap-4 text-sm">
          {/* Summary (parity modals.jsx:176-182). */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Pre-approval checklist (parity modals.jsx:184-189). */}
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.checklistTitle}</h4>
            <ul data-testid="spec-sign-checklist" className="flex flex-col gap-1">
              {checks.map((text) => (
                <li key={text} className="flex items-start gap-2 text-xs text-slate-700">
                  <span aria-hidden className="text-emerald-600">✓</span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Info box (parity modals.jsx:191-194). */}
          <div
            role="note"
            data-testid="spec-sign-info"
            className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
          >
            ⓘ {labels.infoBox}
          </div>

          {/* E-sign block (parity modals.jsx:196-203). */}
          <div data-testid="spec-sign-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="spec-sign-password"
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
            <p role="alert" data-testid="spec-sign-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="spec-sign-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="spec-sign-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-indigo-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
