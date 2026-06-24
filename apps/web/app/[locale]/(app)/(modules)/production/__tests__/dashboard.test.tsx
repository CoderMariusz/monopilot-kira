/**
 * T-046 — SCR-08-01 Production Dashboard: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/dashboard.jsx:3-146
 * (production_dashboard, KPI strip) + wo-list.jsx:3-104 (wo_list). Asserts the
 * structural parity of the presentational pieces (4 live KPI tiles in prototype
 * order, WO list table with status badges + progress bars + allergen badge) plus
 * the required UI states (empty / populated). The page itself is an async RSC
 * reading Supabase via withOrgContext, so it is exercised live (Playwright/manual)
 * rather than in jsdom; here we test the pure presentational components.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiStrip, type KpiTile } from '../_components/kpi-strip';
import { WoListTable, type WoListLabels, type WoRowView } from '../_components/wo-list-table';

const TILES_POPULATED: KpiTile[] = [
  { key: 'wo-in-progress', label: 'WOs in progress', value: '3 / 7', sub: 'Running / active', tone: 'info' },
  { key: 'output-today', label: 'Output · today', value: '4,211 kg', sub: 'Registered output (kg)', tone: 'success' },
  { key: 'oee-current', label: 'OEE · current', value: '78.4%', sub: 'Latest snapshot', tone: 'info' },
  { key: 'open-downtime', label: 'Open downtime', value: '2', sub: 'Events not yet ended', tone: 'danger' },
];

const TILES_EMPTY: KpiTile[] = [
  { key: 'wo-in-progress', label: 'WOs in progress', value: '0 / 0', sub: 'Running / active', tone: 'default' },
  { key: 'output-today', label: 'Output · today', value: '0 kg', sub: 'Registered output (kg)', tone: 'default' },
  { key: 'oee-current', label: 'OEE · current', value: 'No data', sub: 'Latest snapshot', tone: 'default' },
  { key: 'open-downtime', label: 'Open downtime', value: '0', sub: 'Events not yet ended', tone: 'default' },
];

const WO_LABELS: WoListLabels = {
  title: 'Work orders (2)',
  emptyCopy: 'No work orders yet — released work orders from Planning appear here.',
  allergenBadge: 'Allergen',
  planningLink: 'Open in Planning',
  col: { wo: 'WO', line: 'Line', status: 'Status', planned: 'Planned', progress: 'Progress', output: 'Output' },
};

const WO_ROWS: WoRowView[] = [
  {
    id: 'wo-1',
    woNumber: 'WO-2026-0001',
    status: 'in_progress',
    statusLabel: 'In progress',
    lineLabel: 'a1b2c3d4',
    plannedLabel: '1,200 kg',
    producedLabel: '600 kg',
    progressPct: 50,
    allergenGate: true,
    planningHref: '/en/planning/work-orders',
  },
  {
    id: 'wo-2',
    woNumber: 'WO-2026-0002',
    status: 'planned',
    statusLabel: 'Planned',
    lineLabel: '—',
    plannedLabel: '800 kg',
    producedLabel: '—',
    progressPct: 0,
    allergenGate: false,
    planningHref: '/en/planning/work-orders',
  },
];

describe('SCR-08-01 KPI strip (parity: dashboard.jsx:71-107)', () => {
  it('renders exactly 4 live KPI tiles in the prototype order', () => {
    render(<KpiStrip tiles={TILES_POPULATED} />);
    const strip = screen.getByTestId('production-kpi-strip');
    const tiles = within(strip).getAllByTestId(/^production-kpi-/);
    expect(tiles).toHaveLength(4);
    expect(tiles.map((el) => el.getAttribute('data-testid'))).toEqual([
      'production-kpi-wo-in-progress',
      'production-kpi-output-today',
      'production-kpi-oee-current',
      'production-kpi-open-downtime',
    ]);
  });

  it('shows each tile label, value and sub-line', () => {
    render(<KpiStrip tiles={TILES_POPULATED} />);
    expect(screen.getByText('WOs in progress')).toBeInTheDocument();
    expect(screen.getByText('4,211 kg')).toBeInTheDocument();
    expect(screen.getByText('78.4%')).toBeInTheDocument();
  });

  it('EMPTY state: every tile still renders a value (0 / 0 kg / No data) — never blank', () => {
    render(<KpiStrip tiles={TILES_EMPTY} />);
    const strip = screen.getByTestId('production-kpi-strip');
    expect(within(strip).getAllByTestId(/^production-kpi-/)).toHaveLength(4);
    expect(screen.getByText('0 kg')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});

describe('SCR-08-02 WO list (parity: wo-list.jsx:52-101)', () => {
  it('renders a table of WO rows with status badges and progress bars', () => {
    render(<WoListTable rows={WO_ROWS} labels={WO_LABELS} />);
    const panel = screen.getByTestId('production-wo-list');
    expect(within(panel).getByText('WO-2026-0001')).toBeInTheDocument();
    expect(within(panel).getByText('In progress')).toBeInTheDocument();
    // Accessible progress bar reflects produced/planned.
    const bars = within(panel).getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '50');
    expect(within(panel).queryByTestId('production-wo-list-empty')).not.toBeInTheDocument();
  });

  it('shows the allergen-gate badge only on allergen-flagged rows', () => {
    render(<WoListTable rows={WO_ROWS} labels={WO_LABELS} />);
    expect(screen.getByTestId('production-wo-allergen-wo-1')).toBeInTheDocument();
    expect(screen.queryByTestId('production-wo-allergen-wo-2')).not.toBeInTheDocument();
  });

  it('renders a Planning deep-link for planned (not-yet-startable) WOs — no in-Production Release control', () => {
    render(<WoListTable rows={WO_ROWS} labels={WO_LABELS} />);
    const link = screen.getByTestId('production-wo-planning-link-wo-2');
    expect(link).toHaveAttribute('href', '/en/planning/work-orders');
    expect(link).toHaveTextContent('Open in Planning');
    // Hard red-line: no "Release WO" control anywhere in Production.
    expect(screen.queryByText(/release wo/i)).not.toBeInTheDocument();
  });

  it('EMPTY state: shows the empty WO-list copy and no table', () => {
    render(<WoListTable rows={[]} labels={WO_LABELS} />);
    expect(screen.getByTestId('production-wo-list-empty')).toHaveTextContent(
      'No work orders yet — released work orders from Planning appear here.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
