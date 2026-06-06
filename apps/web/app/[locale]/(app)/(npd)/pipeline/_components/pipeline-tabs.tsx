'use client';

/**
 * T-130 — Pipeline tabbed view switcher (Kanban | Table | Split).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:133-208
 *   (the Pipeline page wrapper: filter pills 188-195 + view-mode pills 197-201
 *    + the conditional KanbanView / TableView / SplitView render 214-220)
 *
 * Translation notes (prototype-index-npd.json#pipeline):
 *   - "3 view modes (kanban/table/split) → URL param ?view=kanban|table|split;
 *      KanbanView / TableView / SplitView imported as separate Client Components"
 *      → the view-mode pills (lines 197-201) become an accessible role="tablist"
 *      of role="tab" buttons. The active tab is DRIVEN BY the URL ?view= param
 *      (default kanban). Switching calls router.push (client navigation, NO full
 *      reload) and PRESERVES the other shared params (?filter/?sort/?dir/?selected).
 *      No `@radix-ui/react-tabs` Tabs primitive is exported from @monopilot/ui, and
 *      this task may not edit packages/ui; the prototype's own switcher is plain
 *      `<button className="pill">` (not radix), so a hand-rolled WAI-ARIA tablist is
 *      the faithful, dependency-clean match (documented in the closeout deviations).
 *   - "Filter pills (all/mine/brief/recipe/trial/approval) → URL param ?filter="
 *      → a shared filter strip (role="group") above the tabs. The legacy stage
 *      filters (brief/recipe/trial/approval) map to the merged Stage-Gate model
 *      gates (G0..G4); "mine" is owner-scoped server-side. Updating a chip pushes
 *      ?filter= and ALL THREE views consume the SAME filtered list — the filter /
 *      sort / selection state lives ONLY in the URL (never duplicated per view).
 *   - "window.NPD_PROJECTS in-memory filter → Server Component query ... URL params"
 *      → the RSC (page.tsx) reads ?filter/?search and passes the already org-scoped,
 *      RLS-enforced projects (merged listProjects, T-057). This wrapper never fetches
 *      and never mutates parent state — it only reflects/writes URL search params.
 *
 * RBAC: `canAdvance` is resolved server-side (page.tsx) and forwarded to the Kanban
 * view unchanged; it is never recomputed or trusted from the client session.
 */

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { KanbanView } from './kanban-view';
import { TableView, type TableLabels, type TableProject } from './table-view';
import { SplitView } from './split-view';
import type { SplitLabels } from './split-labels';
import type {
  AdvanceAction,
  KanbanLabels,
  KanbanProject,
  PageState,
} from './kanban-types';

export type PipelineView = 'kanban' | 'table' | 'split';

const VIEWS: PipelineView[] = ['kanban', 'table', 'split'];

/** View-mode glyphs mirror the prototype's ▦ / ≡ / ⊟ affordances (pipeline.jsx:197-201). */
const VIEW_GLYPH: Record<PipelineView, string> = { kanban: '▦', table: '≡', split: '⊟' };

/** KPI strip copy — keyed under the NEW npd.pipelineKpi namespace. */
export type PipelineKpiLabels = {
  activeLabel: string;
  activeHint: string;
  awaitingLabel: string;
  awaitingHint: string;
  launchedLabel: string;
  launchedHint: string;
  atRiskLabel: string;
  atRiskHint: string;
  totalLabel: string;
  totalHint: string;
};

export type FilterKey = 'all' | 'mine' | 'G0' | 'G1' | 'G2' | 'G3' | 'G4';

const FILTERS: FilterKey[] = ['all', 'mine', 'G0', 'G1', 'G2', 'G3', 'G4'];

/** Switcher-specific copy — keyed under the NEW npd.pipelineSwitcher namespace. */
export type PipelineTabsLabels = {
  viewsLabel: string;
  tabKanban: string;
  tabTable: string;
  tabSplit: string;
  filtersLabel: string;
  filterAll: string;
  filterMine: string;
  filterG0: string;
  filterG1: string;
  filterG2: string;
  filterG3: string;
  filterG4: string;
  searchLabel: string;
  searchPlaceholder: string;
  newProject: string;
  importRecipe: string;
};

function parseView(raw: string | null): PipelineView {
  return raw && (VIEWS as string[]).includes(raw) ? (raw as PipelineView) : 'kanban';
}

function parseFilter(raw: string | null): FilterKey {
  return raw && (FILTERS as string[]).includes(raw) ? (raw as FilterKey) : 'all';
}

function viewLabel(view: PipelineView, labels: PipelineTabsLabels): string {
  switch (view) {
    case 'table':
      return labels.tabTable;
    case 'split':
      return labels.tabSplit;
    default:
      return labels.tabKanban;
  }
}

function filterLabel(filter: FilterKey, labels: PipelineTabsLabels): string {
  switch (filter) {
    case 'mine':
      return labels.filterMine;
    case 'G0':
      return labels.filterG0;
    case 'G1':
      return labels.filterG1;
    case 'G2':
      return labels.filterG2;
    case 'G3':
      return labels.filterG3;
    case 'G4':
      return labels.filterG4;
    default:
      return labels.filterAll;
  }
}

export type PipelineTabsProps = {
  /** Org-scoped, RLS-enforced, already-filtered projects from the RSC (T-057). */
  projects: KanbanProject[];
  switcherLabels: PipelineTabsLabels;
  kpiLabels?: PipelineKpiLabels;
  kanbanLabels: KanbanLabels;
  tableLabels: TableLabels;
  splitLabels: SplitLabels;
  /** Server-resolved RBAC gate (never client-trusted). */
  canAdvance: boolean;
  state?: PageState;
  /** Merged advanceProjectGate Server Action (page.tsx) or a test stub. */
  advanceAction: AdvanceAction;
};

export function PipelineTabs({
  projects,
  switcherLabels,
  kpiLabels,
  kanbanLabels,
  tableLabels,
  splitLabels,
  canAdvance,
  state = 'ready',
  advanceAction,
}: PipelineTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeView = parseView(searchParams.get('view'));
  const activeFilter = parseFilter(searchParams.get('filter'));
  const searchValue = searchParams.get('search') ?? '';

  /** Mutate one URL param while preserving every other shared param (?sort/?dir/?selected/…). */
  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      router.push(query ? `?${query}` : '?');
    },
    [router, searchParams],
  );

  const selectView = React.useCallback(
    (view: PipelineView) => setParam('view', view),
    [setParam],
  );

  const selectFilter = React.useCallback(
    (filter: FilterKey) => setParam('filter', filter === 'all' ? null : filter),
    [setParam],
  );

  // Roving keyboard support on the tablist (Left/Right/Home/End) per WAI-ARIA.
  const onTablistKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = VIEWS.indexOf(activeView);
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % VIEWS.length;
      else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + VIEWS.length) % VIEWS.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = VIEWS.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      selectView(VIEWS[nextIndex]!);
    },
    [activeView, selectView],
  );

  // TableProject and KanbanProject are structurally identical projections of the
  // merged ProjectSummary — the same shared list feeds every view (AC2).
  const tableProjects = projects as unknown as TableProject[];

  // KPI counters derived from the REAL, org-scoped project list (no hard-coded numbers).
  const kpiActive = projects.filter((p) => p.currentGate !== 'Launched').length;
  const kpiAwaiting = projects.filter((p) => p.currentGate === 'G3' || p.currentGate === 'G4').length;
  const kpiLaunched = projects.filter((p) => p.currentGate === 'Launched').length;
  const kpiAtRisk = projects.filter((p) => p.prio === 'high' && p.progressPercent < 50).length;
  const kpiTotal = projects.length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-6" data-testid="pipeline-tabs">
      {/* Page head — title + the New project / Import recipe CTAs (pipeline.jsx:152-163). */}
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" data-testid="pipeline-import-recipe">
            {switcherLabels.importRecipe}
          </button>
          <button type="button" className="btn btn-primary" data-testid="pipeline-new-project">
            + {switcherLabels.newProject}
          </button>
        </div>
      </div>

      {/* KPI strip — 5 accent cards reflecting the live, filtered pipeline (pipeline.jsx:165-191). */}
      {kpiLabels ? (
        <div className="kpi-row" data-testid="pipeline-kpi-row">
          <div className="kpi">
            <div className="kpi-label">{kpiLabels.activeLabel}</div>
            <div className="kpi-value">{kpiActive}</div>
            <div className="kpi-change muted">{kpiLabels.activeHint}</div>
          </div>
          <div className="kpi amber">
            <div className="kpi-label">{kpiLabels.awaitingLabel}</div>
            <div className="kpi-value">{kpiAwaiting}</div>
            <div className="kpi-change muted">{kpiLabels.awaitingHint}</div>
          </div>
          <div className="kpi green">
            <div className="kpi-label">{kpiLabels.launchedLabel}</div>
            <div className="kpi-value">{kpiLaunched}</div>
            <div className="kpi-change muted">{kpiLabels.launchedHint}</div>
          </div>
          <div className="kpi red">
            <div className="kpi-label">{kpiLabels.atRiskLabel}</div>
            <div className="kpi-value">{kpiAtRisk}</div>
            <div className="kpi-change muted">{kpiLabels.atRiskHint}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">{kpiLabels.totalLabel}</div>
            <div className="kpi-value">{kpiTotal}</div>
            <div className="kpi-change muted">{kpiLabels.totalHint}</div>
          </div>
        </div>
      ) : null}

      {/* Shared filter strip + search — drives ?filter / ?search for every view. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={switcherLabels.filtersLabel}
          className="pills"
        >
          {FILTERS.map((filter) => {
            const pressed = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                data-testid={`pipeline-filter-${filter}`}
                aria-pressed={pressed}
                onClick={() => selectFilter(filter)}
                className={pressed ? 'pill on' : 'pill'}
              >
                {filterLabel(filter, switcherLabels)}
              </button>
            );
          })}
        </div>

        <div className="w-full max-w-xs">
          <input
            type="search"
            className="form-input"
            aria-label={switcherLabels.searchLabel}
            placeholder={switcherLabels.searchPlaceholder}
            data-testid="pipeline-search"
            defaultValue={searchValue}
            onChange={(event) => setParam('search', event.currentTarget.value)}
          />
        </div>
      </div>

      {/* View-mode switcher — WAI-ARIA tablist styled with the design-system pills. */}
      <div
        role="tablist"
        aria-label={switcherLabels.viewsLabel}
        onKeyDown={onTablistKeyDown}
        className="pills"
      >
        {VIEWS.map((view) => {
          const selected = activeView === view;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              id={`pipeline-tab-${view}`}
              aria-selected={selected}
              aria-controls="pipeline-tabpanel"
              tabIndex={selected ? 0 : -1}
              data-testid={`pipeline-tab-${view}`}
              onClick={() => selectView(view)}
              className={selected ? 'pill on' : 'pill'}
            >
              <span aria-hidden="true" style={{ marginRight: 4 }}>
                {VIEW_GLYPH[view]}
              </span>
              {viewLabel(view, switcherLabels)}
            </button>
          );
        })}
      </div>

      <div
        id="pipeline-tabpanel"
        role="tabpanel"
        aria-labelledby={`pipeline-tab-${activeView}`}
        data-active-view={activeView}
      >
        {activeView === 'kanban' ? (
          <KanbanView
            projects={projects}
            labels={kanbanLabels}
            canAdvance={canAdvance}
            state={state}
            advanceAction={advanceAction}
          />
        ) : null}

        {activeView === 'table' ? (
          <TableView projects={tableProjects} labels={tableLabels} state={state} />
        ) : null}

        {activeView === 'split' ? (
          <SplitView projects={projects} labels={splitLabels} state={state} />
        ) : null}
      </div>
    </div>
  );
}

export default PipelineTabs;
