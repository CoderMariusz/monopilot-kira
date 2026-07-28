/**
 * @vitest-environment jsdom
 *
 * B-7/B-8/B-9 — the item-detail "+ New routing" CTA, driven through the REAL page.
 *
 * The previous suite tested this by handing <RoutingTab> a hand-written <a> and
 * asserting it rendered, so every actual decision — the RBAC gate, the loader's
 * verdict, the locale in the href — was untested and all four cases stayed green
 * no matter what the page did. Here the CTA element is the one the page builds.
 *
 * The child components are stubbed down to the routing panel on purpose: the
 * subject is the page's gate, not the tab chrome.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getItem = vi.fn();
const loadRoutingTab = vi.fn();
const hasPermission = vi.fn();
const withOrgContext = vi.fn();

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_CODE = 'NIGHT-R06-FG-1138';

vi.mock('../../_actions/get-item', () => ({ getItem: (...a: unknown[]) => getItem(...a) }));

vi.mock('../_actions/tab-data', () => ({
  loadRoutingTab: (...a: unknown[]) => loadRoutingTab(...a),
  loadBomTab: vi.fn(async () => ({ state: 'empty', versions: [] })),
  loadCostTab: vi.fn(async () => ({ state: 'empty', current: null, history: [] })),
  loadLabTab: vi.fn(async () => ({ state: 'empty', results: [] })),
  loadD365Tab: vi.fn(async () => ({ state: 'empty' })),
}));

vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...a: unknown[]) => hasPermission(...a),
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) => withOrgContext(action),
}));

vi.mock('../_actions/list-supplier-specs', () => ({ listSupplierSpecs: vi.fn(async () => ({ state: 'empty', specs: [] })) }));
vi.mock('../../_actions/supplier-spec-actions', () => ({
  createItemSupplierSpec: vi.fn(),
  deactivateItemSupplierSpec: vi.fn(),
  updateItemSupplierSpec: vi.fn(),
}));
vi.mock('../../_actions/upload-supplier-spec-doc', () => ({ uploadSupplierSpecDoc: vi.fn() }));
vi.mock('../../../../planning/suppliers/_actions/actions', () => ({
  listSuppliers: vi.fn(async () => ({ ok: false, error: 'persistence_failed' })),
}));
vi.mock('../../../../../../../../actions/reference/product-categories/list', () => ({
  listActiveProductCategories: vi.fn(async () => ({ ok: false, error: 'persistence_failed' })),
}));

// ── presentation stubs: keep only the routing panel + its injected action ──────
vi.mock('../_components/item-detail-tabs', () => ({
  ItemDetailTabs: ({ panels }: { panels: Record<string, React.ReactNode> }) => <div>{panels.routing}</div>,
}));
vi.mock('../_components/item-data-tabs', () => ({
  // Renders exactly what the page injected — nothing of its own.
  RoutingTab: ({ action }: { action?: React.ReactNode }) => <div data-testid="routing-tab">{action}</div>,
  BomTab: () => null,
  CostTab: () => null,
  LabTab: () => null,
  D365Tab: () => null,
  SupplierSpecsTab: () => null,
}));
vi.mock('../_components/item-detail-actions', () => ({ ItemDetailActions: () => null }));
vi.mock('../_components/item-overview-tab', () => ({ ItemOverviewTab: () => null }));
vi.mock('../_components/allergens-tab-server', () => ({ AllergensTabServer: () => null }));
vi.mock('../_components/nutrition-tab-server', () => ({ NutritionTabServer: () => null }));
vi.mock('../_components/supplier-spec-add.client', () => ({ SupplierSpecAdd: () => null }));
vi.mock('../_components/supplier-spec-row-actions.client', () => ({ SupplierSpecRowActions: () => null }));
vi.mock('../_components/allergen-labels', () => ({ buildAllergensTabLabels: vi.fn(async () => ({})) }));
vi.mock('../_components/nutrition-labels', () => ({ buildNutritionTabLabels: vi.fn(async () => ({})) }));
vi.mock('../_components/item-data-tab-labels', () => ({
  buildDataTabLabels: vi.fn(async () => ({
    bom: {}, cost: {}, routing: {}, lab: {}, d365: {}, supplier: {},
  })),
}));
// buildTransitionLabels/buildWizardLabels are SYNCHRONOUS (t in, bundle out) and
// the page calls them without await — an async mock would hand it a Promise.
vi.mock('../../_components/item-transition-labels', () => ({ buildTransitionLabels: vi.fn(() => ({})) }));
vi.mock('../../_components/item-wizard-labels', () => ({
  // `fields` must exist: the page writes wizardLabels.fields.listPriceGbp onto it.
  buildWizardLabels: vi.fn(() => ({
    fields: {},
    statusLabels: { active: 'Active' },
    typeLabels: { fg: 'Finished good' },
  })),
}));

vi.mock('next-intl/server', () => ({
  // Echoes the key back; `.has` false and `.raw` present mirror the next-intl
  // translator surface the page uses (t.has guards + t.raw for the {code}/{name}
  // placeholder strings in the deactivate bundle).
  getTranslations: vi.fn(async () => {
    const t = (key: string) => key;
    (t as { has: (key: string) => boolean }).has = () => false;
    (t as { raw: (key: string) => string }).raw = (key: string) => key;
    return t;
  }),
}));

const READY_ITEM = {
  state: 'ready' as const,
  item: { itemCode: ITEM_CODE, name: 'Night sausage', itemType: 'fg', status: 'active' },
  canEdit: true,
  canDeactivate: true,
};

async function renderPage(locale = 'pl') {
  const pageModule = await import('../page');
  const element = await pageModule.default({
    params: Promise.resolve({ locale, item_code: encodeURIComponent(ITEM_CODE) }),
  });
  render(element as React.ReactElement);
}

describe('technical/items/[item_code] — "+ New routing" CTA gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getItem.mockResolvedValue(READY_ITEM);
    loadRoutingTab.mockResolvedValue({ state: 'empty', routings: [], itemResolved: true });
    hasPermission.mockResolvedValue(true);
    withOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client: { query: vi.fn(async () => ({ rows: [] })) } }),
    );
  });

  it('renders the CTA, locale-prefixed and carrying this item code, when permitted', async () => {
    await renderPage('pl');

    const cta = screen.getByTestId('item-routing-new-cta');
    expect(cta).toHaveAttribute('href', `/pl/technical/routings?item=${encodeURIComponent(ITEM_CODE)}`);
  });

  it('prefixes the href with the active locale', async () => {
    await renderPage('en');

    expect(screen.getByTestId('item-routing-new-cta')).toHaveAttribute(
      'href',
      `/en/technical/routings?item=${encodeURIComponent(ITEM_CODE)}`,
    );
  });

  it('B-7: gates on the central hasPermission with the routing write permission', async () => {
    await renderPage();

    // Not a bespoke role_permissions query — the same helper createRouting() uses,
    // so owner/admin/org_admin and the platform admin get the CTA the server would
    // have honoured anyway.
    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, orgId: ORG_ID }),
      'technical.bom.create',
    );
  });

  it('hides the CTA when the caller lacks the routing write permission', async () => {
    hasPermission.mockResolvedValue(false);

    await renderPage();

    expect(screen.getByTestId('routing-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('item-routing-new-cta')).not.toBeInTheDocument();
  });

  it('B-8: hides the CTA when the loader could not resolve the item, even with permission', async () => {
    // The item vanished between getItem() and loadRoutingTab(). `state: 'empty'`
    // alone cannot express that, which is why itemResolved exists.
    loadRoutingTab.mockResolvedValue({ state: 'empty', routings: [], itemResolved: false });

    await renderPage();

    expect(hasPermission).toHaveBeenCalled();
    expect(screen.queryByTestId('item-routing-new-cta')).not.toBeInTheDocument();
  });

  it('B-8: treats an unknown itemResolved as unresolved rather than assuming success', async () => {
    loadRoutingTab.mockResolvedValue({ state: 'empty', routings: [] });

    await renderPage();

    expect(screen.queryByTestId('item-routing-new-cta')).not.toBeInTheDocument();
  });

  it('hides the CTA when the routing loader errored', async () => {
    loadRoutingTab.mockResolvedValue({ state: 'error', routings: [], itemResolved: false });

    await renderPage();

    expect(screen.queryByTestId('item-routing-new-cta')).not.toBeInTheDocument();
  });
});
