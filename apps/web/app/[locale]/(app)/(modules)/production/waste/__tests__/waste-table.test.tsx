/**
 * Waste sub-page RTL — prototype parity (new-screens.jsx:174-199) + states.
 * Tests the presentational waste-events table: fixture rows render with category badge
 * + qty, and the empty-state copy shows when there are no rows.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WasteTable, type WasteTableLabels } from '../_components/waste-table';
import type { WasteEventRow } from '../_actions/waste-data';

const LABELS: WasteTableLabels = {
  empty: 'No waste events have been recorded yet.',
  uncategorized: 'Uncategorized',
  col: {
    time: 'Time',
    line: 'Line',
    wo: 'WO',
    category: 'Category',
    qty: 'Qty (kg)',
    operator: 'Operator',
    reason: 'Reason',
  },
  qtyFmt: (kg) => String(kg),
  dateFmt: (iso) => iso,
};

const ROWS: WasteEventRow[] = [
  {
    id: 'w1',
    recordedAt: '2026-06-09T08:00:00Z',
    lineId: 'a1b2c3d4',
    woNumber: 'WO-2026-0041',
    categoryName: 'Trim',
    qtyKg: 12.5,
    operatorName: 'J. Dudek',
    reason: 'Casing tear',
  },
];

describe('Waste events (parity: new-screens.jsx:174-199)', () => {
  it('renders fixture rows with category + qty', () => {
    render(<WasteTable rows={ROWS} labels={LABELS} />);
    const table = screen.getByTestId('production-waste-table');
    expect(within(table).getByText('Trim')).toBeInTheDocument();
    expect(within(table).getByText('12.5')).toBeInTheDocument();
    expect(within(table).getByText('WO-2026-0041')).toBeInTheDocument();
    expect(within(table).getByText('Casing tear')).toBeInTheDocument();
  });

  it('EMPTY state: shows empty copy and no table', () => {
    render(<WasteTable rows={[]} labels={LABELS} />);
    expect(screen.getByTestId('production-waste-empty')).toHaveTextContent(
      'No waste events have been recorded yet.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
