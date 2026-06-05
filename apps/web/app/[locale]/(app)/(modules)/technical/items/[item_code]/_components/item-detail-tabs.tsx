'use client';

/**
 * T-034 — TEC-012 Item Detail tabs container.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:354-477
 *   (`MaterialDetailScreen`, TEC-004 — PageHeader + `tabs-bar` + per-tab panels).
 *   The prototype's `tabs-bar` (lines 367-371) maps here to a tabs primitive
 *   composition; the PRD TEC-012 contract (docs/prd/03-TECHNICAL-PRD.md:630)
 *   extends the prototype's 5 tabs (overview/spec/suppliers/substitutes/cost) to
 *   the canonical 8 (overview / BOM / allergens / cost history / routing /
 *   supplier specs / lab results / D365 status). Overview is fully wired from the
 *   real item row; the remaining seven render the deferred-empty card until their
 *   owning slices land (each is its own cross-module surface), per the FA-detail
 *   shell pattern (fa-tabs.tsx).
 *
 * shadcn note: the repo's Radix re-export lives in `packages/ui` only; importing
 * `@radix-ui/*` from app code is a Foundation lint red-line. We therefore emit the
 * SAME shadcn/Radix Tabs DOM contract (data-slot="tabs"/"tabs-list"/
 * "tabs-trigger"/"tabs-content", role="tablist"/"tab"/"tabpanel", roving
 * tabindex, data-state) from app-owned primitives — verified by the RTL parity
 * checklist (no `.tabs-bar`, triggers are <button>, not raw <a>). Tab state lives
 * in the `?tab=` searchParam so the active tab is bookmarkable.
 */

import { useMemo, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const ITEM_DETAIL_TAB_SLUGS = [
  'overview',
  'bom',
  'allergens',
  'cost',
  'routing',
  'supplierSpecs',
  'labResults',
  'd365',
] as const;

export type ItemDetailTabSlug = (typeof ITEM_DETAIL_TAB_SLUGS)[number];

export type ItemDetailTabsLabels = {
  tablistLabel: string;
  tabs: Record<ItemDetailTabSlug, string>;
  deferred: string;
  deferredBody: string;
};

/** English fallbacks — keep the shell contract green when no labels passed. */
const DEFAULT_LABELS: ItemDetailTabsLabels = {
  tablistLabel: 'Item detail sections',
  tabs: {
    overview: 'Overview',
    bom: 'BOM',
    allergens: 'Allergens',
    cost: 'Cost history',
    routing: 'Routing',
    supplierSpecs: 'Supplier specs',
    labResults: 'Lab results',
    d365: 'D365 status',
  },
  deferred: 'Coming soon',
  deferredBody: 'This section is delivered in a later slice.',
};

/** Per-slug server-loaded tab bodies. Overview is always provided; others optional. */
export type ItemDetailTabPanels = Partial<Record<ItemDetailTabSlug, ReactNode>>;

type ItemDetailTabsProps = {
  itemCode: string;
  labels?: ItemDetailTabsLabels;
  panels?: ItemDetailTabPanels;
};

function isItemDetailTabSlug(value: string | null): value is ItemDetailTabSlug {
  return value !== null && (ITEM_DETAIL_TAB_SLUGS as readonly string[]).includes(value);
}

export function ItemDetailTabs({ itemCode, labels = DEFAULT_LABELS, panels }: ItemDetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab: ItemDetailTabSlug = isItemDetailTabSlug(urlTab) ? urlTab : 'overview';

  const tabs = useMemo(
    () =>
      ITEM_DETAIL_TAB_SLUGS.map((slug) => ({
        slug,
        label: labels.tabs[slug] ?? DEFAULT_LABELS.tabs[slug],
        tabId: `item-tab-${slug}`,
        panelId: `item-panel-${slug}`,
      })),
    [labels],
  );

  function persistTab(nextTab: ItemDetailTabSlug) {
    if (nextTab === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  function panelFor(slug: ItemDetailTabSlug): ReactNode {
    return panels && panels[slug] !== undefined ? panels[slug] : null;
  }

  return (
    <section aria-label={`Item ${itemCode} sections`} className="space-y-3">
      <div data-slot="tabs" data-value={activeTab} className="w-full">
        <div
          aria-label={labels.tablistLabel}
          className="tabs"
          style={{ overflowX: 'auto' }}
          data-slot="tabs-list"
          role="tablist"
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.slug;
            return (
              <button
                key={tab.slug}
                aria-controls={tab.panelId}
                aria-selected={selected}
                className={`tab${selected ? ' active' : ''}`}
                style={{ flex: '0 0 auto', background: 'transparent', border: 0, fontFamily: 'inherit' }}
                data-slot="tabs-trigger"
                data-state={selected ? 'active' : 'inactive'}
                data-value={tab.slug}
                id={tab.tabId}
                onClick={() => persistTab(tab.slug)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {tabs.map((tab) => {
          const selected = activeTab === tab.slug;
          const body = panelFor(tab.slug);
          return (
            <div
              key={tab.slug}
              aria-labelledby={tab.tabId}
              data-slot="tabs-content"
              data-state={selected ? 'active' : 'inactive'}
              data-value={tab.slug}
              hidden={!selected}
              id={tab.panelId}
              role="tabpanel"
              tabIndex={0}
            >
              {selected ? (
                body !== null ? (
                  <div className="mt-3">{body}</div>
                ) : (
                  <div className="card mt-3" style={{ padding: 0 }}>
                    <div className="empty-state">
                      <div className="empty-state-icon">🗂️</div>
                      <div className="empty-state-title">{labels.deferred}</div>
                      <div className="empty-state-body">{labels.deferredBody}</div>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ItemDetailTabs;
