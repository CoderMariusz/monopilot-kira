/**
 * T-036 — TEC-080 Technical Dashboard: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:242-301 (TechDashboardScreen). Asserts the structural parity
 * of the presentational pieces (5 KPI tiles in prototype order, Recent Changes
 * panel) plus the required UI states (empty / populated) and the D365 tone map.
 *
 * The page itself is an async RSC that reads Supabase via withOrgContext, so it
 * is exercised live (Playwright/manual) rather than in jsdom; here we test the
 * pure presentational components + tone helper that compose it.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { d365Tone, KpiStrip, type KpiTile } from '../_components/kpi-strip';
import { RecentChangesPanel, type RecentChangeRow } from '../_components/recent-changes';

const TILES_POPULATED: KpiTile[] = [
  { key: 'active-items', label: 'Active items', value: '124', sub: 'rm/int/fg', tone: 'default' },
  { key: 'pending-bom', label: 'Pending BOM approvals', value: '6', sub: 'in review', tone: 'info' },
  { key: 'allergen-overrides', label: 'Open allergen overrides', value: '1', sub: 'manual', tone: 'warning' },
  { key: 'd365-sync', label: 'D365 sync status', value: 'Completed', sub: 'latest', tone: 'success' },
  { key: 'cost-review', label: 'Cost review queue', value: '3', sub: 'awaiting', tone: 'danger' },
];

const TILES_EMPTY: KpiTile[] = TILES_POPULATED.map((t) => ({
  ...t,
  value: t.key === 'd365-sync' ? 'No sync yet' : '0',
  tone: 'default',
}));

describe('TEC-080 KPI strip (parity: other-screens.jsx:246-248)', () => {
  it('renders exactly 5 KPI tiles in the prototype order', () => {
    render(<KpiStrip tiles={TILES_POPULATED} />);
    const strip = screen.getByTestId('technical-kpi-strip');
    const tiles = within(strip).getAllByTestId(/^technical-kpi-/);
    expect(tiles).toHaveLength(5);
    expect(tiles.map((el) => el.getAttribute('data-testid'))).toEqual([
      'technical-kpi-active-items',
      'technical-kpi-pending-bom',
      'technical-kpi-allergen-overrides',
      'technical-kpi-d365-sync',
      'technical-kpi-cost-review',
    ]);
  });

  it('shows each tile label, value and sub-line', () => {
    render(<KpiStrip tiles={TILES_POPULATED} />);
    expect(screen.getByText('Active items')).toBeInTheDocument();
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('EMPTY state: every tile still renders "0" (or "No sync yet") — never blank', () => {
    render(<KpiStrip tiles={TILES_EMPTY} />);
    const strip = screen.getByTestId('technical-kpi-strip');
    const tiles = within(strip).getAllByTestId(/^technical-kpi-/);
    expect(tiles).toHaveLength(5);
    // Four numeric tiles show 0.
    expect(screen.getAllByText('0')).toHaveLength(4);
    expect(screen.getByText('No sync yet')).toBeInTheDocument();
  });
});

describe('TEC-080 D365 tone mapping (tile color is never the sole signal — tone + label)', () => {
  it('maps job statuses to semantic tones, null → neutral default', () => {
    expect(d365Tone('completed')).toBe('success');
    expect(d365Tone('running')).toBe('info');
    expect(d365Tone('pending')).toBe('info');
    expect(d365Tone('failed')).toBe('danger');
    expect(d365Tone('dead_lettered')).toBe('danger');
    expect(d365Tone(null)).toBe('default');
  });
});

describe('TEC-080 Recent Changes panel (parity: other-screens.jsx:283-299)', () => {
  const ROWS: RecentChangeRow[] = [
    { id: 'a', when: '2026-06-04 09:00', resourceLabel: 'BOM', actionLabel: 'bom.approved', reference: 'ab12cd34' },
    { id: 'b', when: '2026-06-04 08:30', resourceLabel: 'Item', actionLabel: 'item.created', reference: 'ef56gh78' },
  ];
  const HEADERS = { when: 'When', resource: 'Type', action: 'Change', reference: 'Ref' };

  it('renders a table of recent changes when rows exist', () => {
    render(
      <RecentChangesPanel title="Recent changes" rows={ROWS} emptyCopy="No recent technical changes yet." columnHeaders={HEADERS} />,
    );
    const panel = screen.getByTestId('technical-recent-changes');
    expect(within(panel).getByText('bom.approved')).toBeInTheDocument();
    expect(within(panel).getByText('item.created')).toBeInTheDocument();
    expect(within(panel).queryByTestId('technical-recent-changes-empty')).not.toBeInTheDocument();
  });

  it('EMPTY state: shows the empty-timeline copy and no table', () => {
    render(
      <RecentChangesPanel title="Recent changes" rows={[]} emptyCopy="No recent technical changes yet." columnHeaders={HEADERS} />,
    );
    expect(screen.getByTestId('technical-recent-changes-empty')).toHaveTextContent('No recent technical changes yet.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
