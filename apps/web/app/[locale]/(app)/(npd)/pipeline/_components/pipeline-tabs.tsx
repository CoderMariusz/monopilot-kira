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
import { TableView, type BulkActions, type TableLabels, type TableProject } from './table-view';
import { SplitView } from './split-view';
import type { SplitLabels } from './split-labels';
import {
  ProjectCreateModal,
  type CreateProjectAction,
  type ProjectCreateLabels,
} from './project-create-modal';
import {
  normalizeStage,
  type AdvanceAction,
  type KanbanLabels,
  type KanbanProject,
  type PageState,
  type ProjectStage,
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
  avgTimeLabel: string;
  avgTimeHint: string;
  avgTimeUnit: string;
  empty: string;
};

/**
 * Filter chips — All / Mine / Brief / Recipe / Trial / Approval (pipeline.jsx:188-194).
 * Stage chips map to `current_stage`; "mine" is owner-scoped server-side (?filter=mine);
 * the stage chips filter the already-loaded, org-scoped list client-side.
 */
export type FilterKey = 'all' | 'mine' | 'brief' | 'recipe' | 'trial' | 'approval';

const FILTERS: FilterKey[] = ['all', 'mine', 'brief', 'recipe', 'trial', 'approval'];

const STAGE_FILTER_KEYS: ProjectStage[] = ['brief', 'recipe', 'trial', 'approval'];

/** Switcher-specific copy — keyed under the NEW npd.pipelineSwitcher namespace. */
export type PipelineTabsLabels = {
  viewsLabel: string;
  tabKanban: string;
  tabTable: string;
  tabSplit: string;
  filtersLabel: string;
  filterAll: string;
  filterMine: string;
  filterBrief: string;
  filterRecipe: string;
  filterTrial: string;
  filterApproval: string;
  searchLabel: string;
  searchPlaceholder: string;
  newProject: string;
  importRecipe: string;
  importRecipeDisabledHint: string;
  pageTitle: string;
  pageSubtitle: string;
  breadcrumbRoot: string;
  breadcrumbCurrent: string;
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
    case 'brief':
      return labels.filterBrief;
    case 'recipe':
      return labels.filterRecipe;
    case 'trial':
      return labels.filterTrial;
    case 'approval':
      return labels.filterApproval;
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
  /** Bulk table Server Actions, resolved by the RSC page. */
  bulkActions?: BulkActions;
  /** Server-resolved RBAC gate for creating projects (never client-trusted). */
  canCreate?: boolean;
  /**
   * Merged createProject Server Action (T-057), injected by page.tsx ONLY when
   * `canCreate` is true. Undefined disables the create form (no client bypass).
   */
  createAction?: CreateProjectAction;
  projectCreateLabels?: ProjectCreateLabels;
  /** Test seam: open the create modal on mount. */
  initialCreateOpen?: boolean;
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
  bulkActions,
  canCreate = false,
  createAction,
  projectCreateLabels,
  initialCreateOpen = false,
}: PipelineTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeView = parseView(searchParams.get('view'));
  const activeFilter = parseFilter(searchParams.get('filter'));
  const searchValue = searchParams.get('search') ?? '';

  const [createOpen, setCreateOpen] = React.useState(initialCreateOpen);

  const onProjectCreated = React.useCallback(
    (projectId: string) => {
      setCreateOpen(false);
      // Resolve the locale from the first path segment (e.g. /en/pipeline).
      const segments = (typeof window !== 'undefined' ? window.location.pathname : '/en/pipeline')
        .split('/')
        .filter(Boolean);
      const locale = segments[0] ?? 'en';
      router.push(`/${locale}/pipeline/${projectId}`);
    },
    [router],
  );

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

  // Stage filter (Brief/Recipe/Trial/Approval) applied client-side over the already
  // org-scoped, RLS-enforced list ("mine" is owner-scoped server-side via ?filter=mine).
  const visibleProjects = React.useMemo(() => {
    if ((STAGE_FILTER_KEYS as string[]).includes(activeFilter)) {
      return projects.filter((p) => normalizeStage(p.currentStage) === (activeFilter as ProjectStage));
    }
    return projects;
  }, [projects, activeFilter]);

  // TableProject and KanbanProject are structurally identical projections of the
  // merged ProjectSummary — the same shared list feeds every view (AC2).
  const tableProjects = visibleProjects as unknown as TableProject[];

  // ── KPI counters (real, org-scoped data — no hard-coded numbers) ──
  // KPIs reflect the WHOLE org pipeline, not the current stage filter.
  const currentYear = new Date().getUTCFullYear();
  const isLaunched = (p: KanbanProject) => p.currentGate === 'Launched';
  // Active = in gates G0..G4 (not Launched).
  const kpiActive = projects.filter((p) => !isLaunched(p)).length;
  // Awaiting approval = at gate G3 or G4.
  const kpiAwaiting = projects.filter((p) => p.currentGate === 'G3' || p.currentGate === 'G4').length;
  // Launched YTD = Launched AND created (proxy for launched) this calendar year.
  const kpiLaunched = projects.filter((p) => {
    if (!isLaunched(p)) return false;
    const created = p.createdAt ? new Date(p.createdAt) : null;
    return created != null && !Number.isNaN(created.getTime()) && created.getUTCFullYear() === currentYear;
  }).length;
  // At risk = high priority AND behind (low progress OR past its target launch date).
  const todayIso = new Date().toISOString().slice(0, 10);
  const kpiAtRisk = projects.filter((p) => {
    if (p.prio !== 'high' || isLaunched(p)) return false;
    const behindProgress = p.progressPercent < 50;
    const pastTarget = p.targetLaunch != null && p.targetLaunch < todayIso;
    return behindProgress || pastTarget;
  }).length;
  // Avg time to launch = avg(created → today) over launched projects, in days ("—" if none).
  const launchedWithDates = projects.filter((p) => isLaunched(p) && p.createdAt);
  const avgDays =
    launchedWithDates.length > 0
      ? Math.round(
          launchedWithDates.reduce((sum, p) => {
            const created = new Date(p.createdAt as string).getTime();
            return sum + Math.max(0, (Date.now() - created) / 86_400_000);
          }, 0) / launchedWithDates.length,
        )
      : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-6" data-testid="pipeline-tabs">
      {/* Page head — breadcrumb + title + subtitle + the Import recipe / New project
          CTAs (pipeline.jsx:144-156). */}
      <header className="flex flex-wrap items-start justify-between gap-4" data-region="page-head">
        <div>
          <nav aria-label="breadcrumb" className="breadcrumb">
            {switcherLabels.breadcrumbRoot} / {switcherLabels.breadcrumbCurrent}
          </nav>
          <h1 className="page-title" style={{ marginTop: 2 }}>
            {switcherLabels.pageTitle}
          </h1>
          <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>
            {switcherLabels.pageSubtitle}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Import recipe has no backend yet — disabled no-op with an explanatory
              tooltip (we never fake an action). */}
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="pipeline-import-recipe"
            disabled
            aria-disabled="true"
            title={switcherLabels.importRecipeDisabledHint}
          >
            {switcherLabels.importRecipe}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="pipeline-new-project"
            disabled={!canCreate}
            aria-disabled={!canCreate || undefined}
            onClick={() => setCreateOpen(true)}
          >
            + {switcherLabels.newProject}
          </button>
        </div>
      </header>

      {/* KPI strip — 5 accent cards reflecting the live org pipeline (pipeline.jsx:158-184). */}
      {kpiLabels ? (
        <div className="kpi-row" data-testid="pipeline-kpi-row">
          <div className="kpi">
            <div className="kpi-label">{kpiLabels.activeLabel}</div>
            <div className="kpi-value" data-testid="kpi-active">{kpiActive}</div>
            <div className="kpi-change muted">{kpiLabels.activeHint}</div>
          </div>
          <div className="kpi amber">
            <div className="kpi-label">{kpiLabels.awaitingLabel}</div>
            <div className="kpi-value" data-testid="kpi-awaiting">{kpiAwaiting}</div>
            <div className="kpi-change muted">{kpiLabels.awaitingHint}</div>
          </div>
          <div className="kpi green">
            <div className="kpi-label">{kpiLabels.launchedLabel}</div>
            <div className="kpi-value" data-testid="kpi-launched">{kpiLaunched}</div>
            <div className="kpi-change muted">{kpiLabels.launchedHint}</div>
          </div>
          <div className="kpi red">
            <div className="kpi-label">{kpiLabels.atRiskLabel}</div>
            <div className="kpi-value" data-testid="kpi-at-risk">{kpiAtRisk}</div>
            <div className="kpi-change muted">{kpiLabels.atRiskHint}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">{kpiLabels.avgTimeLabel}</div>
            <div className="kpi-value" data-testid="kpi-avg-time">
              {avgDays === null ? (
                kpiLabels.empty
              ) : (
                <>
                  {avgDays}
                  <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>
                    {' '}
                    {kpiLabels.avgTimeUnit}
                  </span>
                </>
              )}
            </div>
            <div className="kpi-change muted">{kpiLabels.avgTimeHint}</div>
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
            projects={visibleProjects}
            labels={kanbanLabels}
            canAdvance={canAdvance}
            state={state}
            advanceAction={advanceAction}
          />
        ) : null}

        {activeView === 'table' ? (
          <TableView projects={tableProjects} labels={tableLabels} state={state} bulkActions={bulkActions} />
        ) : null}

        {activeView === 'split' ? (
          <SplitView projects={visibleProjects} labels={splitLabels} state={state} />
        ) : null}
      </div>

      {/* Create-project modal — mounted INLINE in the same client island as the
          "+ New project" trigger (robust on first paint; the FA-create NF fix).
          RBAC: the Server Action is injected only when canCreate is true. */}
      {projectCreateLabels ? (
        <ProjectCreateModal
          open={createOpen}
          labels={projectCreateLabels}
          createAction={canCreate ? createAction : undefined}
          onCreated={onProjectCreated}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default PipelineTabs;
