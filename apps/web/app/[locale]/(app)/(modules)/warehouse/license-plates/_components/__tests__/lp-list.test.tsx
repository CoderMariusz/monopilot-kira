/**
 * WH-002 — License-plate list client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:3-215.
 * Tests the presentational <LpListClient> directly (the page is an async RSC that
 * reads Supabase via the listLPs action and is exercised live). Asserts:
 *   - status tabs render with counts + filter the table (parity lp-screens.jsx:9-76)
 *   - search filters by LP# / item / batch (lp-screens.jsx:23-27,80)
 *   - dense table: LP mono link to detail, item code+name, qty+uom, batch, status
 *     + QA badges, location (lp-screens.jsx:126-195)
 *   - UoM rendered from data (never free text)
 *   - empty / empty-filtered states
 *   - i18n: the en + pl staged bundles resolve every list key (no leaked dotted key)
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LpListClient, type LpListLabels } from '../lp-list.client';
import { getLpTranslator } from '../../lp-labels';
import type { LicensePlateListItem } from '../../../_actions/shared';

function buildLabels(locale: string): LpListLabels {
  const t = getLpTranslator(locale);
  return {
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    rowsLabel: t('list.rowsLabel'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    deferredMultiSelect: t('list.deferredMultiSelect'),
    tab: {
      all: t('list.tabs.all'),
      available: t('list.tabs.available'),
      reserved: t('list.tabs.reserved'),
      blocked: t('list.tabs.blocked'),
      qc_hold: t('list.tabs.qc_hold'),
    },
    status: {
      received: t('status.received'),
      available: t('status.available'),
      reserved: t('status.reserved'),
      blocked: t('status.blocked'),
      consumed: t('status.consumed'),
      shipped: t('status.shipped'),
      merged: t('status.merged'),
      destroyed: t('status.destroyed'),
    },
    col: {
      lp: t('list.columns.lp'),
      item: t('list.columns.item'),
      qty: t('list.columns.qty'),
      batch: t('list.columns.batch'),
      expiry: t('list.columns.expiry'),
      status: t('list.columns.status'),
      qa: t('list.columns.qa'),
      location: t('list.columns.location'),
    },
    expiry: { expired: t('list.expiry.expired'), soon: t('list.expiry.soon') },
  };
}

const EN = buildLabels('en');

function makeRow(over: Partial<LicensePlateListItem>): LicensePlateListItem {
  return {
    id: over.id ?? 'lp-1',
    lpNumber: over.lpNumber ?? 'LP-0001',
    itemCode: over.itemCode ?? 'R-1001',
    itemName: over.itemName ?? 'Wieprzowina',
    quantity: over.quantity ?? '120',
    reservedQty: over.reservedQty ?? '0',
    availableQty: over.availableQty ?? '120',
    uom: over.uom ?? 'kg',
    status: over.status ?? 'available',
    qaStatus: over.qaStatus ?? 'PASSED',
    batchNumber: over.batchNumber ?? 'B-2026-01',
    expiryDate: over.expiryDate ?? null,
    locationCode: over.locationCode ?? 'COLD-B1',
    warehouseCode: over.warehouseCode ?? 'WH-A',
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function renderList(rows: LicensePlateListItem[], labels: LpListLabels = EN) {
  return render(<LpListClient rows={rows} labels={labels} locale="en" />);
}

describe('LpListClient (WH-002 parity)', () => {
  it('renders the five status tabs with counts', () => {
    renderList([
      makeRow({ id: 'a', status: 'available', qaStatus: 'PASSED' }),
      makeRow({ id: 'b', status: 'reserved', qaStatus: 'PASSED' }),
      makeRow({ id: 'c', status: 'blocked', qaStatus: 'FAILED' }),
      makeRow({ id: 'd', status: 'available', qaStatus: 'HOLD' }),
    ]);
    for (const k of ['all', 'available', 'reserved', 'blocked', 'qc_hold']) {
      expect(screen.getByTestId(`lp-tab-${k}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('lp-tab-all')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('lp-tab-available')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('lp-tab-reserved')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('lp-tab-blocked')).getByText('1')).toBeInTheDocument();
    // qc_hold counts HOLD/PENDING/QUARANTINED → row d.
    expect(within(screen.getByTestId('lp-tab-qc_hold')).getByText('1')).toBeInTheDocument();
  });

  it('filters rows by the active tab', () => {
    renderList([
      makeRow({ id: 'a', lpNumber: 'LP-AVAIL', status: 'available', qaStatus: 'PASSED' }),
      makeRow({ id: 'b', lpNumber: 'LP-BLOCK', status: 'blocked', qaStatus: 'FAILED' }),
    ]);
    expect(screen.getByTestId('lp-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('lp-row-b')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lp-tab-blocked'));
    expect(screen.queryByTestId('lp-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('lp-row-b')).toBeInTheDocument();
  });

  it('searches by LP number, item, and batch', () => {
    renderList([
      makeRow({ id: 'a', lpNumber: 'LP-AAA', itemName: 'Pork', batchNumber: 'BX-1' }),
      makeRow({ id: 'b', lpNumber: 'LP-BBB', itemName: 'Flour', batchNumber: 'BX-2' }),
    ]);
    const search = screen.getByTestId('lp-list-search');
    fireEvent.change(search, { target: { value: 'flour' } });
    expect(screen.queryByTestId('lp-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('lp-row-b')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'BX-1' } });
    expect(screen.getByTestId('lp-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('lp-row-b')).not.toBeInTheDocument();
  });

  it('renders LP number as a mono link to the detail route + UoM from data', () => {
    renderList([makeRow({ id: 'lp-x', lpNumber: 'LP-9999', quantity: '42', uom: 'kg' })]);
    const link = screen.getByTestId('lp-link-lp-x');
    expect(link).toHaveAttribute('href', '/en/warehouse/license-plates/lp-x');
    expect(link).toHaveTextContent('LP-9999');
    // qty + uom from data, never a free-text unit
    expect(screen.getByText(/42 kg/)).toBeInTheDocument();
  });

  it('renders status + QA badges', () => {
    renderList([makeRow({ id: 'lp-1', status: 'reserved', qaStatus: 'HOLD' })]);
    expect(screen.getByTestId('lp-status-lp-1')).toHaveTextContent(EN.status.reserved);
    expect(screen.getByTestId('lp-qa-lp-1')).toHaveTextContent('HOLD');
  });

  it('shows the empty-all state when there are no rows', () => {
    renderList([]);
    expect(screen.getByTestId('lp-list-empty')).toHaveTextContent(EN.emptyAll);
  });

  it('shows the empty-filtered state when the search matches nothing', () => {
    renderList([makeRow({ id: 'a', lpNumber: 'LP-AAA' })]);
    fireEvent.change(screen.getByTestId('lp-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('lp-list-empty-filtered')).toHaveTextContent(EN.emptyFiltered);
  });

  it('red-lines bulk multi-select as deferred (no checkbox column)', () => {
    renderList([makeRow({ id: 'a' })]);
    expect(screen.getByTestId('lp-list-bulk-deferred')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const labels = buildLabels(locale);
      const flat = JSON.stringify(labels);
      // A leaked next-intl key looks like "list.tabs.all" — assert none survive.
      expect(flat).not.toMatch(/list\.[a-z]/i);
      expect(flat).not.toMatch(/status\.[a-z]/i);
      expect(labels.tab.all.length).toBeGreaterThan(0);
    }
    // pl differs from en (real translation, not an EN echo)
    expect(buildLabels('pl').tab.available).not.toBe(EN.tab.available);
  });
});
