/**
 * WH-018 — Locations hierarchy client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:156-279.
 * Tests the presentational <LocationsTreeClient> directly (the page is an async RSC
 * that reads Supabase via listLocations/listLPs + renders the denied/error panels).
 * Asserts: flat location rows nest under their warehouse group, search filters the
 * tree, LP counts derive from the passed map, the manage-locations link points at
 * settings, empty + empty-filtered states, and en + pl staged bundles resolve every
 * label.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LocationsTreeClient, type LocationsTreeLabels } from '../locations-tree.client';
import { getWhFacilityTranslator } from '../../../wh-facility-labels';
import type { LocationOption } from '../../../_actions/location-read-actions';

function buildLabels(locale: string): LocationsTreeLabels {
  const t = getWhFacilityTranslator(locale);
  return {
    searchPlaceholder: t('locations.searchPlaceholder'),
    searchLabel: t('locations.searchLabel'),
    empty: t('locations.empty'),
    emptyFiltered: t('locations.emptyFiltered'),
    manageLink: t('locations.manageLink'),
    manageHint: t('locations.manageHint'),
    rowsLabel: t('locations.rowsLabel'),
    lpCountLabel: t('locations.lpCountLabel'),
    lpCountLabelPlural: t('locations.lpCountLabelPlural'),
    lpCountCapNote: t('locations.lpCountCapNote'),
    warehouseUnassigned: t('locations.warehouseUnassigned'),
    levelLabel: t('locations.levelLabel'),
    deferredNote: t('locations.deferredNote'),
  };
}

const LOCATIONS: LocationOption[] = [
  { id: 'l-cold', code: 'COLD', name: 'Cold Storage', warehouseId: 'wh-a', warehouseCode: 'WH-A', warehouseName: 'Factory A' },
  { id: 'l-b3', code: 'B3', name: 'Cold Bin B3', warehouseId: 'wh-a', warehouseCode: 'WH-A', warehouseName: 'Factory A' },
  { id: 'l-dry', code: 'DRY', name: 'Dry Storage', warehouseId: 'wh-b', warehouseCode: 'WH-B', warehouseName: 'Factory B' },
];

const LP_COUNTS: Record<string, number> = { COLD: 1, B3: 12 };

function renderTree(opts: { locations?: LocationOption[]; locale?: string } = {}) {
  const locale = opts.locale ?? 'en';
  // prettier-ignore
  return render(<LocationsTreeClient locations={opts.locations ?? LOCATIONS} lpCountByCode={LP_COUNTS} lpCountCap={500} labels={buildLabels(locale)} manageHref="/en/settings/infra/locations" />);
}

describe('LocationsTreeClient (WH-018)', () => {
  it('nests flat location rows under their warehouse group', () => {
    renderTree();
    const whA = screen.getByTestId('locations-wh-wh-a');
    // Both wh-a locations live inside the wh-a group; wh-b one does not.
    expect(within(whA).getByTestId('locations-node-l-cold')).toBeInTheDocument();
    expect(within(whA).getByTestId('locations-node-l-b3')).toBeInTheDocument();
    expect(within(whA).queryByTestId('locations-node-l-dry')).not.toBeInTheDocument();

    const whB = screen.getByTestId('locations-wh-wh-b');
    expect(within(whB).getByTestId('locations-node-l-dry')).toBeInTheDocument();
  });

  it('derives per-location LP counts from the passed map (singular vs plural)', () => {
    renderTree();
    expect(screen.getByTestId('locations-count-l-cold')).toHaveTextContent('1 LP');
    expect(screen.getByTestId('locations-count-l-b3')).toHaveTextContent('12 LPs');
    // No count for a location absent from the map → 0.
    expect(screen.getByTestId('locations-count-l-dry')).toHaveTextContent('0 LPs');
  });

  it('search filters the tree by code/name', () => {
    renderTree();
    fireEvent.change(screen.getByTestId('locations-search'), { target: { value: 'dry' } });
    expect(screen.getByTestId('locations-node-l-dry')).toBeInTheDocument();
    expect(screen.queryByTestId('locations-node-l-cold')).not.toBeInTheDocument();
    expect(screen.queryByTestId('locations-wh-wh-a')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state when nothing matches', () => {
    renderTree();
    fireEvent.change(screen.getByTestId('locations-search'), { target: { value: 'zzz-none' } });
    expect(screen.getByTestId('locations-empty-filtered')).toBeInTheDocument();
  });

  it('shows the empty state when there are no locations', () => {
    renderTree({ locations: [] });
    expect(screen.getByTestId('locations-empty')).toBeInTheDocument();
  });

  it('links manage-locations to the settings infra route (edits live there)', () => {
    renderTree();
    expect(screen.getByTestId('locations-manage-link')).toHaveAttribute('href', '/en/settings/infra/locations');
  });

  it('surfaces the honest LP-count cap note', () => {
    renderTree();
    expect(screen.getByTestId('locations-cap-note')).toHaveTextContent('500');
  });

  it('resolves every label in en and pl staged bundles (no raw keys)', () => {
    for (const locale of ['en', 'pl']) {
      const labels = buildLabels(locale);
      for (const v of Object.values(labels)) {
        expect(typeof v).toBe('string');
        expect(v).not.toMatch(/^locations\./);
      }
    }
  });
});
