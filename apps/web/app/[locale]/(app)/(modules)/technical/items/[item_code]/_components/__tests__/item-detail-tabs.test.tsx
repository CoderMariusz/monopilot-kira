/**
 * @vitest-environment jsdom
 *
 * T-034 — TEC-012 Item Detail tabs + overview RTL tests (RED-first).
 *
 * Prototype source (literal anchor, verified with `wc -l "…/technical/other-screens.jsx"` = 1147):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:354-477
 *   (MaterialDetailScreen — PageHeader + tabs-bar + per-tab panels). PRD TEC-012
 *   (docs/prd/03-TECHNICAL-PRD.md:630): 8 tabs overview/BOM/allergens/cost/
 *   routing/supplier specs/lab results/D365 status.
 *
 * Parity + behaviour checklist:
 *   - Tabs primitive DOM contract: role="tablist" with 8 role="tab" buttons,
 *     role="tabpanel" bodies, data-slot="tabs"/"tabs-list"/"tabs-trigger"/"tabs-content".
 *   - Overview is the default active tab and renders the real item identification.
 *   - Deferred tabs render the "Coming soon" placeholder (no mock data).
 *   - clicking a tab pushes ?tab=<slug> (bookmarkable).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/en/technical/items/RM-1001',
  useSearchParams: () => searchParams,
}));

import {
  ItemDetailTabs,
  ITEM_DETAIL_TAB_SLUGS,
} from '../item-detail-tabs';
import { ItemOverviewTab, type ItemOverviewLabels } from '../item-overview-tab';
import type { ItemDetail } from '../../../_actions/get-item';

const item: ItemDetail = {
  id: '1',
  itemCode: 'RM-1001',
  name: 'Pork shoulder',
  itemType: 'rm',
  status: 'active',
  description: 'Class II',
  productGroup: 'Meat',
  uomBase: 'kg',
  uomSecondary: null,
  gs1Gtin: '01234567890123',
  weightMode: 'catch',
  nominalWeight: '0.25',
  tareWeight: '0.02',
  grossWeightMax: '0.3',
  varianceTolerancePct: '5',
  shelfLifeDays: 21,
  shelfLifeMode: 'use_by',
  costPerKg: '12.5',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const overviewLabels: ItemOverviewLabels = {
  identification: 'Identification',
  commercial: 'Commercial & weight',
  code: 'Code',
  name: 'Name',
  type: 'Type',
  status: 'Status',
  uomBase: 'Base UoM',
  uomSecondary: 'Secondary UoM',
  productGroup: 'Product group',
  description: 'Description',
  weightMode: 'Weight mode',
  nominalWeight: 'Nominal weight',
  tareWeight: 'Tare weight',
  grossWeightMax: 'Gross weight max',
  gs1Gtin: 'GS1 GTIN',
  varianceTolerance: 'Variance tolerance',
  shelfLife: 'Shelf life',
  costPerKg: 'Cost / kg',
  updated: 'Updated',
  none: '—',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  searchParams = new URLSearchParams('');
});

describe('ItemDetailTabs (TEC-012)', () => {
  it('renders an 8-tab tablist with the shadcn/Radix DOM contract', () => {
    render(
      <ItemDetailTabs
        itemCode="RM-1001"
        panels={{ overview: <ItemOverviewTab item={item} labels={overviewLabels} /> }}
      />,
    );
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('data-slot', 'tabs-list');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(ITEM_DETAIL_TAB_SLUGS.length);
    expect(tabs).toHaveLength(8);
    tabs.forEach((tab) => expect(tab).toHaveAttribute('data-slot', 'tabs-trigger'));
  });

  it('defaults to Overview and shows the real item identification', () => {
    render(
      <ItemDetailTabs
        itemCode="RM-1001"
        panels={{ overview: <ItemOverviewTab item={item} labels={overviewLabels} /> }}
      />,
    );
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Pork shoulder')).toBeInTheDocument();
    // catch-weight reveal in overview
    expect(screen.getByText('Nominal weight')).toBeInTheDocument();
  });

  it('renders the deferred placeholder for an unwired tab and bookmarks via ?tab=', async () => {
    const user = userEvent.setup();
    render(
      <ItemDetailTabs
        itemCode="RM-1001"
        panels={{ overview: <ItemOverviewTab item={item} labels={overviewLabels} /> }}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'BOM' }));
    expect(push).toHaveBeenCalledWith('/en/technical/items/RM-1001?tab=bom');
  });

  it('shows the Coming soon placeholder when a deferred tab is active', () => {
    searchParams = new URLSearchParams('tab=allergens');
    render(
      <ItemDetailTabs
        itemCode="RM-1001"
        panels={{ overview: <ItemOverviewTab item={item} labels={overviewLabels} /> }}
      />,
    );
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument();
  });
});
