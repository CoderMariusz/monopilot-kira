/**
 * @vitest-environment jsdom
 *
 * F4 / P1-16 — RSC tests for /scheduler/runs, /capacity, /settings.
 * Asserts each route page loads without 404 and renders persisted read data.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_ID = 'a1111111-1111-4111-8111-111111111111';
const LINE_ID = 'b2222222-2222-4222-8222-222222222222';

const listSchedulerRuns = vi.fn();
const getSchedulerRunDetail = vi.fn();
const loadSchedulerCapacity = vi.fn();
const loadSchedulerSettings = vi.fn();

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => {
    const t = Object.assign((key: string) => key, {
      has: () => false,
      raw: (key: string) => key,
    });
    return t;
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@monopilot/ui/PageHeader', () => ({
  PageHeader: ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle?: string;
  }) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock('../_actions/runs-loaders', () => ({
  listSchedulerRuns: (...args: unknown[]) => listSchedulerRuns(...args),
  getSchedulerRunDetail: (...args: unknown[]) => getSchedulerRunDetail(...args),
}));

vi.mock('../../capacity/_actions/capacity-loaders', () => ({
  loadSchedulerCapacity: (...args: unknown[]) => loadSchedulerCapacity(...args),
}));

vi.mock('../../settings/_actions/settings-loaders', () => ({
  loadSchedulerSettings: (...args: unknown[]) => loadSchedulerSettings(...args),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();

  listSchedulerRuns.mockResolvedValue({
    ok: true,
    runs: [
      {
        runId: RUN_ID,
        status: 'completed',
        runType: 'schedule',
        horizonDays: 7,
        lineIds: [LINE_ID],
        lineLabels: ['LINE-01 — Line One'],
        assignmentCount: 1,
        approvedCount: 1,
        draftCount: 0,
        applied: true,
        queuedAt: '2026-07-14T09:00:00.000Z',
        completedAt: '2026-07-14T09:00:02.000Z',
        optimizerVersion: 'v2',
        solveDurationMs: 120,
      },
    ],
  });

  getSchedulerRunDetail.mockResolvedValue({
    ok: true,
    run: {
      runId: RUN_ID,
      status: 'completed',
      runType: 'schedule',
      horizonDays: 7,
      lineIds: [LINE_ID],
      lineLabels: ['LINE-01 — Line One'],
      assignmentCount: 1,
      approvedCount: 1,
      draftCount: 0,
      applied: true,
      queuedAt: '2026-07-14T09:00:00.000Z',
      completedAt: '2026-07-14T09:00:02.000Z',
      optimizerVersion: 'v2',
      solveDurationMs: 120,
    },
    assignments: [
      {
        id: 'asg-1',
        woId: 'c3333333-3333-4333-8333-333333333333',
        woNumber: 'WO-100',
        lineId: LINE_ID,
        lineLabel: 'LINE-01 — Line One',
        status: 'approved',
        sequenceIndex: '1',
        plannedStartAt: '2026-07-15T08:00:00.000Z',
        plannedEndAt: '2026-07-15T12:00:00.000Z',
        changeoverMinutes: '15',
      },
    ],
  });

  loadSchedulerCapacity.mockResolvedValue({
    ok: true,
    horizonDays: 7,
    horizonStart: '2026-07-15T00:00:00.000Z',
    horizonEnd: '2026-07-22T00:00:00.000Z',
    lines: [
      {
        lineId: LINE_ID,
        lineCode: 'LINE-01',
        lineName: 'Line One',
        capacityHoursPerDay: 16,
        days: [
          {
            day: '2026-07-15',
            occupiedHours: 4,
            capacityHours: 16,
            utilisationPct: 25,
            sourceWoHours: 4,
            sourceDraftHours: 0,
          },
        ],
      },
    ],
  });

  loadSchedulerSettings.mockResolvedValue({
    ok: true,
    showingDefaultsOnly: true,
    rows: [
      {
        id: null,
        scope: 'defaults',
        lineId: null,
        lineLabel: null,
        defaultHorizonDays: 7,
        optimizerVersion: 'v2',
        sequencingStrategy: 'allergen_optimized',
        capacityHoursPerDay: null,
        changeoverWeight: '1',
        duedateWeight: '1',
        utilizationWeight: '1',
        respectPmWindows: false,
        allowAlternateRoutings: false,
        isPersisted: false,
      },
    ],
  });
});

describe('/scheduler/runs', () => {
  it('renders persisted runs list (no 404)', async () => {
    const mod = await import('../page');
    const node = await mod.default({
      params: Promise.resolve({ locale: 'en' }),
    });
    render(<>{node}</>);

    expect(screen.getByTestId('scheduler-runs-page')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-section-nav')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-runs-table')).toBeInTheDocument();
    expect(screen.getByTestId(`scheduler-run-row-${RUN_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`scheduler-run-applied-${RUN_ID}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`scheduler-run-assignments-link-${RUN_ID}`),
    ).toHaveAttribute('href', `/en/scheduler/runs/${RUN_ID}`);
  });

  it('renders run assignments detail', async () => {
    const mod = await import('../[runId]/page');
    const node = await mod.default({
      params: Promise.resolve({ locale: 'en', runId: RUN_ID }),
    });
    render(<>{node}</>);

    expect(screen.getByTestId('scheduler-run-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-run-assignments-table')).toBeInTheDocument();
    expect(screen.getByText('WO-100')).toBeInTheDocument();
  });

  it('renders denied without scheduler.run.read', async () => {
    listSchedulerRuns.mockResolvedValue({ ok: false, error: 'forbidden' });
    const mod = await import('../page');
    const node = await mod.default({
      params: Promise.resolve({ locale: 'en' }),
    });
    render(<>{node}</>);
    expect(screen.getByTestId('scheduler-runs-denied')).toBeInTheDocument();
  });
});

describe('/scheduler/capacity', () => {
  it('renders capacity table over WO occupancy (no 404)', async () => {
    const mod = await import('../../capacity/page');
    const node = await mod.default({
      params: Promise.resolve({ locale: 'en' }),
    });
    render(<>{node}</>);

    expect(screen.getByTestId('scheduler-capacity-page')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-capacity-table')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-capacity-line-LINE-01')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-capacity-horizon')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-capacity-cell-LINE-01-2026-07-15')).toHaveTextContent(
      '4h',
    );
  });
});

describe('/scheduler/settings', () => {
  it('renders built-in defaults when no config rows (no 404)', async () => {
    const mod = await import('../../settings/page');
    const node = await mod.default({
      params: Promise.resolve({ locale: 'en' }),
    });
    render(<>{node}</>);

    expect(screen.getByTestId('scheduler-settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-settings-defaults-note')).toBeInTheDocument();
    expect(
      screen.getByTestId('scheduler-settings-row-defaults-default'),
    ).toBeInTheDocument();
    expect(screen.getByText('allergen_optimized')).toBeInTheDocument();
  });

  it('renders persisted config rows when present', async () => {
    loadSchedulerSettings.mockResolvedValue({
      ok: true,
      showingDefaultsOnly: false,
      rows: [
        {
          id: 'cfg-1',
          scope: 'org',
          lineId: null,
          lineLabel: null,
          defaultHorizonDays: 10,
          optimizerVersion: 'v2',
          sequencingStrategy: 'greedy',
          capacityHoursPerDay: '16.00',
          changeoverWeight: '2.0000',
          duedateWeight: '1.0000',
          utilizationWeight: '1.0000',
          respectPmWindows: true,
          allowAlternateRoutings: false,
          isPersisted: true,
        },
      ],
    });

    const mod = await import('../../settings/page');
    const node = await mod.default({
      params: Promise.resolve({ locale: 'en' }),
    });
    render(<>{node}</>);

    expect(screen.getByTestId('scheduler-settings-readonly-note')).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-settings-row-org-default')).toBeInTheDocument();
    expect(screen.getByText('greedy')).toBeInTheDocument();
    expect(screen.getByText('10 days')).toBeInTheDocument();
  });
});
