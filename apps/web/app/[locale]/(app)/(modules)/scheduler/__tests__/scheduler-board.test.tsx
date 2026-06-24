/**
 * Wave E8 — /scheduler board RTL tests.
 *
 * Spec-driven UI extending the planning schedule board conventions; prototype
 * parity anchor:
 *   prototypes/design/Monopilot Design System/planning-ext/sequencing-screens.jsx:1-179
 *     (run/preview control + per-line proposed sequence + changeover cost summary)
 * Honest deltas are logged in the deviation log — the backend contract is
 * changeover MINUTES + requires-cleaning (runScheduler/applySchedule returning
 * DB rows), not the prototype's allergen-minutes v2 optimizer.
 *
 * Asserts: running the scheduler renders the proposed sequence per line from a
 * mocked loader; the Apply button is gated behind a confirm dialog that calls
 * applySchedule(runId); empty/error states; i18n keys present in all four
 * locales.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../../i18n/en.json';
import plMessages from '../../../../../../i18n/pl.json';
import roMessages from '../../../../../../i18n/ro.json';
import ukMessages from '../../../../../../i18n/uk.json';

import { SchedulerBoardView, type SchedulerBoardLabels } from '../_components/scheduler-board-view';
import type { SchedulerLabelMaps } from '../_components/scheduler-view-model';
import type {
  SchedulerRunResult,
  ApplyScheduleResult,
  SchedulerRunRow,
  SchedulerAssignment,
} from '../_actions/scheduler-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const en = (enMessages as Record<string, any>).Scheduler;

const labels: SchedulerBoardLabels = {
  run: en.run,
  board: en.board,
  apply: en.apply,
  errors: en.errors,
};

const LINE_1 = '55555555-5555-4555-8555-555555555555';
const LINE_2 = '66666666-6666-4666-8666-666666666666';
const RUN_ID = 'run-0000-0000-0000-000000000001';
const WO_A = 'a0000000-0000-4000-8000-00000000000a';
const WO_B = 'b0000000-0000-4000-8000-00000000000b';
const WO_C = 'c0000000-0000-4000-8000-00000000000c';

const labelMaps: SchedulerLabelMaps = {
  woNumberById: { [WO_A]: 'WO-A', [WO_B]: 'WO-B', [WO_C]: 'WO-C' },
  lineById: {
    [LINE_1]: { code: 'LINE-01', name: 'Line One' },
    [LINE_2]: { code: 'LINE-02', name: 'Line Two' },
  },
  profileByWoId: { [WO_A]: 'GLUTEN_FREE', [WO_B]: 'CONTAINS_GLUTEN', [WO_C]: 'STANDARD' },
};

function runRow(over: Partial<SchedulerRunRow> = {}): SchedulerRunRow {
  return {
    run_id: RUN_ID,
    org_id: 'org',
    site_id: null,
    requested_by: null,
    status: 'completed',
    horizon_days: 7,
    line_ids: null,
    include_forecast: null,
    optimizer_version: 'v1',
    run_type: 'schedule',
    input_snapshot: null,
    output_summary: null,
    solve_duration_ms: 120,
    error_message: null,
    queued_at: '2026-06-24T08:00:00.000Z',
    started_at: '2026-06-24T08:00:00.000Z',
    completed_at: '2026-06-24T08:00:01.000Z',
    created_at: '2026-06-24T08:00:00.000Z',
    updated_at: '2026-06-24T08:00:01.000Z',
    ...over,
  };
}

function assignment(over: Partial<SchedulerAssignment> & { wo_id: string; line_id: string }): SchedulerAssignment {
  return {
    id: `as-${over.wo_id}`,
    org_id: 'org',
    site_id: null,
    run_id: RUN_ID,
    status: 'draft',
    sequence_index: 1,
    planned_start_at: '2026-06-24T06:00:00.000Z',
    planned_end_at: null,
    changeover_minutes: 0,
    optimizer_score: null,
    override_original_line_id: null,
    override_original_start_at: null,
    override_reason_code: null,
    override_by: null,
    override_at: null,
    approved_by: null,
    approved_at: null,
    ext: {},
    created_at: '2026-06-24T08:00:00.000Z',
    updated_at: '2026-06-24T08:00:00.000Z',
    ...over,
  };
}

function okRun(): Extract<SchedulerRunResult, { ok: true }> {
  return {
    ok: true,
    run: runRow(),
    assignments: [
      assignment({ wo_id: WO_A, line_id: LINE_1, sequence_index: 1, changeover_minutes: 0 }),
      assignment({
        wo_id: WO_B,
        line_id: LINE_1,
        sequence_index: 2,
        changeover_minutes: 45,
        planned_start_at: '2026-06-24T14:00:00.000Z',
      }),
      assignment({
        wo_id: WO_C,
        line_id: LINE_2,
        sequence_index: 1,
        changeover_minutes: 0,
        planned_start_at: '2026-06-25T06:00:00.000Z',
      }),
    ],
  };
}

function renderBoard(opts: {
  runAction?: (input: any) => Promise<SchedulerRunResult>;
  applyAction?: (runId: string) => Promise<ApplyScheduleResult>;
} = {}) {
  const runAction = opts.runAction ?? vi.fn(async () => okRun());
  const applyAction =
    opts.applyAction ??
    vi.fn(async () => ({ ok: true as const, run: runRow(), assignments: [], applied: true }));
  render(
    <SchedulerBoardView
      labels={labels}
      locale="en"
      runAction={runAction}
      applyAction={applyAction}
      labelMaps={labelMaps}
    />,
  );
  return { runAction, applyAction };
}

beforeEach(() => {
  refresh.mockClear();
});

describe('SchedulerBoardView — run + proposed sequence', () => {
  it('starts on an empty/idle state with no proposal', () => {
    renderBoard();
    expect(screen.getByTestId('scheduler-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('scheduler-proposal')).not.toBeInTheDocument();
  });

  it('runs the scheduler and renders the proposed sequence per line lane', async () => {
    const { runAction } = renderBoard();

    fireEvent.click(screen.getByTestId('scheduler-run-button'));

    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('scheduler-proposal')).toBeInTheDocument();

    const laneOne = within(screen.getByTestId('scheduler-lane-LINE-01'));
    expect(laneOne.getByTestId('scheduler-assignment-WO-A')).toBeInTheDocument();
    expect(laneOne.getByTestId('scheduler-assignment-WO-B')).toBeInTheDocument();
    const laneTwo = within(screen.getByTestId('scheduler-lane-LINE-02'));
    expect(laneTwo.getByTestId('scheduler-assignment-WO-C')).toBeInTheDocument();

    expect(laneOne.getByTestId('scheduler-assignment-WO-A')).toHaveTextContent('1');
    expect(laneOne.getByTestId('scheduler-assignment-WO-B')).toHaveTextContent('2');

    expect(screen.getByTestId('scheduler-total-cost')).toHaveTextContent('45');
  });

  it('shows a changeover/wash badge only between consecutive WOs that need a wash', async () => {
    renderBoard();
    fireEvent.click(screen.getByTestId('scheduler-run-button'));
    await screen.findByTestId('scheduler-proposal');

    expect(
      within(screen.getByTestId('scheduler-assignment-WO-B')).getByTestId('scheduler-changeover-badge'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('scheduler-assignment-WO-A')).queryByTestId('scheduler-changeover-badge'),
    ).not.toBeInTheDocument();
  });

  it('passes the chosen horizon to runScheduler', async () => {
    const { runAction } = renderBoard();

    fireEvent.change(screen.getByTestId('scheduler-horizon'), { target: { value: '14' } });
    fireEvent.click(screen.getByTestId('scheduler-run-button'));

    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    expect(runAction).toHaveBeenCalledWith({ horizonDays: 14 });
  });

  it('surfaces a run error inline and renders no proposal', async () => {
    const runAction = vi.fn(async () => ({ ok: false as const, error: 'persistence_failed' as const }));
    renderBoard({ runAction });

    fireEvent.click(screen.getByTestId('scheduler-run-button'));

    expect(await screen.findByTestId('scheduler-run-error')).toHaveTextContent(en.errors.persistence_failed);
    expect(screen.queryByTestId('scheduler-proposal')).not.toBeInTheDocument();
  });
});

describe('SchedulerBoardView — apply behind a confirm', () => {
  it('does not call applySchedule until the confirm dialog is accepted', async () => {
    const { applyAction } = renderBoard();
    fireEvent.click(screen.getByTestId('scheduler-run-button'));
    await screen.findByTestId('scheduler-proposal');

    fireEvent.click(screen.getByTestId('scheduler-apply-button'));
    expect(await screen.findByTestId('scheduler-apply-confirm')).toBeInTheDocument();
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('calls applySchedule(runId) after confirming', async () => {
    const { applyAction } = renderBoard();
    fireEvent.click(screen.getByTestId('scheduler-run-button'));
    await screen.findByTestId('scheduler-proposal');

    fireEvent.click(screen.getByTestId('scheduler-apply-button'));
    fireEvent.click(await screen.findByTestId('scheduler-apply-confirm'));

    await waitFor(() => expect(applyAction).toHaveBeenCalledTimes(1));
    expect(applyAction).toHaveBeenCalledWith(RUN_ID);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces an apply error inline and keeps the proposal', async () => {
    const applyAction = vi.fn(async () => ({ ok: false as const, error: 'not_found' as const }));
    renderBoard({ applyAction });
    fireEvent.click(screen.getByTestId('scheduler-run-button'));
    await screen.findByTestId('scheduler-proposal');

    fireEvent.click(screen.getByTestId('scheduler-apply-button'));
    fireEvent.click(await screen.findByTestId('scheduler-apply-confirm'));

    expect(await screen.findByTestId('scheduler-apply-error')).toHaveTextContent(en.errors.not_found);
    expect(screen.getByTestId('scheduler-proposal')).toBeInTheDocument();
  });
});

describe('i18n — Scheduler locale parity', () => {
  it('defines Scheduler.run/apply/board/errors in all four locales', () => {
    for (const messages of [enMessages, plMessages, roMessages, ukMessages]) {
      const sched = (messages as Record<string, any>).Scheduler;
      expect(sched.run.button).toBeTruthy();
      expect(sched.apply.button).toBeTruthy();
      expect(sched.apply.confirmTitle).toBeTruthy();
      expect(sched.board.totalCost).toBeTruthy();
      expect(sched.errors.persistence_failed).toBeTruthy();
    }
    expect((plMessages as Record<string, any>).Scheduler.run.button).not.toBe(
      (enMessages as Record<string, any>).Scheduler.run.button,
    );
    expect((roMessages as Record<string, any>).Scheduler.run.button).toBe(
      (enMessages as Record<string, any>).Scheduler.run.button,
    );
  });
});
