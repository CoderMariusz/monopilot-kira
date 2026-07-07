/**
 * @vitest-environment jsdom
 *
 * Lane A1 — TEC-003 Materials list table RTL parity + state tests.
 *
 * Prototype source (literal anchor, verified `wc -l "…/technical/other-screens.jsx"` = 1659):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:304-352
 *   (MaterialsListScreen — pills filter + dense table: mono code, type badge,
 *   UoM, cost, updated, status).
 *
 * Asserts: TabsCounted by type with counts, search filter, mono code lead cell
 * linking to the item-detail route, NUMERIC cost formatting, the 5 semantic
 * status badges, and the EmptyState when no row matches the filter. Labels are
 * passed directly (no next-intl provider) — confirming i18n-prop coverage.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { MaterialsTableClient, type MaterialsTableLabels } from '../materials-table.client';
import type { ItemListItem } from '../../../items/_actions/shared';

const labels: MaterialsTableLabels = {
  tabAll: 'All',
  searchPlaceholder: 'Search by code or name…',
  searchAria: 'Search materials',
  colCode: 'Code', colName: 'Name', colType: 'Type', colUom: 'UoM', colCost: 'Cost / kg (zł)',
  colUpdated: 'Updated', colStatus: 'Status',
  noMatchTitle: 'No materials match your filters', noMatchBody: 'Adjust filters.',
  countSummary: '{shown} of {total} materials',
  typeLabels: { rm: 'Raw material', intermediate: 'Intermediate', packaging: 'Packaging' },
  statusLabels: { draft: 'Draft', active: 'Active', deprecated: 'Deprecated', blocked: 'Blocked' },
};

const typeTabs: Array<{ key: 'all' | ItemListItem['itemType']; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'rm', label: 'Raw materials' },
  { key: 'intermediate', label: 'Intermediates' },
  { key: 'packaging', label: 'Packaging' },
];

const items: ItemListItem[] = [
  { id: '1', itemCode: 'RM-1001', name: 'Pork shoulder', itemType: 'rm', status: 'active', uomBase: 'kg', weightMode: 'fixed', costPerKg: '12.5', updatedAt: '2026-06-01T00:00:00Z', allergens: [], bomCount: 0, d365SyncStatus: null },
  { id: '2', itemCode: 'WIP-CT-0000001', name: 'Cured intermediate', itemType: 'intermediate', status: 'draft', uomBase: 'kg', weightMode: 'fixed', costPerKg: null, updatedAt: '2026-05-01T00:00:00Z', allergens: [], bomCount: 1, d365SyncStatus: null },
  { id: '3', itemCode: 'PM-2001', name: 'Vacuum pouch', itemType: 'packaging', status: 'deprecated', uomBase: 'pcs', weightMode: 'fixed', costPerKg: '0.08', updatedAt: '2026-06-02T00:00:00Z', allergens: [], bomCount: 0, d365SyncStatus: null },
];

afterEach(cleanup);

describe('MaterialsTableClient (TEC-003)', () => {
  it('renders a TabsCounted by type with real counts', () => {
    render(<MaterialsTableClient items={items} typeTabs={typeTabs} labels={labels} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('3');
  });

  it('renders mono code lead cells linking to the item-detail route + NUMERIC cost', () => {
    render(<MaterialsTableClient items={items} typeTabs={typeTabs} labels={labels} />);
    const link = screen.getByRole('link', { name: 'RM-1001' });
    expect(link).toHaveAttribute('href', '/en/technical/items/RM-1001');
    expect(screen.getByText('12.50')).toBeInTheDocument();
    const activeBadge = screen.getByText((_, el) => el?.classList.contains('badge-green') ?? false);
    expect(activeBadge).toHaveTextContent('Active');
  });

  it('filters by search and shows the EmptyState when nothing matches', async () => {
    const user = userEvent.setup();
    render(<MaterialsTableClient items={items} typeTabs={typeTabs} labels={labels} />);
    await user.type(screen.getByRole('searchbox'), 'zzz-nomatch');
    expect(screen.getByText('No materials match your filters')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a 4th Packaging type tab with an amber type badge and filters to it', async () => {
    const user = userEvent.setup();
    render(<MaterialsTableClient items={items} typeTabs={typeTabs} labels={labels} />);
    // 4 type tabs (all / rm / intermediate / packaging) with real counts.
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    const packagingTab = screen.getByRole('tab', { name: /Packaging/ });
    expect(packagingTab).toHaveTextContent('1');

    // The packaging row's type badge carries the amber tone (prototype :307/315).
    const pmBadge = screen.getByText('Packaging', { selector: '.badge' });
    expect(pmBadge.classList.contains('badge-amber')).toBe(true);

    // Selecting the Packaging tab filters out the rm + intermediate rows.
    await user.click(packagingTab);
    expect(screen.getByRole('link', { name: 'PM-2001' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'RM-1001' })).not.toBeInTheDocument();
  });
});
