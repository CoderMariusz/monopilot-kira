/**
 * @vitest-environment jsdom
 *
 * T-105 — WIRING: FA dept tabs wired into fa-tabs.tsx.
 * A3 SLICE 2 — UPDATED: the 7 dept tabs collapse into 3 SECTION tabs (core /
 * commercial / production) + BOM + History (5 tabs). The dept bodies are stacked
 * inside a section by FaSectionWrapper (page.tsx builds the slots). Asserts:
 *   - tab order = core → commercial → production → bom → history;
 *   - the Core-close gate locks the Commercial and Production SECTIONS when
 *     !coreDone (PROVISIONAL owner policy); Core/BOM/History never locked;
 *   - locked triggers are disabled, carry a "Locked" badge, and cannot activate;
 *   - each real dept tab body still renders inside its section when the section is
 *     active (Commercial section stacks Commercial+Planning+Procurement;
 *     Production section stacks Production+Technical+MRP);
 *   - History keeps working (T-027) — the provided panel still renders.
 *
 * The per-dept gates (MRP needs prodDone; Procurement price needs production) are
 * UNCHANGED — they stay field-level inside the dept bodies + the flat
 * DeptStatusStrip; this shell adds no section lock for them.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-408 (FADetail
 *   tab bar + per-section body switch). The per-department gate circles still
 *   render in the flat DeptStatusStrip above the tabs.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FaTabs, type FaTabsLabels } from '../fa-tabs';
import { FaSectionWrapper, type FaSectionPart } from '../fa-section-wrapper';
import { FaCoreTab, type FaCoreColumn } from '../fa-core-tab';
import { FaPlanningTab, type FaPlanningColumn } from '../fa-planning-tab';
import { FaCommercialTab, type FaCommercialColumn } from '../commercial-tab';
import { FaProductionTab, type FaProductionColumn } from '../../../../../../../(npd)/fa/[productCode]/_components/fa-production-tab';
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
    core: 'Core', commercial: 'Commercial & Planning', production: 'Production & Technical',
    bom: 'BOM', history: 'History',
  },
  deferred: 'Tab content deferred',
  deferredBody: 'This department workspace is delivered in a later slice.',
};

// Individual dept bodies (the FaXxxTab components themselves are UNCHANGED).
function coreBody() {
  return (
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
  );
}
function planningBody() {
  return (
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
  );
}
function commercialBody() {
  return (
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
  );
}
function productionBody() {
  return (
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
  );
}
function technicalBody() {
  return (
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
  );
}
function procurementBody() {
  return (
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
  );
}
// MRP body reuses FaProcurementTab as the schema-driven renderer (page.tsx pattern).
function mrpBody() {
  return (
    <FaProcurementTab
      productCode={PRODUCT_CODE}
      columns={[{ key: 'mrp_lot_size', dataType: 'number', required: false, readOnly: false, displayOrder: 70 }]}
      values={{ mrp_lot_size: 100 }}
      dropdowns={{}}
      closedCore="Yes"
      closedProduction="Yes"
      labels={labelsFor({
        title: 'MRP', subtitle: '', closedBadge: 'Closed', openBadge: 'Open',
        priceBlockedTitle: 'Locked', priceBlockedBody: 'locked', priceBlockedHint: 'locked',
        save: 'Save MRP', saving: 'Saving', saveSuccess: 'Saved', saveError: 'Failed',
        selectPlaceholder: 'Select…',
      })}
    />
  );
}

// A3 SLICE 2 — build the 3 SECTION panels (page.tsx assembly mirror): the dept
// bodies are stacked inside a section by FaSectionWrapper. BOM + History keep
// their own tabs.
function makePanels() {
  const commercialParts: FaSectionPart[] = [
    { key: 'commercial', deptValue: 'Commercial', heading: 'Commercial', node: commercialBody() },
    { key: 'planning', deptValue: 'Planning', heading: 'Planning', node: planningBody() },
    { key: 'procurement', deptValue: 'Procurement', heading: 'Procurement', node: procurementBody() },
  ];
  const productionParts: FaSectionPart[] = [
    { key: 'production', deptValue: 'Production', heading: 'Production', node: productionBody() },
    { key: 'technical', deptValue: 'Technical', heading: 'Technical', node: technicalBody() },
    { key: 'mrp', deptValue: 'MRP', heading: 'MRP', node: mrpBody() },
  ];
  return {
    core: (
      <FaSectionWrapper sectionKey="core" parts={[{ key: 'core', deptValue: 'Core', heading: 'Core', node: coreBody() }]} />
    ),
    commercial: <FaSectionWrapper sectionKey="commercial" parts={commercialParts} />,
    production: <FaSectionWrapper sectionKey="production" parts={productionParts} />,
    bom: <div data-testid="fa-bom-panel">BOM view</div>,
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

describe('A3 SLICE 2 — FA section tabs wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUrlTab(null);
  });
  afterEach(() => cleanup());

  it('renders the 3 section tabs + BOM + History in order', () => {
    renderTabs({ coreDone: true });
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('data-value'))).toEqual([
      'core', 'commercial', 'production', 'bom', 'history',
    ]);
  });

  it('mounts the real FaCoreTab in the core section with product values', () => {
    renderTabs({ tab: 'core', coreDone: true });
    expect(screen.getByTestId('fa-section-core')).toBeInTheDocument();
    expect(screen.getByTestId('fa-core-tab')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Pie')).toBeInTheDocument();
  });

  it('stacks Commercial + Planning + Procurement dept bodies inside the Commercial section', () => {
    renderTabs({ tab: 'commercial', coreDone: true });
    expect(screen.getByTestId('fa-section-commercial')).toBeInTheDocument();
    expect(screen.getByTestId('fa-commercial-tab')).toBeInTheDocument();
    expect(screen.getByTestId('fa-planning-tab')).toBeInTheDocument();
    // Procurement reuses FaProcurementTab → data-testid fa-procurement-tab.
    expect(screen.getAllByTestId('fa-procurement-tab').length).toBeGreaterThanOrEqual(1);
  });

  it('stacks Production + Technical + MRP dept bodies inside the Production section', () => {
    renderTabs({ tab: 'production', coreDone: true, prodDone: true });
    expect(screen.getByTestId('fa-section-production')).toBeInTheDocument();
    expect(screen.getByTestId('fa-production-tab')).toBeInTheDocument();
    expect(screen.getByTestId('fa-technical-tab')).toBeInTheDocument();
    // MRP is rendered by reusing FaProcurementTab (no dedicated FaMrpTab).
    expect(screen.getAllByTestId('fa-procurement-tab').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the History (T-027) panel working', () => {
    renderTabs({ tab: 'history', coreDone: true });
    expect(screen.getByTestId('fa-history-panel')).toBeInTheDocument();
  });

  it('locks the Commercial + Production sections when !coreDone; Core/BOM/History stay open', () => {
    renderTabs({ coreDone: false });
    for (const name of [/commercial & planning/i, /production & technical/i]) {
      const tab = screen.getByRole('tab', { name });
      expect(tab).toBeDisabled();
      expect(within(tab).getByText(/locked/i)).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: /^core/i })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: /^bom/i })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: /^history/i })).not.toBeDisabled();
  });

  it('unlocks the Production section once Core is closed regardless of prodDone (per-dept MRP gate stays field-level)', () => {
    renderTabs({ coreDone: true, prodDone: false });
    expect(screen.getByRole('tab', { name: /production & technical/i })).not.toBeDisabled();
  });

  it('does not navigate when a locked section tab is clicked', async () => {
    const user = userEvent.setup();
    renderTabs({ tab: 'core', coreDone: false });
    await user.click(screen.getByRole('tab', { name: /commercial & planning/i }));
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('navigates when an unlocked section tab is clicked', async () => {
    const user = userEvent.setup();
    renderTabs({ tab: 'core', coreDone: true });
    await user.click(screen.getByRole('tab', { name: /production & technical/i }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/\?tab=production(?:$|&)/));
  });
});
