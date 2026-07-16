/**
 * W8 — /planning/schedule RTL tests: lanes render per line, conflict highlight
 * on overlapping bars (one line), unscheduled side list, and the reschedule
 * modal builds the exact rescheduleWorkOrder payload. Prototype:
 * prototypes/design/Monopilot Design System/planning/gantt.jsx:1-160.
 *
 * i18n guard: Planning.schedule defined in all four locales (en/pl real,
 * ro/uk = EN mirror).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../../../i18n/en.json';
import plMessages from '../../../../../../../i18n/pl.json';
import roMessages from '../../../../../../../i18n/ro.json';
import ukMessages from '../../../../../../../i18n/uk.json';

import { ScheduleBoardView, type ScheduleBoardLabels } from '../_components/schedule-board-view';
import type { ScheduleBoardData, ScheduleBoardWo } from '../_lib/board';
import type { RescheduleWorkOrderResult } from '../_actions/schedule-board';
import { normalizePage, toPaginatedResult } from '../../../../../../../lib/shared/pagination';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const en = (enMessages as Record<string, any>).Planning.schedule;
const enStatus = (enMessages as Record<string, any>).Planning.woStatus;

const labels: ScheduleBoardLabels = {
  linesCol: en.board.linesCol,
  noLine: en.board.noLine,
  emptyLines: en.board.emptyLines,
  emptyScheduled: en.board.emptyScheduled,
  legendConflict: en.legend.conflict,
  legendOpenEnd: en.legend.openEnd,
  status: {
    draft: enStatus.draft,
    released: enStatus.released,
    in_progress: enStatus.in_progress,
  },
  unscheduledTitle: en.unscheduled.title,
  unscheduledEmpty: en.unscheduled.empty,
  scheduleCta: en.unscheduled.cta,
  unscheduledPagination: en.unscheduled.pagination,
  modal: { ...en.modal, errors: en.modal.errors },
};

const LINE_1 = '55555555-5555-4555-8555-555555555555';
const LINE_2 = '66666666-6666-4666-8666-666666666666';
const WINDOW_START = '2026-06-11T00:00:00.000Z';
const WINDOW_END = '2026-06-18T00:00:00.000Z';

function wo(over: Partial<ScheduleBoardWo> & { id: string; woNumber: string }): ScheduleBoardWo {
  return {
    itemCode: 'FG-NPD-004',
    itemName: 'Meat Box',
    status: 'DRAFT',
    priority: 'normal',
    productionLineId: LINE_1,
    scheduledStart: '2026-06-12T08:00:00.000Z',
    scheduledEnd: '2026-06-12T16:00:00.000Z',
    plannedQuantity: '1000.000',
    uom: 'kg',
    ...over,
  };
}

function makeData(over: Partial<ScheduleBoardData> = {}): ScheduleBoardData {
  const unscheduled = over.unscheduled ?? [
    wo({
      id: 'd0000000-0000-4000-8000-00000000000d',
      woNumber: 'WO-U',
      productionLineId: null,
      scheduledStart: null,
      scheduledEnd: null,
    }),
  ];
  const unscheduledPagination =
    over.unscheduledPagination ??
    ({
      items: unscheduled,
      total: unscheduled.length,
      page: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    } as ScheduleBoardData['unscheduledPagination']);

  return {
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    siteTimezone: 'UTC',
    lines: [
      { id: LINE_1, code: 'LINE-01', name: 'Line One' },
      { id: LINE_2, code: 'LINE-02', name: 'Line Two' },
    ],
    scheduled: [
      wo({ id: 'a0000000-0000-4000-8000-00000000000a', woNumber: 'WO-A' }),
      wo({
        id: 'b0000000-0000-4000-8000-00000000000b',
        woNumber: 'WO-B',
        status: 'RELEASED',
        scheduledStart: '2026-06-12T12:00:00.000Z',
        scheduledEnd: '2026-06-12T20:00:00.000Z',
      }),
      wo({
        id: 'c0000000-0000-4000-8000-00000000000c',
        woNumber: 'WO-C',
        productionLineId: LINE_2,
        scheduledStart: '2026-06-13T06:00:00.000Z',
        scheduledEnd: '2026-06-13T14:00:00.000Z',
      }),
    ],
    capacityBlocks: [],
    lineDayUtilization: [],
    ...over,
    unscheduled,
    unscheduledPagination,
  };
}

function renderBoard(
  data: ScheduleBoardData = makeData(),
  action: (params: any) => Promise<RescheduleWorkOrderResult> = vi.fn(async () => ({
    ok: true,
    workOrder: data.scheduled[0] as ScheduleBoardWo,
  })),
) {
  render(<ScheduleBoardView data={data} labels={labels} locale="en" rescheduleAction={action} />);
  return action;
}

beforeEach(() => {
  refresh.mockClear();
});

describe('ScheduleBoardView — board rendering', () => {
  it('renders one lane per production line with code + name', () => {
    renderBoard();

    expect(screen.getByTestId('schedule-lane-LINE-01')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-lane-LINE-02')).toBeInTheDocument();
    expect(screen.getByText('Line One')).toBeInTheDocument();
    expect(screen.getByText('Line Two')).toBeInTheDocument();
  });

  it('places WO bars in their line lane', () => {
    renderBoard();

    const laneOne = within(screen.getByTestId('schedule-lane-LINE-01'));
    expect(laneOne.getByTestId('schedule-bar-WO-A')).toBeInTheDocument();
    expect(laneOne.getByTestId('schedule-bar-WO-B')).toBeInTheDocument();
    const laneTwo = within(screen.getByTestId('schedule-lane-LINE-02'));
    expect(laneTwo.getByTestId('schedule-bar-WO-C')).toBeInTheDocument();
  });

  it('highlights overlapping bars on one line as conflicts, others not', () => {
    renderBoard();

    expect(screen.getByTestId('schedule-bar-WO-A')).toHaveAttribute('data-conflict', 'true');
    expect(screen.getByTestId('schedule-bar-WO-B')).toHaveAttribute('data-conflict', 'true');
    expect(screen.getByTestId('schedule-bar-WO-C')).toHaveAttribute('data-conflict', 'false');
  });

  it('renders a "no line" lane only when a scheduled WO lacks a line', () => {
    renderBoard();
    expect(screen.queryByTestId(`schedule-lane-${en.board.noLine}`)).not.toBeInTheDocument();
  });

  it('renders the no-line lane when a scheduled WO has no production line', () => {
    const data = makeData();
    data.scheduled.push(
      wo({ id: 'e0000000-0000-4000-8000-00000000000e', woNumber: 'WO-NL', productionLineId: null }),
    );
    renderBoard(data);

    const noLane = within(screen.getByTestId(`schedule-lane-${en.board.noLine}`));
    expect(noLane.getByTestId('schedule-bar-WO-NL')).toBeInTheDocument();
  });

  it('lists unscheduled WOs in the side list; Schedule CTA only for RELEASED', () => {
    renderBoard();

    const row = within(screen.getByTestId('schedule-unscheduled-WO-U'));
    expect(row.getByText('WO-U')).toBeInTheDocument();
    expect(row.queryByRole('button', { name: en.unscheduled.cta })).not.toBeInTheDocument();
  });

  it('does not open the reschedule modal for IN_PROGRESS bars', () => {
    const data = makeData();
    data.scheduled.push(
      wo({
        id: 'f0000000-0000-4000-8000-00000000000f',
        woNumber: 'WO-IP',
        status: 'IN_PROGRESS',
        scheduledStart: '2026-06-14T08:00:00.000Z',
        scheduledEnd: '2026-06-14T16:00:00.000Z',
      }),
    );
    renderBoard(data);

    const bar = screen.getByTestId('schedule-bar-WO-IP');
    expect(bar).toHaveAttribute('data-reschedulable', 'false');
    fireEvent.click(bar);
    expect(screen.queryByTestId('reschedule-save')).not.toBeInTheDocument();
  });

  it('shows the empty copy when there are no scheduled WOs', () => {
    renderBoard(makeData({ scheduled: [] }));
    expect(screen.getByTestId('schedule-empty-scheduled')).toHaveTextContent(en.board.emptyScheduled);
  });
});

describe('ScheduleBoardView — reschedule modal', () => {
  it('opens on RELEASED bar click prefilled and submits the exact payload (line kept)', async () => {
    const action = vi.fn(async () => ({
      ok: true as const,
      workOrder: wo({ id: 'b0000000-0000-4000-8000-00000000000b', woNumber: 'WO-B', status: 'RELEASED' }),
    }));
    renderBoard(makeData(), action);

    fireEvent.click(screen.getByTestId('schedule-bar-WO-B'));
    expect(await screen.findByTestId('reschedule-save')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('reschedule-start'), { target: { value: '2026-06-13T09:30' } });
    fireEvent.change(screen.getByTestId('reschedule-end'), { target: { value: '2026-06-13T17:30' } });
    fireEvent.click(screen.getByTestId('reschedule-save'));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith({
      woId: 'b0000000-0000-4000-8000-00000000000b',
      lineId: LINE_1,
      scheduledStart: '2026-06-13T09:30:00.000Z',
      scheduledEnd: '2026-06-13T17:30:00.000Z',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('opens from the unscheduled list for RELEASED WOs only', async () => {
    const action = vi.fn(async () => ({
      ok: true as const,
      workOrder: wo({
        id: 'e0000000-0000-4000-8000-00000000000e',
        woNumber: 'WO-R',
        status: 'RELEASED',
      }),
    }));
    const data = makeData({
      unscheduled: [
        wo({
          id: 'e0000000-0000-4000-8000-00000000000e',
          woNumber: 'WO-R',
          status: 'RELEASED',
          productionLineId: null,
          scheduledStart: null,
          scheduledEnd: null,
        }),
      ],
    });
    renderBoard(data, action);

    fireEvent.click(
      within(screen.getByTestId('schedule-unscheduled-WO-R')).getByRole('button', { name: en.unscheduled.cta }),
    );
    fireEvent.change(await screen.findByTestId('reschedule-start'), { target: { value: '2026-06-14T06:00' } });
    fireEvent.change(screen.getByTestId('reschedule-end'), { target: { value: '2026-06-14T14:00' } });
    fireEvent.click(screen.getByTestId('reschedule-save'));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith({
      woId: 'e0000000-0000-4000-8000-00000000000e',
      scheduledStart: '2026-06-14T06:00:00.000Z',
      scheduledEnd: '2026-06-14T14:00:00.000Z',
    });
  });

  it('prefills modal inputs and detail line with the same site-timezone civil time', async () => {
    const iso = '2026-06-12T08:00:00.000Z';
    const data = makeData({
      siteTimezone: 'Europe/London',
      scheduled: [
        wo({
          id: 'b0000000-0000-4000-8000-00000000000b',
          woNumber: 'WO-B',
          status: 'RELEASED',
          scheduledStart: iso,
          scheduledEnd: '2026-06-12T16:00:00.000Z',
        }),
      ],
      unscheduled: [],
    });
    renderBoard(data);

    fireEvent.click(screen.getByTestId('schedule-bar-WO-B'));
    expect(await screen.findByTestId('reschedule-start')).toHaveValue('2026-06-12T09:00');
    expect(screen.getByTestId('reschedule-current-times')).toHaveTextContent('09:00');
  });

  it('surfaces action errors inline (invalid_range) and stays open', async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: 'invalid_range' as const }));
    renderBoard(makeData(), action);

    fireEvent.click(screen.getByTestId('schedule-bar-WO-B'));
    fireEvent.change(await screen.findByTestId('reschedule-start'), { target: { value: '2026-06-13T17:30' } });
    fireEvent.change(screen.getByTestId('reschedule-end'), { target: { value: '2026-06-13T09:30' } });
    fireEvent.click(screen.getByTestId('reschedule-save'));

    expect(await screen.findByTestId('reschedule-error')).toHaveTextContent(en.modal.errors.invalid_range);
    expect(screen.getByTestId('reschedule-save')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('blocks submit with empty datetime inputs (invalid_input, no action call)', async () => {
    const action = vi.fn();
    const data = makeData({
      unscheduled: [
        wo({
          id: 'e0000000-0000-4000-8000-00000000000e',
          woNumber: 'WO-R',
          status: 'RELEASED',
          productionLineId: null,
          scheduledStart: null,
          scheduledEnd: null,
        }),
      ],
    });
    renderBoard(data, action as any);

    fireEvent.click(
      within(screen.getByTestId('schedule-unscheduled-WO-R')).getByRole('button', { name: en.unscheduled.cta }),
    );
    fireEvent.click(await screen.findByTestId('reschedule-save'));

    expect(await screen.findByTestId('reschedule-error')).toHaveTextContent(en.modal.errors.invalid_input);
    expect(action).not.toHaveBeenCalled();
  });
});

describe('i18n — Planning.schedule locale parity', () => {
  it('defines Planning.schedule + nav.schedule + runSequencingHint in all four locales', () => {
    for (const messages of [enMessages, plMessages, roMessages, ukMessages]) {
      const planning = (messages as Record<string, any>).Planning;
      expect(planning.schedule.title).toBeTruthy();
      expect(planning.schedule.modal.errors.dependency_cycle).toBeTruthy();
      expect(planning.nav.schedule.title).toBeTruthy();
      expect(planning.actions.runSequencingHint).toBeTruthy();
    }
    // pl is a real translation, ro/uk mirror EN (i18n-two-locales rule).
    expect((plMessages as Record<string, any>).Planning.schedule.title).not.toBe(
      (enMessages as Record<string, any>).Planning.schedule.title,
    );
    expect((roMessages as Record<string, any>).Planning.schedule.title).toBe(
      (enMessages as Record<string, any>).Planning.schedule.title,
    );
  });
});
