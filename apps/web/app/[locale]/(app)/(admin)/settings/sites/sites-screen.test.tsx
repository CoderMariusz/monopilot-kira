/**
 * @vitest-environment jsdom
 * SET — Sites & production lines screen RTL test.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/org-screens.jsx:103-189.
 * Asserts the screen renders the two-pane layout — LEFT the visual `.site-map`
 * with location pins + the clickable site list; RIGHT the selected site's
 * production-line table + the "Site settings" Section (`SRow` toggles). Verifies
 * selecting a site swaps the detail pane + lazily loads its lines, the empty
 * states (no sites / no lines), and that it composes the shared `.sg-*`
 * primitive structure — all from real-data-shaped loader props
 * (SiteRow / LineRow), no mocks.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LineRow, SiteRow } from './_actions/sites';
import SitesScreen, { type SitesScreenLabels } from './sites-screen.client';

const labels: SitesScreenLabels = {
  title: 'Sites & production lines',
  subtitle: 'Factories, lines, and work centers where production happens.',
  importLines: 'Import lines',
  addSite: '+ Add site',
  sitesTitle: 'Sites ({count})',
  mapRegionFallback: 'Region',
  primaryBadge: 'Primary',
  siteMeta: '{lines} lines · {workers} workers',
  edit: 'Edit',
  addLine: '+ Add line',
  emptySites: 'No sites are configured yet.',
  emptyLines: 'No production lines are assigned to this site yet.',
  columns: { line: 'Line', type: 'Type', workers: 'Workers', status: 'Status' },
  statusActive: 'Active',
  statusMaintenance: 'Maintenance',
  siteSettingsTitle: 'Site settings',
  primarySite: 'Primary site',
  primarySiteHint: 'Used as default for new products and orders.',
  operatingHours: 'Operating hours',
  haccp: 'HACCP certification',
  haccpValid: 'Valid',
  haccpDisabled: 'Not certified',
  haccpExpires: 'Expires {date}',
};

// Real loader-shaped rows (the shape getSites / readSitesSettingsData return).
const sites: SiteRow[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    org_id: '99999999-9999-9999-9999-999999999999',
    code: 'KRK',
    name: 'Kraków HQ',
    address: 'ul. Wadowicka 3, Kraków',
    country: 'Poland',
    latitude: null,
    longitude: null,
    map_x: 40,
    map_y: 55,
    line_count: 3,
    worker_count: 48,
    settings: {
      primary: true,
      operating_hours: 'Mon–Fri 06:00–22:00 · Sat 08:00–16:00',
      haccp_enabled: true,
      haccp_valid_until: '2026-09-14',
    },
    is_active: true,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    org_id: '99999999-9999-9999-9999-999999999999',
    code: 'WAW',
    name: 'Warsaw Plant',
    address: 'ul. Prosta 12, Warsaw',
    country: 'Poland',
    latitude: null,
    longitude: null,
    map_x: 60,
    map_y: 30,
    line_count: 1,
    worker_count: 12,
    settings: {
      primary: false,
      operating_hours: 'Mon–Fri 08:00–18:00',
      haccp_enabled: false,
      haccp_valid_until: null,
    },
    is_active: true,
  },
];

const krakowLines: LineRow[] = [
  {
    id: 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    org_id: '99999999-9999-9999-9999-999999999999',
    code: 'L1',
    name: 'Bottling line',
    type: 'production',
    workers: 18,
    status: 'active',
  },
  {
    id: 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    org_id: '99999999-9999-9999-9999-999999999999',
    code: 'L2',
    name: 'Packaging line',
    type: 'packaging',
    workers: 9,
    status: 'maintenance',
  },
];

const warsawLines: LineRow[] = [
  {
    id: 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    org_id: '99999999-9999-9999-9999-999999999999',
    code: 'L9',
    name: 'Assembly line',
    type: 'production',
    workers: 12,
    status: 'active',
  },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof SitesScreen>> = {}) {
  return render(
    <SitesScreen
      sites={sites}
      initialSelectedSiteId={sites[0].id}
      initialLines={krakowLines}
      labels={labels}
      {...overrides}
    />,
  );
}

afterEach(() => cleanup());

describe('SitesScreen', () => {
  it('keeps the prototype-source anchor on the screen root', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main[data-prototype-source]');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('data-prototype-source')).toBe(
      'prototypes/design/Monopilot Design System/settings/org-screens.jsx:103-189',
    );
  });

  it('renders the page head with title, subtitle and the two head actions', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.sg-head')).not.toBeNull();
    expect(container.querySelector('.sg-title')?.textContent).toBe('Sites & production lines');
    expect(screen.getByRole('button', { name: 'Import lines' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add site' })).toBeInTheDocument();
  });

  it('renders the two-pane layout: site-map + site list (left), detail (right)', () => {
    renderScreen();
    expect(screen.getByTestId('sites-two-pane')).toBeInTheDocument();
    expect(screen.getByTestId('sites-map')).toBeInTheDocument();
    expect(screen.getByTestId('sites-list')).toBeInTheDocument();
    expect(screen.getByTestId('sites-detail')).toBeInTheDocument();

    // One map pin + one list item per real site row.
    expect(screen.getAllByTestId('sites-map-pin')).toHaveLength(sites.length);
    expect(screen.getAllByTestId('sites-list-item')).toHaveLength(sites.length);
  });

  it('composes the shared .sg-* section structure', () => {
    const { container } = renderScreen();
    // left list card + right line-table card + Site settings Section = 3.
    expect(container.querySelectorAll('.sg-section').length).toBe(3);
    expect(container.querySelector('.sg-section-title')?.textContent).toBe('Sites (2)');
  });

  it('renders the site list with primary badge and lines/workers meta', () => {
    renderScreen();
    const list = screen.getByTestId('sites-list');
    const krakow = within(list).getByText('Kraków HQ').closest('button')!;
    expect(within(krakow).getByText('Primary')).toBeInTheDocument();
    expect(within(krakow).getByText('3 lines · 48 workers')).toBeInTheDocument();

    const warsaw = within(list).getByText('Warsaw Plant').closest('button')!;
    expect(within(warsaw).queryByText('Primary')).not.toBeInTheDocument();
    expect(within(warsaw).getByText('1 lines · 12 workers')).toBeInTheDocument();
  });

  it('shows the initially-selected site lines table + its Site settings', () => {
    renderScreen();
    const table = screen.getByTestId('sites-lines-table');
    ['Line', 'Type', 'Workers', 'Status'].forEach((header) => {
      expect(within(table).getByText(header)).toBeInTheDocument();
    });

    const bottling = within(table).getByText('Bottling line').closest('tr')!;
    expect(within(bottling).getByText('L1')).toBeInTheDocument();
    expect(within(bottling).getByText('● Active')).toBeInTheDocument();

    const packaging = within(table).getByText('Packaging line').closest('tr')!;
    expect(within(packaging).getByText('⚒ Maintenance')).toBeInTheDocument();

    // Site settings Section — real settings values.
    const settings = screen.getByRole('region', { name: 'Site settings' });
    expect(within(settings).getByRole('checkbox', { name: 'Primary site' })).toBeChecked();
    expect(within(settings).getByText('Mon–Fri 06:00–22:00 · Sat 08:00–16:00')).toBeInTheDocument();
    expect(within(settings).getByText('✓ Valid')).toBeInTheDocument();
    expect(within(settings).getByText('Expires 2026-09-14')).toBeInTheDocument();
  });

  it('selecting another site swaps the detail pane and lazily loads its lines', async () => {
    const loadLines = vi.fn(async (siteId: string) =>
      siteId === sites[1].id ? warsawLines : krakowLines,
    );
    renderScreen({ loadLines });

    const list = screen.getByTestId('sites-list');
    within(list).getByText('Warsaw Plant').closest('button')!.click();

    // Detail header swaps to the newly-selected site.
    await waitFor(() => {
      const detail = screen.getByTestId('sites-detail');
      expect(within(detail).getByText('Warsaw Plant')).toBeInTheDocument();
    });

    expect(loadLines).toHaveBeenCalledWith(sites[1].id);

    // Lazily-loaded Warsaw lines appear; HACCP shows the not-certified state.
    await waitFor(() => {
      expect(within(screen.getByTestId('sites-lines-table')).getByText('Assembly line')).toBeInTheDocument();
    });
    const settings = screen.getByRole('region', { name: 'Site settings' });
    expect(within(settings).getByRole('checkbox', { name: 'Primary site' })).not.toBeChecked();
    expect(within(settings).getByText('Not certified')).toBeInTheDocument();
  });

  it('renders the no-lines empty-state when a site has no production lines', () => {
    renderScreen({ initialLines: [] });
    expect(screen.getByTestId('sites-lines-empty')).toHaveTextContent(
      'No production lines are assigned to this site yet.',
    );
    expect(screen.queryByTestId('sites-lines-table')).not.toBeInTheDocument();
  });

  it('renders the no-sites empty-state when there are no sites', () => {
    renderScreen({ sites: [], initialSelectedSiteId: null, initialLines: [] });
    expect(screen.getByTestId('sites-empty')).toHaveTextContent('No sites are configured yet.');
    expect(screen.queryByTestId('sites-two-pane')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sites-map')).not.toBeInTheDocument();
  });

  it('disables the mutating actions unless the user can edit', () => {
    renderScreen({ canEdit: false });
    expect(screen.getByRole('button', { name: '+ Add site' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import lines' })).toBeDisabled();
    cleanup();
    renderScreen({ canEdit: true });
    expect(screen.getByRole('button', { name: '+ Add site' })).toBeEnabled();
  });
});
