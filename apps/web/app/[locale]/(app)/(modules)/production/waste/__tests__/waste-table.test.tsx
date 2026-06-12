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
  voidedBadge: 'Voided',
  qtyFmt: (kg) => String(kg),
  dateFmt: (iso) => iso,
  correctionOfFmt: (ref) => `Correction of #${ref}`,
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
    correctionOfId: null,
  },
];

/** Wave R2 — a voided original + its signed counter-entry. */
const CORRECTION_ROWS: WasteEventRow[] = [
  {
    id: 'w2corr0001',
    recordedAt: '2026-06-09T09:05:00Z',
    lineId: 'a1b2c3d4',
    woNumber: 'WO-2026-0041',
    categoryName: 'Trim',
    qtyKg: -4.5,
    operatorName: 'A. Nowak',
    reason: 'entry_error',
    correctionOfId: 'w2orig0001',
  },
  {
    id: 'w2orig0001',
    recordedAt: '2026-06-09T09:00:00Z',
    lineId: 'a1b2c3d4',
    woNumber: 'WO-2026-0041',
    categoryName: 'Trim',
    qtyKg: 4.5,
    operatorName: 'A. Nowak',
    reason: 'duplicate scan',
    correctionOfId: null,
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

  it('renders correction rows distinctly: "Correction of #…" badge on the counter row, Voided badge + strike on the original (C-R2)', () => {
    render(<WasteTable rows={CORRECTION_ROWS} labels={LABELS} />);

    // Counter row carries the correction badge with the original-id prefix.
    expect(screen.getByTestId('production-waste-correction-w2corr0001')).toHaveTextContent(
      'Correction of #w2orig00',
    );

    // The corrected original is marked voided and its qty struck through.
    expect(screen.getByTestId('production-waste-voided-w2orig0001')).toHaveTextContent('Voided');
    const originalRow = screen.getByTestId('production-waste-row-w2orig0001');
    expect(within(originalRow).getByText('4.5')).toHaveClass('line-through');

    // Plain rows get neither badge.
    const counterRow = screen.getByTestId('production-waste-row-w2corr0001');
    expect(within(counterRow).queryByText('Voided')).not.toBeInTheDocument();
  });

  it('EMPTY state: shows empty copy and no table', () => {
    render(<WasteTable rows={[]} labels={LABELS} />);
    expect(screen.getByTestId('production-waste-empty')).toHaveTextContent(
      'No waste events have been recorded yet.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
