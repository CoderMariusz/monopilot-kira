/**
 * P-L1 — `/production/wos` WO list screen: RTL parity + state tests.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { WoListScreen, type WoListLabels } from '../wo-list-screen';
import type { WoListStatus, WorkOrderListItem } from '../../../_actions/list-work-orders';

const downloadCsvMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock('../../../../../../../../lib/shared/download', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../../../lib/shared/download')>(
    '../../../../../../../../lib/shared/download',
  );
  return {
    ...actual,
    downloadCsv: downloadCsvMock,
    isoDateStamp: () => '2026-06-26',
  };
});

const LABELS: WoListLabels = {
  title: 'Work orders',
  countLine: '{count} orders',
  searchPlaceholder: 'Search WO number or product…',
  rowsLabel: '{count} rows',
  emptyAll: 'No work orders yet — released work orders from Planning appear here.',
  emptyFiltered: 'No work orders match this filter.',
  allergenBadge: 'Allergen',
  overProductionListBadge: 'Over-prod',
  deferredActionTitle: 'Wired in the next step',
  pauseAction: 'Pause',
  resumeAction: 'Resume',
  startAction: 'Start',
  viewAction: 'View',
  pagination: {
    showing: 'Showing {shown} of {total}',
    previous: 'Previous',
    next: 'Next',
  },
  tab: {
    all: 'All',
    in_progress: 'In progress',
    paused: 'Paused',
    planned: 'Planned',
    completed: 'Completed',
    closed: 'Closed',
    cancelled: 'Cancelled',
  } as Record<'all' | WoListStatus, string>,
  status: {
    planned: 'Planned',
    in_progress: 'In progress',
    paused: 'Paused',
    completed: 'Completed',
    closed: 'Closed',
    cancelled: 'Cancelled',
  },
  col: {
    wo: 'WO',
    product: 'Product',
    line: 'Line',
    status: 'Status',
    planned: 'Planned',
    progress: 'Progress',
    output: 'Output',
    schedule: 'Start / end',
    actions: '',
  },
};

const ROWS: WorkOrderListItem[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    woNumber: 'WO-2026-0001',
    productId: 'aaaaaaaa-1111-1111-1111-111111111111',
    itemCode: 'FG-TEST-01',
    productName: 'Test Product A',
    lineCode: 'LINE-1',
    status: 'in_progress',
    lineId: 'bbbbbbbb-2222-2222-2222-222222222222',
    plannedQty: 1200,
    uom: 'kg',
    outputKg: 600,
    progressPct: 50,
    allergenGate: true,
    overProductionFlagged: true,
    scheduledStart: '2026-06-10T06:00:00.000Z',
    scheduledEnd: '2026-06-10T14:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    woNumber: 'WO-2026-0002',
    productId: 'cccccccc-3333-3333-3333-333333333333',
    itemCode: null,
    productName: null,
    lineCode: null,
    status: 'planned',
    lineId: null,
    plannedQty: 800,
    uom: 'kg',
    outputKg: null,
    progressPct: null,
    allergenGate: false,
    overProductionFlagged: false,
    scheduledStart: null,
    scheduledEnd: null,
  },
];

const STATUS_COUNTS: Record<WoListStatus, number> = {
  planned: 1,
  in_progress: 1,
  paused: 0,
  completed: 0,
  closed: 0,
  cancelled: 0,
};

const DEFAULT_PAGINATION = {
  items: ROWS,
  total: 2,
  page: 1,
  limit: 50,
  offset: 0,
  hasMore: false,
};

function renderScreen(
  rows = ROWS,
  opts?: {
    filters?: { status?: string; search?: string };
    pagination?: typeof DEFAULT_PAGINATION;
    statusCounts?: Record<WoListStatus, number>;
  },
) {
  return render(
    <WoListScreen
      rows={rows}
      statusCounts={opts?.statusCounts ?? STATUS_COUNTS}
      pagination={opts?.pagination ?? { ...DEFAULT_PAGINATION, items: rows, total: rows.length }}
      filters={{ status: opts?.filters?.status ?? '', search: opts?.filters?.search ?? '' }}
      labels={LABELS}
      locale="en"
      actions={null}
    />,
  );
}

describe('WoListScreen (parity: wo-list.jsx:4-106)', () => {
  beforeEach(() => {
    downloadCsvMock.mockClear();
    pushMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders status tabs with server-side counts', () => {
    renderScreen();
    expect(screen.getByTestId('wo-tab-all')).toHaveTextContent('All2');
    expect(screen.getByTestId('wo-tab-in_progress')).toHaveTextContent('In progress1');
    expect(screen.getByTestId('wo-tab-planned')).toHaveTextContent('Planned1');
  });

  it('renders the dense table with WO-number link + allergen badge', () => {
    renderScreen();
    const link = screen.getByTestId(`wo-link-${ROWS[0]!.id}`);
    expect(link).toHaveTextContent('WO-2026-0001');
    expect(link).toHaveAttribute('href', `/en/production/wos/${ROWS[0]!.id}`);
    expect(screen.getByTestId(`wo-allergen-${ROWS[0]!.id}`)).toBeInTheDocument();
  });

  it('navigates to the planned tab via router.push', () => {
    renderScreen();
    fireEvent.click(screen.getByTestId('wo-tab-planned'));
    expect(pushMock).toHaveBeenCalledWith('/en/production/wos?status=planned');
  });

  it('debounces search into the URL query string', () => {
    renderScreen();
    fireEvent.change(screen.getByTestId('wo-list-search'), { target: { value: '0002' } });
    vi.advanceTimersByTime(300);
    expect(pushMock).toHaveBeenCalledWith('/en/production/wos?q=0002');
  });

  it('exports the server-loaded rows to CSV', () => {
    renderScreen([ROWS[0]!], { filters: { search: '0001' }, pagination: { ...DEFAULT_PAGINATION, items: [ROWS[0]!], total: 1 } });
    fireEvent.click(screen.getByTestId('wo-list-export-csv'));
    expect(downloadCsvMock).toHaveBeenCalledTimes(1);
  });

  it('EMPTY (no WOs): shows the empty-all copy, no table', () => {
    renderScreen([], { pagination: { ...DEFAULT_PAGINATION, items: [], total: 0 } });
    expect(screen.getByTestId('wo-list-empty')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('EMPTY-FILTERED: zero rows with active filters shows filtered-empty copy', () => {
    renderScreen([], {
      filters: { search: 'zzzz-no-match' },
      pagination: { ...DEFAULT_PAGINATION, items: [], total: 0 },
    });
    expect(screen.getByTestId('wo-list-empty-filtered')).toBeInTheDocument();
    expect(within(screen.getByTestId('wo-list-table-card')).queryByRole('table')).not.toBeInTheDocument();
  });
});
