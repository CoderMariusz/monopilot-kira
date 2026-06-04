/**
 * @vitest-environment jsdom
 *
 * T-105 — WIRING: FA dept tabs wired into fa-tabs.tsx.
 *
 * RED-first integration test for the FA detail tabs container once the merged
 * standalone dept tab components are mounted into their slots. Asserts:
 *   - tab order matches the prototype (core → planning → commercial → production
 *     → technical → mrp → procurement → history), prototype lines 312-325;
 *   - the Core-close gate locks Planning / Commercial / Technical / Procurement
 *     when !coreDone, and MRP when (!coreDone || !prodDone) — prototype 314-319;
 *   - Core + Production are NEVER locked (Production uses a per-field block);
 *   - locked triggers are disabled, carry a "Locked" badge, and cannot activate;
 *   - each real dept tab component renders in its panel when that tab is active
 *     (props flow from the parent: schema-driven columns + product values);
 *   - History keeps working (T-027) — the provided panel still renders.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:312-408 (FADetail
 *   tab bar + TABS array + per-tab body switch).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FaTabs, type FaTabsLabels } from '../fa-tabs';
import { FaCoreTab, type FaCoreColumn } from '../fa-core-tab';
import { FaPlanningTab, type FaPlanningColumn } from '../fa-planning-tab';
import { FaCommercialTab, type FaCommercialColumn } from '../commercial-tab';
import { FaProductionTab, type FaProductionColumn } from '../fa-production-tab';
import { FaTechnicalTab, type FaTechnicalColumn } from '../fa-technical-tab';
import { FaProcurementTab, type FaProcurementColumn } from '../fa-procurement-tab';

// ---------------------------------------------------------------------------
// next/navigation harness — URL-driven active tab (mirrors fa-tabs.test.tsx)
// ---------------------------------------------------------------------------

let pathname = '/en/fa/FA0043';
let searchParams = new URLSearchParams();

const routerPush = vi.fn((href: string) => {
  const next = new URL(href, 'https://monopilot.test');
  pathname = next.pathname;
  searchParams = new URLSearchParams(next.searchParams);
});

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParams.toString()),
}));

// Never hit the real Server Action write path in this jsdom suite.
const persistSpy = vi.fn(async () => undefined);
vi.mock('../../../../../../(npd)/fa/actions/update-fa-cell', () => ({
  updateFaCell: (...args: unknown[]) => persistSpy(...args),
}));

function setUrlTab(tab: string | null) {
  pathname = '/en/fa/FA0043';
  searchParams = new URLSearchParams();
  if (tab) searchParams.set('tab', tab);
}

// ---------------------------------------------------------------------------
// Minimal real-shaped fixtures (NOT mock data substituting for production —
// these only stand in for the server-loaded DeptColumns + product row at the
// component boundary the way page.test.tsx mocks withOrgContext).
// ---------------------------------------------------------------------------

const PRODUCT_CODE = 'FA0043';

const coreColumns: FaCoreColumn[] = [
  { key: 'product_name', dataType: 'text', required: true, readOnly: false, displayOrder: 2 },
  { key: 'pack_size', dataType: 'dropdown', required: true, readOnly: false, dropdownSource: 'PackSizes', displayOrder: 3 },
];
const planningColumns: FaPlanningColumn[] = [
  { key: 'primary_ingredient_pct', dataType: 'number', required: true, readOnly: false, displayOrder: 9 },
];
const commercialColumns: FaCommercialColumn[] = [
  { key: 'launch_date', dataType: 'date', required: true, readOnly: false, displayOrder: 13 },
];
const productionColumns: FaProductionColumn[] = [
  { key: 'line', dataType: 'dropdown', required: true, readOnly: false, dropdownSource: 'Lines', displayOrder: 29 },
];
const technicalColumns: FaTechnicalColumn[] = [
  { key: 'shelf_life', dataType: 'text', required: true, readOnly: false, displayOrder: 40 },
];
const procurementColumns: FaProcurementColumn[] = [
  { key: 'price', dataType: 'number', required: true, readOnly: false, priceGated: true, displayOrder: 55 },
];

function labelsFor<T extends Record<string, unknown>>(
  extra: T,
): T & {
  fields: Record<string, string>;
  loading: string; empty: string; emptyBody: string; error: string; forbidden: string;
} {
  return {
    fields: {
      product_name: 'Product Name', pack_size: 'Pack Size', primary_ingredient_pct: 'Primary Ingredient %',
      launch_date: 'Launch Date', line: 'Line', shelf_life: 'Shelf Life', price: 'Price',
    },
    loading: 'Loading…', empty: 'Empty', emptyBody: 'Empty body', error: 'Error', forbidden: 'Forbidden',
    ...extra,
  };
}

const tabLabels: FaTabsLabels = {
  tablistLabel: 'FA detail departments',
  tabs: {
    core: 'Core', planning: 'Planning', commercial: 'Commercial', production: 'Production',
    technical: 'Technical', mrp: 'MRP', procurement: 'Procurement', history: 'History',
  },
  deferred: 'Tab content deferred',
  deferredBody: 'This department workspace is delivered in a later slice.',
};

function makePanels() {
  return {
    core: (
      <FaCoreTab
        productCode={PRODUCT_CODE}
        columns={coreColumns}
        values={{ product_name: 'Test Pie', pack_size: '6x400g' }}
        dropdowns={{}}
        labels={labelsFor({
          title: 'Core', subtitle: '', closedBadge: 'Closed', openBadge: 'Open', autoHint: 'auto',
          requiredMissingTitle: 'Required', requiredMissingBody: 'fill', save: 'Save Core', saving: 'Saving',
          saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…',
        })}
      />
    ),
    planning: (
      <FaPlanningTab
        productCode={PRODUCT_CODE}
        columns={planningColumns}
        values={{ primary_ingredient_pct: 80 }}
        dropdowns={{}}
        labels={labelsFor({
          title: 'Planning', subtitle: '', closedBadge: 'Closed', openBadge: 'Open',
          bomNoteTitle: 'BOM', bomNoteBody: 'note', save: 'Save Planning', saving: 'Saving',
          saveSuccess: 'Saved', saveError: 'Failed', closeSection: 'Close Planning', selectPlaceholder: 'Select…',
        })}
      />
    ),
    commercial: (
      <FaCommercialTab
        productCode={PRODUCT_CODE}
        columns={commercialColumns}
        values={{ launch_date: '2026-09-01' }}
        closedCommercial={null}
        briefId={null}
        earliest={null}
        labels={labelsFor({
          title: 'Commercial', subtitle: '', closedBadge: 'Closed', openBadge: 'Open',
          v08Alert: 'v08 {earliest}', v08Violation: 'v08v {earliest}', requiredMissingTitle: 'Required',
          requiredMissingBody: 'fill', save: 'Save Commercial', saving: 'Saving', saveSuccess: 'Saved',
          saveError: 'Failed', close: 'Close Commercial',
        })}
      />
    ),
    production: (
      <FaProductionTab
        productCode={PRODUCT_CODE}
        packSizeFilled
        columns={productionColumns}
        rows={[
          { id: 'r1', componentIndex: 1, intermediateCode: 'PR-001', v06Status: 'pass', values: { line: 'L1' } },
        ]}
        dropdowns={{}}
        labels={labelsFor({
          title: 'Production detail', componentsCount: '{count} component(s)', subtitle: '',
          lockedTitle: 'Blocked', lockedBody: 'fill pack size', v06Pass: 'OK', v06Warn: 'Warn',
          aggregateTitle: 'Aggregate', autoHint: 'auto', singleComponent: 'Component', save: 'Save Production',
          saving: 'Saving', saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…',
        })}
      />
    ),
    technical: (
      <FaTechnicalTab
        productCode={PRODUCT_CODE}
        columns={technicalColumns}
        values={{ shelf_life: '14 days' }}
        dropdowns={{}}
        labels={labelsFor({
          title: 'Technical', subtitle: '', closedBadge: 'Closed', openBadge: 'Open', autoHint: 'auto',
          requiredMissingTitle: 'Required', requiredMissingBody: 'fill', save: 'Save Technical', saving: 'Saving',
          saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…',
          allergenSlotTitle: 'Allergens', allergenSlotSubtitle: 'sub', allergenSlotLoading: 'loading',
        })}
      />
    ),
    procurement: (
      <FaProcurementTab
        productCode={PRODUCT_CODE}
        columns={procurementColumns}
        values={{ price: 1.5 }}
        dropdowns={{}}
        closedCore="Yes"
        closedProduction="Yes"
        labels={labelsFor({
          title: 'Procurement', subtitle: '', closedBadge: 'Closed', openBadge: 'Open',
          priceBlockedTitle: 'Blocked', priceBlockedBody: 'close core', priceBlockedHint: 'locked',
          save: 'Save Procurement', saving: 'Saving', saveSuccess: 'Saved', saveError: 'Failed',
          selectPlaceholder: 'Select…',
        })}
      />
    ),
    history: <div data-testid="fa-history-panel">History timeline</div>,
  };
}

function renderTabs(opts: { tab?: string | null; coreDone?: boolean; prodDone?: boolean }) {
  setUrlTab(opts.tab ?? null);
  return render(
    <FaTabs
      productCode={PRODUCT_CODE}
      labels={tabLabels}
      panels={makePanels()}
      coreDone={opts.coreDone ?? false}
      prodDone={opts.prodDone ?? false}
    />,
  );
}

describe('T-105 FA dept tabs wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUrlTab(null);
  });
  afterEach(() => cleanup());

  it('renders all 8 tabs in prototype order', () => {
    renderTabs({ coreDone: true });
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('data-value'))).toEqual([
      'core', 'planning', 'commercial', 'production', 'technical', 'mrp', 'procurement', 'history',
    ]);
  });

  it('mounts the real FaCoreTab in the core panel with product values', () => {
    renderTabs({ tab: 'core', coreDone: true });
    expect(screen.getByTestId('fa-core-tab')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Pie')).toBeInTheDocument();
  });

  it('mounts each dept tab body when its tab is active', () => {
    for (const [slug, testid] of [
      ['planning', 'fa-planning-tab'],
      ['commercial', 'fa-commercial-tab'],
      ['production', 'fa-production-tab'],
      ['technical', 'fa-technical-tab'],
      ['procurement', 'fa-procurement-tab'],
    ] as const) {
      cleanup();
      renderTabs({ tab: slug, coreDone: true, prodDone: true });
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
  });

  it('keeps the History (T-027) panel working', () => {
    renderTabs({ tab: 'history', coreDone: true });
    expect(screen.getByTestId('fa-history-panel')).toBeInTheDocument();
  });

  it('locks Planning/Commercial/Technical/Procurement when !coreDone; Core + Production stay open', () => {
    renderTabs({ coreDone: false });
    for (const slug of ['planning', 'commercial', 'technical', 'procurement']) {
      const tab = screen.getByRole('tab', { name: new RegExp(`${slug}`, 'i') });
      expect(tab).toBeDisabled();
      expect(within(tab).getByText(/locked/i)).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: /^core/i })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: /^production/i })).not.toBeDisabled();
  });

  it('locks MRP until both Core and Production are done', () => {
    renderTabs({ coreDone: true, prodDone: false });
    expect(screen.getByRole('tab', { name: /mrp/i })).toBeDisabled();
    cleanup();
    renderTabs({ coreDone: true, prodDone: true });
    expect(screen.getByRole('tab', { name: /mrp/i })).not.toBeDisabled();
  });

  it('does not navigate when a locked tab is clicked', async () => {
    const user = userEvent.setup();
    renderTabs({ tab: 'core', coreDone: false });
    await user.click(screen.getByRole('tab', { name: /planning/i }));
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('navigates when an unlocked tab is clicked', async () => {
    const user = userEvent.setup();
    renderTabs({ tab: 'core', coreDone: true });
    await user.click(screen.getByRole('tab', { name: /^production/i }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/\?tab=production(?:$|&)/));
  });
});
