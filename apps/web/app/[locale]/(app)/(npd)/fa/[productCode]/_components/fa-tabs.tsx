'use client';

/**
 * T-136 — FA detail tabs container (fa_detail prototype shell).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)
 *   The prototype's `subnav-inline` tab bar (lines 387-398) maps here to a tabs
 *   primitive composition. The prototype lists 12 tabs; this shell exposes the 8
 *   *department* tabs (Core/Planning/Commercial/Production/Technical/MRP/
 *   Procurement/History) PLUS the read-only BOM tab (SCR-03h, fa-screens.jsx:
 *   840-886, wired Lane 12) — inserted between Procurement and History per the
 *   prototype tab order. The remaining prototype tabs (Formulations/Risks/Docs)
 *   live in their own routes/slices and are out of scope here.
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
 *
 * T-105 dept wiring: the FA detail page server-loads each dept tab body (schema-
 * driven DeptColumns + the real product row) and hands them to `panels`. A slot
 * with a provided panel renders the real component; a slot left undefined keeps
 * the deferred-empty card. The Core-close gate (`coreDone`) locks Planning /
 * Commercial / Technical / Procurement, and `(coreDone && prodDone)` gates MRP —
 * matching the prototype TABS `locked` flags (fa-screens.jsx:312-325). Locked
 * triggers are disabled, carry a "Locked" badge, and never activate; if the URL
 * points at a locked tab we fall back to Core. Core + Production are never locked
 * (Production uses a per-field block inside FaProductionTab).
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
  'bom',
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
  bom: 'BOM',
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
  /** T-105: "Locked" badge on gated triggers (prototype lines 395). */
  locked?: string;
};

const DEFAULT_LABELS: FaTabsLabels = {
  tablistLabel: 'FA detail departments',
  tabs: DEFAULT_TAB_LABELS,
  deferred: 'Tab content deferred',
  deferredBody: 'This department workspace is delivered in a later slice.',
  locked: 'Locked',
};

/** T-105: per-slug server-loaded dept tab bodies (FaCoreTab, FaPlanningTab, …). */
export type FaTabPanels = Partial<Record<FaTabSlug, ReactNode>>;

type FaTabsProps = {
  productCode: string;
  /** Localized labels resolved server-side (npd.faDetail). Optional: English fallback. */
  labels?: FaTabsLabels;
  /**
   * T-105: real dept tab bodies keyed by slug. Each provided slot replaces the
   * deferred-empty placeholder; omitted slots keep the placeholder.
   */
  panels?: FaTabPanels;
  /**
   * T-027 back-compat: standalone History panel. When `panels.history` is not
   * given this still wires the History slot. (The page may pass either.)
   */
  historyPanel?: ReactNode;
  /** Core-close gate ('closed_core' === 'Yes') — unlocks dept tabs. */
  coreDone?: boolean;
  /** Production-close gate ('closed_production' === 'Yes') — unlocks MRP. */
  prodDone?: boolean;
};

function isFaTabSlug(value: string | null): value is FaTabSlug {
  return value !== null && (FA_TAB_SLUGS as readonly string[]).includes(value);
}

/**
 * T-105 lock model — 1:1 with prototype TABS (fa-screens.jsx:312-325):
 *   core/production → never locked; planning/commercial/technical/procurement →
 *   locked when !coreDone; mrp → locked when (!coreDone || !prodDone); history →
 *   never locked.
 */
function isTabLocked(slug: FaTabSlug, coreDone: boolean, prodDone: boolean): boolean {
  switch (slug) {
    case 'planning':
    case 'commercial':
    case 'technical':
    case 'procurement':
      return !coreDone;
    case 'mrp':
      return !coreDone || !prodDone;
    default:
      return false;
  }
}

export function FaTabs({
  productCode,
  labels = DEFAULT_LABELS,
  panels,
  historyPanel,
  coreDone = false,
  prodDone = false,
}: FaTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const requestedTab: FaTabSlug = isFaTabSlug(urlTab) ? urlTab : 'core';
  // Never honor a deep-link to a locked tab — fall back to Core.
  const activeTab: FaTabSlug = isTabLocked(requestedTab, coreDone, prodDone)
    ? 'core'
    : requestedTab;

  const lockedLabel = labels.locked ?? DEFAULT_LABELS.locked ?? 'Locked';

  const tabs = useMemo(
    () =>
      FA_TAB_SLUGS.map((slug) => ({
        slug,
        label: labels.tabs[slug] ?? DEFAULT_TAB_LABELS[slug],
        tabId: `fa-tab-${slug}`,
        panelId: `fa-panel-${slug}`,
        locked: isTabLocked(slug, coreDone, prodDone),
      })),
    [labels, coreDone, prodDone],
  );

  function persistTab(nextTab: FaTabSlug) {
    if (nextTab === activeTab) return;
    if (isTabLocked(nextTab, coreDone, prodDone)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  /** Resolve the real body for a slot (panels first, then historyPanel compat). */
  function panelFor(slug: FaTabSlug): ReactNode {
    if (panels && panels[slug] !== undefined) return panels[slug];
    if (slug === 'history' && historyPanel) return historyPanel;
    return null;
  }

  return (
    <section aria-label={`Finished Good ${productCode} departments`} className="space-y-3">
      <div data-slot="tabs" data-value={activeTab} className="w-full">
        <div
          aria-label={labels.tablistLabel}
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
          data-slot="tabs-list"
          role="tablist"
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.slug;
            const baseClass = selected
              ? 'rounded-md bg-[var(--blue)] px-3 py-2 text-sm font-semibold text-white'
              : 'rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--gray-050)]';
            const lockedClass = tab.locked
              ? ' cursor-not-allowed opacity-50 hover:bg-white'
              : '';
            return (
              <button
                key={tab.slug}
                aria-controls={tab.panelId}
                aria-selected={selected}
                className={`${baseClass}${lockedClass} inline-flex items-center gap-1.5`}
                data-slot="tabs-trigger"
                data-state={selected ? 'active' : 'inactive'}
                data-value={tab.slug}
                data-locked={tab.locked ? 'true' : undefined}
                disabled={tab.locked}
                id={tab.tabId}
                onClick={() => persistTab(tab.slug)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                title={tab.locked ? lockedLabel : undefined}
                type="button"
              >
                {tab.label}
                {tab.locked ? (
                  <span
                    aria-hidden="true"
                    className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600"
                    data-testid={`fa-tab-locked-${tab.slug}`}
                  >
                    {lockedLabel}
                  </span>
                ) : null}
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
