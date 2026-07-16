/**
 * Downtime sub-page RTL — prototype parity (other-screens.jsx:186-211) + states.
 * The page is an async RSC reading Supabase via withOrgContext (exercised live); here
 * we test the pure presentational table: fixture rows render with category + source
 * badges + open badge, and the empty-state copy shows when there are no rows.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DowntimeTable, type DowntimeTableLabels } from '../_components/downtime-table';
import type { DowntimeEventRow } from '../_actions/downtime-data';

const LABELS: DowntimeTableLabels = {
  title: 'Event log',
  empty: 'No downtime events have been recorded yet.',
  open: 'Open',
  uncategorized: 'Uncategorized',
  col: {
    started: 'Started',
    line: 'Line',
    shift: 'Shift',
    wo: 'Linked WO',
    category: 'Category',
    reason: 'Reason',
    operator: 'Operator',
    duration: 'Duration',
    source: 'Source',
  },
  kind: { planned: 'Planned', unplanned: 'Unplanned', changeover: 'Changeover' },
  source: { manual: 'Manual', wo_pause: 'Auto (WO pause)', plc_auto: 'PLC auto', changeover: 'Changeover' },
  durationFmt: (min) => `${min} min`,
  dateFmt: (iso) => iso,
};

const ROWS: DowntimeEventRow[] = [
  {
    id: 'd1',
    startedAt: '2026-06-09T08:00:00Z',
    endedAt: '2026-06-09T08:30:00Z',
    lineLabel: 'LINE-02 — Packing line 2',
    shiftLabel: 'AM Shift',
    woNumber: 'WO-2026-0041',
    categoryName: 'Breakdown',
    categoryKind: 'unplanned',
    reasonNotes: 'Mixer auger',
    operatorName: 'M. Szymczak',
    durationMin: 30,
    source: 'manual',
    isOpen: false,
  },
  {
    id: 'd2',
    startedAt: '2026-06-09T09:00:00Z',
    endedAt: null,
    lineLabel: 'LINE-04',
    shiftLabel: null,
    woNumber: null,
    categoryName: 'Changeover',
    categoryKind: 'changeover',
    reasonNotes: null,
    operatorName: null,
    durationMin: null,
    source: 'wo_pause',
    isOpen: true,
  },
];

describe('Downtime event log (parity: other-screens.jsx:186-211)', () => {
  it('renders fixture rows with category + source labels', () => {
    render(<DowntimeTable rows={ROWS} labels={LABELS} />);
    const table = screen.getByTestId('production-downtime-table');
    expect(within(table).getByText('LINE-02 — Packing line 2')).toBeInTheDocument();
    expect(within(table).getByText('AM Shift')).toBeInTheDocument();
    expect(within(table).queryByText('948c099f-8054-49ae-99a1-dd5bb9410cd4')).not.toBeInTheDocument();
    expect(within(table).getByText('Breakdown')).toBeInTheDocument();
    expect(within(table).getByText('WO-2026-0041')).toBeInTheDocument();
    expect(within(table).getByText('Auto (WO pause)')).toBeInTheDocument();
  });

  it('marks an open event (ended_at null) with the Open badge instead of a duration', () => {
    render(<DowntimeTable rows={ROWS} labels={LABELS} />);
    expect(screen.getByTestId('production-downtime-open-d2')).toHaveTextContent('Open');
    expect(screen.getByText('30 min')).toBeInTheDocument();
  });

  it('EMPTY state: shows empty copy and no table', () => {
    render(<DowntimeTable rows={[]} labels={LABELS} />);
    expect(screen.getByTestId('production-downtime-empty')).toHaveTextContent(
      'No downtime events have been recorded yet.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
