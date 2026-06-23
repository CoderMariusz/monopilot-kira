'use client';

/**
 * MODAL-HACCP-PLAN-ACTIVATE — approve / activate a HACCP plan with e-sign
 * (Wave E3, client island).
 *
 * Design-system conformance: parity with the prototype's "🔒 Approve Plan"
 * draft action (prototypes/design/Monopilot Design System/quality/
 * haccp-screens.jsx:58 → eSign modal) and the sibling MODAL-SPEC-SIGN island
 * (spec-sign-modal.client.tsx): summary rows, a pre-activation checklist, an
 * info box (21 CFR Part 11 immutability warning) and an e-sign credential block.
 *
 * Wires the reviewed `activateHaccpPlan` Server Action (haccp-plan-actions.ts),
 * imported by the page and passed in as a prop — NEVER authored here. The action
 * verifies the e-sign credential + gates `quality.haccp.plan_edit` SERVER-side
 * (signEvent), so this island never trusts a client-only flag and surfaces the
 * action's error/forbidden VERBATIM.
 *
 * DEVIATION (red-line, mirrors the hold-release / spec-sign modals): the
 * prototype's 6-digit numeric PIN is fulfilled by the backend's account-PASSWORD
 * signature (activateHaccpPlan verifies `{ password }`). The PIN input is the
 * required credential field every e-sign/activate modal MUST expose.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import type { ActivatePlanAction, HaccpPlanHeader } from './haccp-contracts';
import type { PlanActivateLabels } from './labels';

export type PlanActivateTarget = {
  id: string;
  name: string;
  scopeLabel: string;
  version: number;
};

export function PlanActivateModal({
  open,
  onOpenChange,
  plan,
  labels,
  activatePlanAction,
  onActivated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanActivateTarget;
  labels: PlanActivateLabels;
  activatePlanAction: ActivatePlanAction;
  onActivated?: (header: HaccpPlanHeader) => void;
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
      const result = await activatePlanAction(plan.id, { password });
      if (!result.ok) {
        // Surface e-sign / forbidden failures VERBATIM (action message).
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const header = result.data;
      reset();
      onOpenChange(false);
      onActivated?.(header);
    });
  }

  const summaryRows: Array<[string, string]> = [
    [labels.summary.name, plan.name],
    [labels.summary.scope, plan.scopeLabel],
    [labels.summary.version, `v${plan.version}`],
  ];

  const checks = [labels.checklist.ccpsDefined, labels.checklist.limitsSet, labels.checklist.role];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="haccp_plan_activate_modal" dismissible={!pending}>
      <Modal.Header title={labels.title.replace('{name}', plan.name)} />
      <Modal.Body>
        <div data-testid="haccp-plan-activate-form" className="flex flex-col gap-4 text-sm">
          {/* Summary. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Pre-activation checklist. */}
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.checklistTitle}</h4>
            <ul data-testid="haccp-plan-activate-checklist" className="flex flex-col gap-1">
              {checks.map((text) => (
                <li key={text} className="flex items-start gap-2 text-xs text-slate-700">
                  <span aria-hidden className="text-emerald-600">✓</span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Info box (21 CFR Part 11 immutability). */}
          <div
            role="note"
            data-testid="haccp-plan-activate-info"
            className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
          >
            ⓘ {labels.infoBox}
          </div>

          {/* E-sign block — the required PIN/credential field. */}
          <div data-testid="haccp-plan-activate-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="haccp-plan-activate-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder={labels.esign.passwordPlaceholder}
                autoComplete="current-password"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
          </div>

          {error && (
            <p role="alert" data-testid="haccp-plan-activate-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="haccp-plan-activate-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="haccp-plan-activate-submit"
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
