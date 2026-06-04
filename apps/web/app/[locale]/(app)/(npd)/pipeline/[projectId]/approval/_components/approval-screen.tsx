'use client';

/**
 * T-079 — ApprovalScreen (approval_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:412-475 (ApprovalScreen)
 *
 * Structural map (prototype → production):
 *   - card "Approval gates" + count badges + 7 status rows  → <CriteriaCard> (gates summary card,
 *                                                             driven by the T-078 evaluateApprovalCriteria
 *                                                             C1-C7 result — REAL, org-scoped, never mock)
 *   - card "Approval chain (single|multi)" + Submit button  → the chain card here; Submit-for-approval CTA
 *   - approvalMode prop ('multi' vs single)                 → project.approval_mode read server-side
 *   - approval-step rows (done/current/pending + badge)     → chain step rows with glyph + variant Badge
 *   - "Submit for approval" btn                             → gated DISABLED unless every C1-C7 is
 *                                                             pass/not_required (§17.11.5); opens the
 *                                                             GateApprovalModal e-sign flow (T-061 / §17.6)
 *                                                             which invokes the merged approveProjectGate
 *                                                             Server Action (passed in as `onApprove`).
 *
 * RBAC: `canApprove` is resolved server-side (page.tsx) and never trusted from the
 * client — the Submit affordance is omitted (not render-then-disabled) when false.
 *
 * Required UI states: loading / empty / error / permission-denied (via `state`) +
 * optimistic submit feedback inside the modal (busy → success / error).
 *
 * Sensory (C4) is consumed as a Technical-owned status — this screen never reads
 * NPD sensory tables.
 */

import React from 'react';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';

import {
  CRITERIA_ORDER,
  CriteriaCard,
  tallyCriteria,
  type ApprovalCriterionKey,
  type ApprovalCriterionStatus,
  type CriteriaLabels,
} from './criteria-card';
import { GateApprovalModal, type GateApprovalModalLabels } from './gate-approval-modal';

export { CRITERIA_ORDER };
export type { ApprovalCriterionKey, ApprovalCriterionStatus };

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
export type ApprovalMode = 'single' | 'multi';
export type ApprovalGateCode = 'G3' | 'G4';
export type ChainStepStatus = 'done' | 'current' | 'pending';

export type ApprovalChainStep = {
  who: string;
  name: string | null;
  status: ChainStepStatus;
  when: string | null;
};

export type ApprovalScreenData = {
  projectId: string;
  projectCode: string;
  projectName: string;
  gateCode: ApprovalGateCode;
  approvalMode: ApprovalMode;
  criteria: Record<ApprovalCriterionKey, ApprovalCriterionStatus>;
  steps: ApprovalChainStep[];
};

/** approveProjectGate Server Action contract (T-061 owns the action; the page passes an adapter). */
export type ApproveGateCall = {
  projectId: string;
  gateCode: ApprovalGateCode;
  decision: 'approved';
  notes: string;
  password: string;
};
export type ApproveGateOutcome = { ok: true } | { ok: false; error: string };
export type ApproveGateAction = (call: ApproveGateCall) => Promise<ApproveGateOutcome>;

export type ApprovalLabels = CriteriaLabels &
  GateApprovalModalLabels & {
    chainTitle: string;
    chainSingle: string;
    chainMulti: string;
    submit: string;
    submitBlocked: string;
    stepDone: string;
    stepCurrent: string;
    stepPending: string;
    loading: string;
    empty: string;
    emptyBody: string;
    error: string;
    forbidden: string;
  };

function StateNotice({ state, labels }: { state: PageState; labels: ApprovalLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="approval-loading" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="approval-error" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" data-testid="approval-forbidden" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

function stepStatusBadge(status: ChainStepStatus, labels: ApprovalLabels): React.ReactNode {
  switch (status) {
    case 'done':
      return (
        <Badge variant="success" aria-label={labels.stepDone}>
          <span aria-hidden="true">✓</span> {labels.stepDone}
        </Badge>
      );
    case 'current':
      return (
        <Badge variant="warning" aria-label={labels.stepCurrent}>
          <span aria-hidden="true">⌛</span> {labels.stepCurrent}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" aria-label={labels.stepPending}>
          <span aria-hidden="true">○</span> {labels.stepPending}
        </Badge>
      );
  }
}

export function ApprovalScreen({
  state = 'ready',
  data,
  labels,
  canApprove,
  onApprove,
}: {
  state?: PageState;
  data: ApprovalScreenData | null;
  labels: ApprovalLabels;
  canApprove: boolean;
  onApprove?: ApproveGateAction;
}) {
  const [modalOpen, setModalOpen] = React.useState(false);

  if (state !== 'ready' && state !== 'empty') {
    return (
      <main
        data-testid="approval-screen"
        aria-labelledby="approval-title"
        className="mx-auto w-full max-w-4xl space-y-4 p-6"
      >
        <h1 id="approval-title" className="sr-only">
          {labels.title}
        </h1>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  if (state === 'empty' || !data) {
    return (
      <main
        data-testid="approval-screen"
        aria-labelledby="approval-title"
        className="mx-auto w-full max-w-4xl space-y-4 p-6"
      >
        <h1 id="approval-title" className="sr-only">
          {labels.title}
        </h1>
        <EmptyState icon={<span aria-hidden="true">✓</span>} title={labels.empty} body={labels.emptyBody} action={<span />} />
      </main>
    );
  }

  const counts = tallyCriteria(data.criteria);
  const canSubmit = counts.allSatisfied;

  return (
    <main
      data-testid="approval-screen"
      aria-labelledby="approval-title"
      className="mx-auto w-full max-w-4xl space-y-4 p-6"
    >
      <header>
        <nav aria-label="breadcrumb" className="text-xs text-slate-500">
          NPD / {data.projectCode} / {labels.title}
        </nav>
        <h1 id="approval-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          {data.projectName}
        </h1>
      </header>

      {/* Card 1 — 7-criteria gates summary */}
      <CriteriaCard criteria={data.criteria} labels={labels} />

      {/* Card 2 — approval chain status + Submit-for-approval CTA */}
      <Card data-testid="approval-chain-card" className="space-y-3 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            {labels.chainTitle}{' '}
            <span className="text-sm font-normal text-slate-500">
              {data.approvalMode === 'multi' ? labels.chainMulti : labels.chainSingle}
            </span>
          </h2>
          {canApprove ? (
            <span>
              <Button
                type="button"
                data-testid="submit-for-approval"
                disabled={!canSubmit}
                aria-describedby={!canSubmit ? 'submit-blocked-hint' : undefined}
                onClick={() => setModalOpen(true)}
              >
                {labels.submit}
              </Button>
              {!canSubmit ? (
                <span id="submit-blocked-hint" className="sr-only">
                  {labels.submitBlocked}
                </span>
              ) : null}
            </span>
          ) : null}
        </header>

        {!canSubmit ? (
          <p role="note" data-testid="submit-blocked-note" className="text-xs text-amber-700">
            <span aria-hidden="true">⚠</span> {labels.submitBlocked}
          </p>
        ) : null}

        <ol className="list-none space-y-2 p-0" data-testid="approval-chain-steps">
          {data.steps.map((step, index) => (
            <li
              key={`${step.who}-${index}`}
              data-testid={`chain-step-${index}`}
              data-status={step.status}
              className={[
                'flex items-center gap-3 rounded-md border p-2.5',
                step.status === 'current'
                  ? 'border-amber-200 bg-amber-50'
                  : step.status === 'done'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 ring-1 ring-slate-200"
              >
                {step.status === 'done' ? '✓' : index + 1}
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{step.who}</div>
                <div className="text-xs text-slate-500">
                  {[step.name, step.when].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              {stepStatusBadge(step.status, labels)}
            </li>
          ))}
        </ol>
      </Card>

      {canApprove && modalOpen ? (
        <GateApprovalModal
          open
          projectId={data.projectId}
          projectCode={data.projectCode}
          gateCode={data.gateCode}
          labels={labels}
          onClose={() => setModalOpen(false)}
          onApprove={onApprove}
        />
      ) : null}
    </main>
  );
}

export default ApprovalScreen;
