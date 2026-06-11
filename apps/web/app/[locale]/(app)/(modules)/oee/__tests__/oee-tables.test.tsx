/**
 * 15-OEE dashboard RTL — prototype parity (oee/dashboard.jsx:120-188 per-line table;
 * "—" for NULL per dashboard.jsx:157) + states.
 * The page is an async RSC reading Supabase via withOrgContext (exercised live); here
 * we test the pure presentational tables: per-line rows render A/P/Q/OEE with honest
 * "—" for NULL components, fallback line label, and both empty states.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OeeLineRow, OeeSnapshotRow } from '../_actions/oee-data';
import {
  OeeLinesTable,
  OeeSnapshotsTable,
  type OeeLinesTableLabels,
  type OeeSnapshotsTableLabels,
} from '../_components/oee-tables';

const LINES_LABELS: OeeLinesTableLabels = {
  title: 'OEE by line — last 7 days',
  empty: 'No snapshots in the last 7 days.',
  unassigned: 'Unassigned',
  col: { line: 'Line', wos: 'WOs', availability: 'A %', performance: 'P %', quality: 'Q %', oee: 'OEE %' },
};

const SNAP_LABELS: OeeSnapshotsTableLabels = {
  title: 'Recent snapshots',
  empty: 'No snapshots recorded yet.',
  unassigned: 'Unassigned',
  col: {
    time: 'Completed',
    line: 'Line',
    shift: 'Shift',
    wo: 'Work order',
    availability: 'A %',
    performance: 'P %',
    quality: 'Q %',
    oee: 'OEE %',
    output: 'Output (kg)',
    downtime: 'Downtime',
    waste: 'Waste (kg)',
  },
  downtimeFmt: (min) => `${min} min`,
  dateFmt: (iso) => iso,
};

const LINE_ROWS: OeeLineRow[] = [
  {
    lineId: 'uuid-1',
    lineCode: 'LINE-01',
    lineName: 'Mixing line',
    woCount: 4,
    avgAvailability: '92.5',
    avgPerformance: '88.0',
    avgQuality: '97.1',
    avgOee: '79.0',
  },
  {
    lineId: 'unassigned',
    lineCode: null,
    lineName: null,
    woCount: 1,
    avgAvailability: '75.0',
    avgPerformance: null, // honest NULL — no standard-time source
    avgQuality: '100.0',
    avgOee: null, // NULL propagation
  },
];

const SNAP_ROWS: OeeSnapshotRow[] = [
  {
    id: '42',
    snapshotMinute: '2026-06-11T10:00:00Z',
    lineId: 'uuid-1',
    lineCode: 'LINE-01',
    shiftId: 'S1',
    woNumber: 'WO-2026-0042',
    availability: '75.0',
    performance: '90.0',
    quality: '90.0',
    oee: '60.8',
    outputKg: '90.000',
    downtimeMin: 30,
    wasteKg: '5.000',
  },
  {
    id: '43',
    snapshotMinute: '2026-06-11T11:00:00Z',
    lineId: 'unassigned',
    lineCode: null,
    shiftId: 'unspecified',
    woNumber: null,
    availability: '68.0',
    performance: null,
    quality: '100.0',
    oee: null,
    outputKg: '90.000',
    downtimeMin: 0,
    wasteKg: '0.000',
  },
];

describe('OeeLinesTable (parity: oee/dashboard.jsx:120-188)', () => {
  it('renders per-line A/P/Q/OEE with honest "—" for NULL components', () => {
    render(<OeeLinesTable rows={LINE_ROWS} labels={LINES_LABELS} />);
    const table = screen.getByTestId('oee-lines-table');
    expect(within(table).getByText('LINE-01')).toBeInTheDocument();
    expect(within(table).getByText('Mixing line')).toBeInTheDocument();
    expect(within(table).getByText('79.0%')).toBeInTheDocument();
    expect(within(table).getByText('92.5%')).toBeInTheDocument();
    // unassigned fallback row + NULL performance/oee render as em-dash
    expect(within(table).getByText('Unassigned')).toBeInTheDocument();
    expect(within(table).getAllByText('—').length).toBe(2); // avgPerformance + avgOee
  });

  it('shows the empty copy when there are no line rows', () => {
    render(<OeeLinesTable rows={[]} labels={LINES_LABELS} />);
    expect(screen.getByTestId('oee-lines-empty')).toHaveTextContent('No snapshots in the last 7 days.');
  });
});

describe('OeeSnapshotsTable (recent list)', () => {
  it('renders snapshot rows with WO number, exact kg text and downtime', () => {
    render(<OeeSnapshotsTable rows={SNAP_ROWS} labels={SNAP_LABELS} />);
    const table = screen.getByTestId('oee-snapshots-table');
    expect(within(table).getByText('WO-2026-0042')).toBeInTheDocument();
    expect(within(table).getByText('60.8%')).toBeInTheDocument();
    expect(within(table).getByText('30 min')).toBeInTheDocument();
    expect(within(table).getAllByText('90.000').length).toBe(2); // exact NUMERIC text passthrough
    expect(within(table).getByText('unspecified')).toBeInTheDocument(); // honest shift fallback
  });

  it('shows the empty copy when there are no snapshots', () => {
    render(<OeeSnapshotsTable rows={[]} labels={SNAP_LABELS} />);
    expect(screen.getByTestId('oee-snapshots-empty')).toHaveTextContent('No snapshots recorded yet.');
  });
});
