/**
 * P-L1 — `/production/wos` WO list screen: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/wo-list.jsx:4-106.
 * Tests the presentational <WoListScreen> directly (the page is an async RSC that
 * reads Supabase via withOrgContext and is exercised live/Playwright). Asserts:
 *   - status tabs render with counts + filter the table (parity wo-list.jsx:8-40,17)
 *   - dense table columns + WO-number mono + allergen badge (wo-list.jsx:52-101,73)
 *   - rows link to `/production/wos/<id>` (wo-list.jsx:72 onOpenWo)
 *   - deferred per-row action is DISABLED (out-of-scope mutation slot)
 *   - all UI states surfaced by this component: populated / empty / empty-filtered
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WoListScreen, type WoListLabels } from '../wo-list-screen';
import type { WoListStatus, WorkOrderListItem } from '../../../_actions/list-work-orders';

const LABELS: WoListLabels = {
  title: 'Work orders',
  countLine: '2 orders',
  searchPlaceholder: 'Search WO number or product…',
  rowsLabel: '{count} rows',
  emptyAll: 'No work orders yet — released work orders from Planning appear here.',
  emptyFiltered: 'No work orders match this filter.',
  allergenBadge: 'Allergen',
  deferredActionTitle: 'Wired in the next step',
  pauseAction: 'Pause',
  resumeAction: 'Resume',
  startAction: 'Start',
  viewAction: 'View',
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

function renderScreen(rows = ROWS) {
  // actions=null exercises the read-only path (no live action context): per-row
  // controls fall back to the deferred slot. The wired per-row Start/Pause/Resume
  // is covered by wos/_components/modals/__tests__/wo-actions.test.tsx.
  return render(
    <WoListScreen
      rows={rows}
      statusCounts={STATUS_COUNTS}
      labels={LABELS}
      actions={null}
    />,
  );
}

describe('WoListScreen (parity: wo-list.jsx:4-106)', () => {
  it('renders status tabs with counts (all + the live states)', () => {
    renderScreen();
    expect(screen.getByTestId('wo-tab-all')).toHaveTextContent('All2');
    expect(screen.getByTestId('wo-tab-in_progress')).toHaveTextContent('In progress1');
    expect(screen.getByTestId('wo-tab-planned')).toHaveTextContent('Planned1');
  });

  it('renders the dense table with WO-number link + allergen badge', () => {
    renderScreen();
    const link = screen.getByTestId(`wo-link-${ROWS[0]!.id}`);
    expect(link).toHaveTextContent('WO-2026-0001');
    expect(link).toHaveAttribute('href', `/production/wos/${ROWS[0]!.id}`);
    expect(screen.getByTestId(`wo-allergen-${ROWS[0]!.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`wo-allergen-${ROWS[1]!.id}`)).not.toBeInTheDocument();
  });

  it('shows an accessible progress bar reflecting output/planned', () => {
    renderScreen();
    const bars = screen.getAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuenow', '50');
  });

  it('status tab filters the visible rows', () => {
    renderScreen();
    // Default tab = all → both rows.
    expect(screen.getByTestId(`wo-row-${ROWS[0]!.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`wo-row-${ROWS[1]!.id}`)).toBeInTheDocument();
    // Switch to planned → only the planned WO remains.
    fireEvent.click(screen.getByTestId('wo-tab-planned'));
    expect(screen.queryByTestId(`wo-row-${ROWS[0]!.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`wo-row-${ROWS[1]!.id}`)).toBeInTheDocument();
  });

  it('search filters by WO number', () => {
    renderScreen();
    fireEvent.change(screen.getByTestId('wo-list-search'), { target: { value: '0002' } });
    expect(screen.queryByTestId(`wo-row-${ROWS[0]!.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`wo-row-${ROWS[1]!.id}`)).toBeInTheDocument();
  });

  it('renders the per-row action DISABLED (deferred mutation slot)', () => {
    renderScreen();
    const action = screen.getByTestId('wo-action-in_progress');
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('title', 'Wired in the next step');
    // No "Release WO" control anywhere (Production red-line).
    expect(screen.queryByText(/release wo/i)).not.toBeInTheDocument();
  });

  it('EMPTY (no WOs): shows the empty-all copy, no table', () => {
    renderScreen([]);
    expect(screen.getByTestId('wo-list-empty')).toHaveTextContent(
      'No work orders yet — released work orders from Planning appear here.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('EMPTY-FILTERED: a non-matching search shows the filtered-empty copy', () => {
    renderScreen();
    fireEvent.change(screen.getByTestId('wo-list-search'), { target: { value: 'zzzz-no-match' } });
    expect(screen.getByTestId('wo-list-empty-filtered')).toBeInTheDocument();
    expect(within(screen.getByTestId('wo-list-table-card')).queryByRole('table')).not.toBeInTheDocument();
  });
});
