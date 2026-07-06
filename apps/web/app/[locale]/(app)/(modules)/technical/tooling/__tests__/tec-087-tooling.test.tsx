/**
 * @vitest-environment jsdom
 *
 * T-053 — TEC-087 Tooling / Equipment Setup List: RTL parity + interaction tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:314-352 (`tooling_screen`). Asserts the structural parity of
 * the list (search, Create CTA, the column set) plus the interaction parity
 * (search filters rows) and the permission gate (Create CTA hidden without write
 * permission). The owning page is an async RSC reading Supabase via
 * withOrgContext, so it is exercised live; here we test the presentational client
 * island that composes it.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ToolingList, type ToolingListLabels } from '../_components/tooling-list.client';
import type { ToolingSetupRow } from '../_actions/shared';

afterEach(cleanup);

const LABELS: ToolingListLabels = {
  searchPlaceholder: 'Search setups',
  createCta: 'New setup',
  colCode: 'Code',
  colName: 'Name',
  colType: 'Type',
  colResource: 'Resource',
  colItem: 'Item',
  colSetup: 'Setup',
  colCostPerHour: 'Cost / hr',
  colUpdated: 'Updated',
  colStatus: 'Status',
  noMatches: 'No setups match',
  typeLine: 'Line',
  setupUnit: 'min',
};

const SETUPS: ToolingSetupRow[] = [
  {
    id: '1',
    opCode: 'OP-10',
    opName: 'Mixing setup',
    manufacturingOperationName: 'Mixing',
    setupTimeMin: 15,
    costPerHour: '42.5000',
    resourceKind: 'line',
    resourceCode: 'LN-A',
    resourceName: 'Line A',
    itemCode: 'FG5101',
    itemName: 'Sausage 450g',
    routingVersion: 2,
    routingStatus: 'active',
    updatedAt: '2026-04-19T14:22:00.000Z',
  },
  {
    id: '2',
    opCode: 'OP-20',
    opName: 'Smoking setup',
    manufacturingOperationName: 'Smoking',
    setupTimeMin: 30,
    costPerHour: null,
    resourceKind: 'line',
    resourceCode: 'LN-B',
    resourceName: 'Line B',
    itemCode: 'FG5210',
    itemName: 'Ham slices',
    routingVersion: 1,
    routingStatus: 'draft',
    updatedAt: '2026-04-15T16:08:00.000Z',
  },
];

describe('TEC-087 Tooling list (parity: other-screens.jsx:314-352)', () => {
  it('renders the prototype column set and a row per setup', () => {
    render(<ToolingList setups={SETUPS} canWrite routingsHref="../routings" labels={LABELS} />);

    const table = screen.getByRole('table', { name: 'Tooling and equipment setups' });
    ['Code', 'Name', 'Type', 'Resource', 'Item', 'Setup', 'Cost / hr', 'Updated', 'Status'].forEach((col) => {
      expect(within(table).getByText(col)).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('tooling-row')).toHaveLength(2);
    expect(screen.getByText('42.5000')).toBeInTheDocument();
    expect(screen.getAllByText('Line')).toHaveLength(2);
  });

  it('shows the Create CTA when the caller has write permission', () => {
    render(<ToolingList setups={SETUPS} canWrite routingsHref="../routings" labels={LABELS} />);
    const cta = screen.getByTestId('tooling-create-cta');
    expect(cta).toHaveTextContent('New setup');
    expect(cta).toHaveAttribute('href', '../routings');
  });

  it('hides the Create CTA when the caller lacks write permission (RBAC gate)', () => {
    render(<ToolingList setups={SETUPS} canWrite={false} routingsHref="../routings" labels={LABELS} />);
    expect(screen.queryByTestId('tooling-create-cta')).not.toBeInTheDocument();
  });

  it('filters rows by the search query', () => {
    render(<ToolingList setups={SETUPS} canWrite routingsHref="../routings" labels={LABELS} />);
    fireEvent.change(screen.getByTestId('tooling-search'), { target: { value: 'smoking' } });
    const rows = screen.getAllByTestId('tooling-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('OP-20');
  });

  it('shows the empty-match copy when nothing matches the search', () => {
    render(<ToolingList setups={SETUPS} canWrite routingsHref="../routings" labels={LABELS} />);
    fireEvent.change(screen.getByTestId('tooling-search'), { target: { value: 'zzz-no-match' } });
    expect(screen.queryAllByTestId('tooling-row')).toHaveLength(0);
    expect(screen.getByText('No setups match')).toBeInTheDocument();
  });
});
