'use client';

/**
 * T-136 — FA detail tabs container (fa_detail prototype shell).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)
 *   The prototype's `subnav-inline` tab bar (lines 387-398) maps here to a tabs
 *   primitive composition. The prototype lists 12 tabs; this shell exposes the 8
 *   *department* tabs (Core/Planning/Commercial/Production/Technical/MRP/
 *   Procurement/History) per the task contract — the extra prototype tabs (BOM/
 *   Formulations/Risks/Docs) live in their own routes/slices and are out of scope.
 *
 * shadcn note: the repo's Radix re-export lives in `packages/ui` only; importing
 * `@radix-ui/*` from app code is a Foundation lint red-line. We therefore emit
 * the SAME shadcn/Radix Tabs DOM contract (data-slot="tabs"/"tabs-list"/
 * "tabs-trigger"/"tabs-content", role="tablist"/"tab"/"tabpanel", roving
 * tabindex, data-state) from app-owned primitives — verified by the RTL parity
 * checklist (no `.subnav-inline`, triggers are <button>, not raw <a>).
 *
 * T-027 history slot: when `historyPanel` is provided it replaces the
 * deferred-empty placeholder for the History panel ONLY; every other panel keeps
 * the deferred-empty card. Omitting it preserves the prior shell behavior.
 */

import { useMemo, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';

const FA_TAB_SLUGS = [
  'core',
  'planning',
  'commercial',
  'production',
  'technical',
  'mrp',
  'procurement',
  'history',
] as const;

export type FaTabSlug = (typeof FA_TAB_SLUGS)[number];

/** English fallbacks — keep the shell test contract green when no labels passed. */
const DEFAULT_TAB_LABELS: Record<FaTabSlug, string> = {
  core: 'Core',
  planning: 'Planning',
  commercial: 'Commercial',
  production: 'Production',
  technical: 'Technical',
  mrp: 'MRP',
  procurement: 'Procurement',
  history: 'History',
};

export type FaTabsLabels = {
  /** aria-label for the tablist region. */
  tablistLabel: string;
  /** Per-slug visible tab labels. */
  tabs: Record<FaTabSlug, string>;
  /** Deferred-empty placeholder heading + body. */
  deferred: string;
  deferredBody: string;
};

const DEFAULT_LABELS: FaTabsLabels = {
  tablistLabel: 'FA detail departments',
  tabs: DEFAULT_TAB_LABELS,
  deferred: 'Tab content deferred',
  deferredBody: 'This department workspace is delivered in a later slice.',
};

type FaTabsProps = {
  productCode: string;
  /** Localized labels resolved server-side (npd.faDetail). Optional: English fallback. */
  labels?: FaTabsLabels;
  /**
   * T-027: real History tab content (server-loaded FaHistoryTab). When provided
   * it replaces the deferred-empty placeholder for the History panel ONLY.
   */
  historyPanel?: ReactNode;
};

function isFaTabSlug(value: string | null): value is FaTabSlug {
  return value !== null && (FA_TAB_SLUGS as readonly string[]).includes(value);
}

export function FaTabs({ productCode, labels = DEFAULT_LABELS, historyPanel }: FaTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab: FaTabSlug = isFaTabSlug(urlTab) ? urlTab : 'core';

  const tabs = useMemo(
    () =>
      FA_TAB_SLUGS.map((slug) => ({
        slug,
        label: labels.tabs[slug] ?? DEFAULT_TAB_LABELS[slug],
        tabId: `fa-tab-${slug}`,
        panelId: `fa-panel-${slug}`,
      })),
    [labels],
  );

  function persistTab(nextTab: FaTabSlug) {
    if (nextTab === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <section aria-label={`Factory Article ${productCode} departments`} className="space-y-3">
      <div data-slot="tabs" data-value={activeTab} className="w-full">
        <div
          aria-label={labels.tablistLabel}
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
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
                className={
                  selected
                    ? 'rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white'
                    : 'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
                }
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
                tab.slug === 'history' && historyPanel ? (
                  <div className="mt-3">{historyPanel}</div>
                ) : (
                  <Card className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <CardHeader className="font-semibold text-slate-900">{tab.label}</CardHeader>
                    <CardContent className="mt-1">
                      {labels.deferred} — {labels.deferredBody}
                    </CardContent>
                  </Card>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FaTabs;
