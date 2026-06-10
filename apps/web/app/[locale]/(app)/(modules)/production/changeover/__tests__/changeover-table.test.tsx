/**
 * Changeover sub-page RTL — prototype parity (other-screens.jsx:298-397) + states.
 * Tests the presentational changeover table: fixture rows render the allergen-risk badge
 * + sign-off status; empty-state copy shows when there are no rows.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChangeoverTable, type ChangeoverTableLabels } from '../_components/changeover-table';
import type { ChangeoverEventRow, SignOffStatus } from '../_actions/changeover-data';
import type { BadgeVariant } from '@monopilot/ui/Badge';

const SIGN_OFF_LABEL: Record<string, string> = {
  pending: 'Pending',
  first_signed: 'First signed',
  completed: 'Completed',
};

const LABELS: ChangeoverTableLabels = {
  empty: 'No changeover events have been recorded yet.',
  none: 'None',
  col: {
    started: 'Started',
    line: 'Line',
    transition: 'From → To',
    allergens: 'Allergens',
    risk: 'Risk',
    signOff: 'Sign-off',
  },
  risk: { low: 'Low', medium: 'Medium', high: 'High', segregated: 'Segregated' },
  signOff: (s: SignOffStatus) => SIGN_OFF_LABEL[s] ?? s,
  signOffVariant: (s: SignOffStatus): BadgeVariant =>
    s === 'completed' ? 'success' : s === 'first_signed' ? 'warning' : 'muted',
  dateFmt: (iso) => iso,
};

const ROWS: ChangeoverEventRow[] = [
  {
    id: 'c1',
    lineId: 'LINE-04',
    woFromNumber: 'WO-2026-0041',
    woToNumber: 'WO-2026-0046',
    allergenFrom: [],
    allergenTo: ['gluten', 'celery'],
    riskLevel: 'medium',
    startedAt: '2026-06-09T08:00:00Z',
    completedAt: null,
    cleaningCompleted: false,
    atpRequired: true,
    signOffStatus: 'pending',
    isOpen: true,
  },
];

describe('Changeover events (parity: other-screens.jsx:298-397)', () => {
  it('renders fixture rows with the allergen-risk badge and sign-off status', () => {
    render(<ChangeoverTable rows={ROWS} labels={LABELS} />);
    expect(screen.getByTestId('production-changeover-risk-c1')).toHaveTextContent('Medium');
    expect(screen.getByTestId('production-changeover-signoff-c1')).toHaveTextContent('Pending');
    const table = screen.getByTestId('production-changeover-table');
    expect(within(table).getByText('gluten')).toBeInTheDocument();
    expect(within(table).getByText('celery')).toBeInTheDocument();
    expect(within(table).getByText('WO-2026-0041 → WO-2026-0046')).toBeInTheDocument();
  });

  it('EMPTY state: shows empty copy and no table', () => {
    render(<ChangeoverTable rows={[]} labels={LABELS} />);
    expect(screen.getByTestId('production-changeover-empty')).toHaveTextContent(
      'No changeover events have been recorded yet.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
