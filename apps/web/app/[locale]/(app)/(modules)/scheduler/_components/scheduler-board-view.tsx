'use client';

/**
 * Wave E8 — /scheduler board (client island).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning-ext/
 * sequencing-screens.jsx:1-179 — the run/preview control (sequencing-screens.jsx:
 * 29-35 "Preview sequence (dry-run)" / "Commit to schedule"), the changeover
 * cost summary (sequencing-screens.jsx:52-73), and the per-line proposed
 * sequence list with a changeover/clean badge per step (sequencing-screens.jsx:
 * 97-131 sequence-compare + seq-co cost). Honest deltas (deviation log in the
 * test header): the backend contract is changeover MINUTES + requires-cleaning,
 * not the prototype's allergen-minutes v2 optimizer, so the 4-KPI grid is
 * collapsed to the single real number (total changeover cost) and "Commit"
 * becomes the explicit Apply-schedule confirm. No drag&drop; pure CSS lanes
 * following the /planning/schedule board convention.
 *
 * Server-action seams (runScheduler / applySchedule) are injected by the RSC
 * page; RBAC is enforced server-side. UI states: idle/empty (no run yet),
 * loading (run pending → disabled + "Running…"), error (run/apply error →
 * inline alert), optimistic (pending run/apply disables controls), applied
 * (proposal marked applied → Apply disabled + badge).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';

import type { ApplyScheduleResult, SchedulerRunResult } from '../_actions/scheduler-types';
import { toProposal, type SchedulerLabelMaps, type SchedulerProposal } from './scheduler-view-model';

export type SchedulerBoardLabels = {
  run: {
    title: string;
    horizon: string;
    horizonDays: string; // "{n} days"
    button: string;
    running: string;
  };
  board: {
    proposedTitle: string;
    sequenceCol: string;
    woCol: string;
    plannedStart: string;
    plannedEnd: string;
    duration: string;
    qty: string;
    profileCol: string;
    changeover: string; // badge label
    totalCost: string; // "Total changeover cost: {cost}"
    empty: string;
    emptyHint: string;
    noAssignments: string;
    appliedBadge: string;
    omittedTitle: string; // "{count} work orders could not be scheduled"
    omittedReason: string; // reason label for no_feasible_changeover
  };
  apply: {
    button: string;
    applying: string;
    confirmTitle: string;
    confirmBody: string;
    confirm: string;
    cancel: string;
  };
  errors: Record<string, string>;
};

type RunAction = (input: { lineId?: string; horizonDays?: number }) => Promise<SchedulerRunResult>;
type ApplyAction = (runId: string) => Promise<ApplyScheduleResult>;

const HORIZON_OPTIONS = [1, 2, 3, 7, 14, 30] as const;

export function SchedulerBoardView({
  labels,
  locale,
  runAction,
  applyAction,
  labelMaps,
  initialProposal = null,
}: {
  labels: SchedulerBoardLabels;
  locale: string;
  runAction: RunAction;
  applyAction: ApplyAction;
  labelMaps?: SchedulerLabelMaps;
  initialProposal?: SchedulerProposal | null;
}) {
  const router = useRouter();

  const [horizonDays, setHorizonDays] = React.useState<number>(7);
  const [proposal, setProposal] = React.useState<SchedulerProposal | null>(initialProposal);
  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState(initialProposal?.applied ?? false);

  React.useEffect(() => {
    setProposal(initialProposal);
    setApplied(initialProposal?.applied ?? false);
  }, [initialProposal]);

  const dateFmt = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  const errorLabel = (key: string) => labels.errors[key] ?? labels.errors.persistence_failed;

  const runScheduler = async () => {
    setRunning(true);
    setRunError(null);
    setApplyError(null);
    const result = await runAction({ horizonDays });
    setRunning(false);
    if (result.ok) {
      const mapped = toProposal(result, labelMaps);
      setProposal(mapped);
      setApplied(mapped.applied);
    } else {
      setProposal(null);
      setRunError(result.error);
    }
  };

  const confirmApply = async () => {
    if (!proposal) return;
    setApplying(true);
    setApplyError(null);
    const result = await applyAction(proposal.runId);
    setApplying(false);
    if (result.ok) {
      setConfirmOpen(false);
      setApplied(true);
      router.refresh();
    } else {
      setConfirmOpen(false);
      setApplyError(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="scheduler-board">
      {/* Run control — sequencing-screens.jsx:29-35 run/commit row. */}
      <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="scheduler-run-control">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{labels.run.title}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{labels.run.horizon}</span>
            {/* Desktop board → a normal <select> is acceptable (task note). */}
            <select
              data-testid="scheduler-horizon"
              className="mp-field-control h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
              disabled={running}
            >
              {HORIZON_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {labels.run.horizonDays.replace('{n}', String(n))}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            className="btn--primary"
            data-testid="scheduler-run-button"
            onClick={runScheduler}
            disabled={running}
          >
            {running ? labels.run.running : labels.run.button}
          </Button>
        </div>
        {runError ? (
          <p
            role="alert"
            data-testid="scheduler-run-error"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorLabel(runError)}
          </p>
        ) : null}
      </section>

      {/* Proposal / empty state. */}
      {!proposal ? (
        <div
          data-testid="scheduler-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
        >
          <p className="text-sm font-medium text-slate-700">{labels.board.empty}</p>
          <p className="mt-1 text-xs text-slate-500">{labels.board.emptyHint}</p>
        </div>
      ) : (
        <section data-testid="scheduler-proposal" className="flex flex-col gap-4">
          {/* Summary bar — sequencing-screens.jsx:52-73 changeover cost summary,
              collapsed to the single real number + the Apply control. */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{labels.board.proposedTitle}</h2>
              <p className="mt-0.5 text-sm text-slate-600" data-testid="scheduler-total-cost">
                {labels.board.totalCost.replace('{cost}', String(proposal.totalChangeoverCost))}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {applied ? (
                <span
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                  data-testid="scheduler-applied-badge"
                >
                  {labels.board.appliedBadge}
                </span>
              ) : null}
              <Button
                type="button"
                className="btn--primary"
                data-testid="scheduler-apply-button"
                onClick={() => setConfirmOpen(true)}
                disabled={applying || applied}
              >
                {labels.apply.button}
              </Button>
            </div>
          </div>

          {applyError ? (
            <p
              role="alert"
              data-testid="scheduler-apply-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorLabel(applyError)}
            </p>
          ) : null}

          {(proposal.omittedWorkOrders?.length ?? 0) > 0 ? (
            <div
              data-testid="scheduler-omitted-notice"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <p className="font-medium">
                {labels.board.omittedTitle.replace(
                  '{count}',
                  String(proposal.omittedWorkOrders?.length ?? 0),
                )}
              </p>
              <ul className="mt-2 list-inside list-disc text-amber-800">
                {proposal.omittedWorkOrders?.map((omitted) => (
                  <li key={omitted.woId} data-testid={`scheduler-omitted-${omitted.woLabel}`}>
                    {omitted.woLabel} — {labels.board.omittedReason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {proposal.lanes.length === 0 ? (
            <p
              className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500"
              data-testid="scheduler-no-assignments"
            >
              {labels.board.noAssignments}
            </p>
          ) : (
            proposal.lanes.map((lane) => (
              <div
                key={lane.lineId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                data-testid={`scheduler-lane-${lane.lineCode}`}
              >
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-semibold text-slate-900">{lane.lineCode}</span>
                  {lane.lineName ? <span className="text-xs text-slate-500">{lane.lineName}</span> : null}
                </div>
                <ol className="divide-y divide-slate-100">
                  {lane.assignments.map((a) => {
                    const needsWash = a.changeoverFromPrev > 0;
                    return (
                      <li
                        key={a.woId}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm"
                        data-testid={`scheduler-assignment-${a.woLabel}`}
                      >
                        <span
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-slate-700"
                          aria-label={`${labels.board.sequenceCol} ${a.sequence}`}
                        >
                          {a.sequence}
                        </span>
                        <span className="font-mono font-semibold text-slate-900">{a.woLabel}</span>
                        {a.profileKey ? (
                          <span className="text-xs text-slate-500">{a.profileKey}</span>
                        ) : null}
                        {needsWash ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                            data-testid="scheduler-changeover-badge"
                            title={`${labels.board.changeover}: ${a.changeoverFromPrev}`}
                          >
                            <span aria-hidden>⟳</span>
                            {labels.board.changeover} +{a.changeoverFromPrev}
                          </span>
                        ) : null}
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-3 font-mono text-xs text-slate-500">
                          {a.qty ? (
                            <span data-testid={`scheduler-assignment-qty-${a.woLabel}`}>{a.qty}</span>
                          ) : null}
                          {a.durationMinutes !== null ? (
                            <span data-testid={`scheduler-assignment-duration-${a.woLabel}`}>
                              {labels.board.duration.replace('{minutes}', String(a.durationMinutes))}
                            </span>
                          ) : null}
                          <span>
                            {a.plannedStart ? dateFmt.format(new Date(a.plannedStart)) : '—'}
                          </span>
                          {a.plannedEnd ? (
                            <span data-testid={`scheduler-assignment-end-${a.woLabel}`}>
                              → {dateFmt.format(new Date(a.plannedEnd))}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))
          )}
        </section>
      )}

      {/* Apply confirm — the explicit "this changes production" gate
          (sequencing-screens.jsx:33 "Commit to schedule"). */}
      <Modal
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !applying) setConfirmOpen(false);
        }}
        size="sm"
        modalId="scheduler-apply-confirm-modal"
      >
        <Modal.Header title={labels.apply.confirmTitle} />
        <Modal.Body>
          <p className="text-sm text-slate-700">{labels.apply.confirmBody}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" onClick={() => setConfirmOpen(false)} disabled={applying}>
            {labels.apply.cancel}
          </Button>
          <Button
            type="button"
            className="btn--primary"
            data-testid="scheduler-apply-confirm"
            onClick={confirmApply}
            disabled={applying}
          >
            {applying ? labels.apply.applying : labels.apply.confirm}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
