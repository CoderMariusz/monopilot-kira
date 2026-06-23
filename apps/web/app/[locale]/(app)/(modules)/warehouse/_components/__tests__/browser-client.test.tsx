/**
 * WH-012 — Inventory browser client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:3-155.
 * Tests the presentational <InventoryBrowserClient> directly (the page is an async
 * RSC that reads Supabase via the three inventory actions + renders the
 * permission-denied / error panels). Asserts: the three pivot pills render with
 * counts + switch the table, search filters client-side, empty / empty-filtered
 * states, and that en + pl staged bundles resolve every label (no leaked key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InventoryBrowserClient, type InventoryBrowserLabels } from '../../inventory/_components/inventory-browser.client';
import { getWhcTranslator } from '../../wh-c-labels';
import type {
  InventoryByBatchRow,
  InventoryByLocationRow,
  InventoryByProductRow,
} from '../../_actions/shared';

function buildLabels(locale: string): InventoryBrowserLabels {
  const t = getWhcTranslator(locale);
  return {
    searchPlaceholder: t('inventory.searchPlaceholder'),
    searchLabel: t('inventory.searchLabel'),
    rowsLabel: t('inventory.rowsLabel'),
    emptyAll: t('inventory.emptyAll'),
    emptyFiltered: t('inventory.emptyFiltered'),
    none: t('inventory.none'),
    pickable: t('inventory.pickable'),
    pivots: {
      product: t('inventory.pivots.product'),
      location: t('inventory.pivots.location'),
      batch: t('inventory.pivots.batch'),
    },
    product: {
      item: t('inventory.product.columns.item'),
      total: t('inventory.product.columns.total'),
      lps: t('inventory.product.columns.lps'),
      earliestExpiry: t('inventory.product.columns.earliestExpiry'),
    },
    location: {
      location: t('inventory.location.columns.location'),
      warehouse: t('inventory.location.columns.warehouse'),
      total: t('inventory.location.columns.total'),
      lps: t('inventory.location.columns.lps'),
    },
    batch: {
      batch: t('inventory.batch.columns.batch'),
      item: t('inventory.batch.columns.item'),
      total: t('inventory.batch.columns.total'),
      lps: t('inventory.batch.columns.lps'),
      earliestExpiry: t('inventory.batch.columns.earliestExpiry'),
    },
  };
}

const EN = buildLabels('en');

const PRODUCT: InventoryByProductRow[] = [
  {
    productId: 'p-1',
    itemCode: 'R-1001',
    itemName: 'Wieprzowina',
    totalQty: '500',
    pickableQty: '420',
    quantity: '500',
    availableQty: '420',
    lpCount: 4,
    earliestExpiryDate: '2026-05-01T00:00:00.000Z',
    uom: 'kg',
  },
  {
    productId: 'p-2',
    itemCode: 'R-1002',
    itemName: 'Flour',
    totalQty: '120',
    pickableQty: '120',
    quantity: '120',
    availableQty: '120',
    lpCount: 1,
    earliestExpiryDate: null,
    uom: 'kg',
  },
];
const LOCATION: InventoryByLocationRow[] = [
  {
    locationId: 'l-1',
    locationCode: 'COLD-B3',
    warehouseId: 'w-1',
    warehouseCode: 'WH-A',
    totalQty: '300',
    pickableQty: '250',
    quantity: '300',
    availableQty: '250',
    lpCount: 3,
  },
];
const BATCH: InventoryByBatchRow[] = [
  {
    productId: 'p-1',
    itemCode: 'R-1001',
    batchNumber: 'B-2026-04-02',
    totalQty: '200',
    pickableQty: '180',
    quantity: '200',
    availableQty: '180',
    lpCount: 2,
    earliestExpiryDate: '2026-05-01T00:00:00.000Z',
  },
];

function renderBrowser(over?: {
  byProduct?: InventoryByProductRow[];
  byLocation?: InventoryByLocationRow[];
  byBatch?: InventoryByBatchRow[];
}) {
  return render(
    React.createElement(InventoryBrowserClient, {
      byProduct: over?.byProduct ?? PRODUCT,
      byLocation: over?.byLocation ?? LOCATION,
      byBatch: over?.byBatch ?? BATCH,
      labels: EN,
    }),
  );
}

describe('InventoryBrowserClient (WH-012 parity)', () => {
  it('renders the three pivot pills with counts', () => {
    renderBrowser();
    for (const k of ['product', 'location', 'batch']) {
      expect(screen.getByTestId(`inventory-pivot-${k}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('inventory-pivot-product')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('inventory-pivot-location')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('inventory-pivot-batch')).getByText('1')).toBeInTheDocument();
  });

  it('defaults to the product pivot and switches pivots', () => {
    renderBrowser();
    expect(screen.getByTestId('inventory-product-p-1')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-product-p-1')).toHaveTextContent('500 kg');
    expect(screen.getByTestId('inventory-product-p-1')).toHaveTextContent(`420 kg ${EN.pickable}`);
    fireEvent.click(screen.getByTestId('inventory-pivot-location'));
    expect(screen.queryByTestId('inventory-product-p-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('inventory-location-l-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inventory-pivot-batch'));
    expect(screen.getByTestId('inventory-batch-p-1-0')).toBeInTheDocument();
  });

  it('filters product rows client-side via the search box', () => {
    renderBrowser();
    const search = screen.getByTestId('inventory-search');
    fireEvent.change(search, { target: { value: 'flour' } });
    expect(screen.queryByTestId('inventory-product-p-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('inventory-product-p-2')).toBeInTheDocument();
  });

  it('shows the empty-all state when the active pivot has no rows', () => {
    renderBrowser({ byProduct: [] });
    expect(screen.getByTestId('inventory-empty')).toHaveTextContent(EN.emptyAll);
  });

  it('shows the empty-filtered state when the search matches nothing', () => {
    renderBrowser();
    fireEvent.change(screen.getByTestId('inventory-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('inventory-empty-filtered')).toHaveTextContent(EN.emptyFiltered);
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/inventory\.[a-z]/i);
    }
    expect(buildLabels('pl').pivots.product).not.toBe(EN.pivots.product);
  });
});
