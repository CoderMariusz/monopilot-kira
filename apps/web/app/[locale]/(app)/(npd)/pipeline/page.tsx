/**
 * T-059 — Pipeline Kanban page (NPD Stage-Gate pipeline).
 *
 * Server Component. Reads REAL, org-scoped projects from public.npd_projects via
 * the MERGED `listProjects` Server Action (T-057) — RLS-enforced as app_user with
 * app.current_org_id(). No mocks, no hard-coded rows. The gate move is wired to the
 * MERGED `advanceProjectGate` Server Action (T-058), passed as a prop to the client
 * Kanban (adjacency-guarded; 422 ADJACENCY_VIOLATION → optimistic revert in the UI).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:19-52 (KanbanCard + KanbanView)
 *
 * Conflict deviation (closeout deviation log): the canonical KanbanView prototype is
 * @deprecated (legacy R&D stage model, read-only). The production board is the
 * Stage-Gate model (G0..Launched) and the gate move is the merged advanceProjectGate
 * action; the prototype's onClick(open) drag is translated to an explicit, accessible
 * "Advance" affordance (not @dnd-kit drag, which is not a workspace dependency).
 *
 * RBAC (server-side, never client-trusted):
 *   - read gate    → npd.project.view  (PROJECT_VIEW_PERMISSION; mirrors listProjects)
 *   - canAdvance   → npd.gate.advance  (GATE_ADVANCE_PERMISSION)
 */

import { getTranslations } from 'next-intl/server';

import { advanceProjectGate } from '../../../../(npd)/pipeline/_actions/advance-project-gate';
import {
  bulkAssignOwner,
  bulkMoveGate,
  bulkSetPriority,
} from '../../../../(npd)/pipeline/_actions/bulk-update-projects';
import { listProjects, type ListProjectsInput } from '../../../../(npd)/pipeline/_actions/list-projects';
import { GATE_ADVANCE_PERMISSION } from '../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import {
  PROJECT_CREATE_PERMISSION,
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
  type ProjectSummary,
} from '../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import { PipelineTabs, type PipelineTabsLabels, type PipelineKpiLabels } from './_components/pipeline-tabs';
import type { BulkActions, TableLabels } from './_components/table-view';
import type { SplitLabels } from './_components/split-labels';
import {
  normalizeStage,
  type AdvanceInput,
  type AdvanceResult,
  type KanbanLabels,
  type KanbanProject,
  type PageState,
} from './_components/kanban-types';

export const dynamic = 'force-dynamic';

type RawSearchParams = Record<string, string | string[] | undefined>;

type PipelinePageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<RawSearchParams>;
  // Test-only injection seam (mirrors briefs/fa page convention).
  projects?: KanbanProject[];
  canAdvance?: boolean;
  canCreate?: boolean;
  state?: PageState;
};

type LoaderResult = {
  state: PageState;
  projects: KanbanProject[];
  canAdvance: boolean;
  canCreate: boolean;
};

/** Filter chips (URL ?filter=) — maps to the merged listProjects gate/owner args. */
type PipelineFilter = 'all' | 'mine' | 'G0' | 'G1' | 'G2' | 'G3' | 'G4';

const GATE_FILTERS: ProjectGate[] = ['G0', 'G1', 'G2', 'G3', 'G4'];

function readParam(params: RawSearchParams | undefined, key: string): string | undefined {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseFilter(raw: string | undefined): PipelineFilter {
  if (raw === 'mine') return 'mine';
  if (raw && (GATE_FILTERS as string[]).includes(raw)) return raw as PipelineFilter;
  return 'all';
}

const DEFAULT_LABELS: KanbanLabels = {
  title: 'Pipeline',
  subtitle: 'Stage-Gate pipeline — projects by stage',
  stageBrief: 'Brief',
  stageRecipe: 'Recipe',
  stagePackaging: 'Packaging',
  stageTrial: 'Trial',
  stageSensory: 'Sensory',
  stagePilot: 'Pilot',
  stageApproval: 'Approval',
  stageHandoff: 'Handoff',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  advance: 'Advance →',
  advancing: 'Advancing…',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  columnEmpty: '—',
  open: 'Open',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  error: 'Unable to load the pipeline. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the pipeline.',
  advanceError: 'Could not advance the project. The change was reverted.',
  adjacencyError: 'Projects can only advance to the next gate. The change was reverted.',
};

const DEFAULT_TABLE_LABELS: TableLabels = {
  title: 'Pipeline',
  caption: 'NPD projects',
  colCode: 'Code',
  colName: 'Name',
  colType: 'Type',
  colGate: 'Current Gate',
  colPriority: 'Priority',
  colOwner: 'Owner',
  colTarget: 'Target Launch',
  colProgress: 'Progress',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  sortAsc: 'sorted ascending',
  sortDesc: 'sorted descending',
  sortNone: 'not sorted',
  selectAll: 'Select all',
  selectRow: 'Select row',
  selectedCount: '{count} selected',
  bulkAssignOwner: 'Assign owner',
  bulkSetPriority: 'Set priority',
  bulkMoveGate: 'Move gate',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  error: 'Unable to load the pipeline. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const DEFAULT_SPLIT_LABELS: SplitLabels = {
  title: 'Pipeline',
  subtitle: 'Split view — list + project detail',
  colCode: 'Project',
  colName: 'Name',
  colType: 'Type',
  colGate: 'Gate',
  colOwner: 'Owner',
  colProgress: 'Progress',
  colTarget: 'Target',
  colPrio: 'Prio',
  listLabel: 'Projects',
  detailLabel: 'Project detail',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  fieldOwner: 'Owner',
  fieldGate: 'Gate',
  fieldCreated: 'Created',
  fieldTarget: 'Target launch',
  fieldType: 'Type',
  progress: 'Progress',
  recentActivity: 'Recent activity',
  noActivity: 'No recent activity',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  openProject: 'Open project →',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  emptyDetail: 'Select a project to see its detail.',
  error: 'Unable to load the pipeline. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const DEFAULT_SWITCHER_LABELS: PipelineTabsLabels = {
  viewsLabel: 'Pipeline views',
  tabKanban: 'Kanban',
  tabTable: 'Table',
  tabSplit: 'Split',
  filtersLabel: 'Filters',
  filterAll: 'All',
  filterMine: 'Mine',
  filterBrief: 'Brief',
  filterRecipe: 'Recipe',
  filterTrial: 'Trial',
  filterApproval: 'Approval',
  searchLabel: 'Search projects',
  searchPlaceholder: 'Search by name or code…',
  newProject: 'New project',
  importRecipe: 'Import recipe',
  importRecipeDisabledHint: 'Recipe import is not available yet.',
  pageTitle: 'New Product Development',
  pageSubtitle: 'Pipeline oversight — projects across the Stage-Gate flow.',
  breadcrumbRoot: 'NPD',
  breadcrumbCurrent: 'Pipeline',
};

const DEFAULT_KPI_LABELS: PipelineKpiLabels = {
  activeLabel: 'Active projects',
  activeHint: 'Projects in gates G0–G4',
  awaitingLabel: 'Awaiting approval',
  awaitingHint: 'At gates G3/G4',
  launchedLabel: 'Launched YTD',
  launchedHint: '↑ vs last year',
  atRiskLabel: 'At risk',
  atRiskHint: 'Margin / behind schedule',
  avgTimeLabel: 'Avg time to launch',
  avgTimeHint: 'Target: 90 days',
  avgTimeUnit: 'days',
  empty: '—',
};

/**
 * Resolve a label dictionary through next-intl, falling back to the typed defaults
 * for any missing key (and for the whole namespace if next-intl is unavailable).
 */
async function buildLabelSet<T extends Record<string, string>>(
  locale: string,
  namespace: string,
  defaults: T,
): Promise<T> {
  try {
    const t = await getTranslations({ locale, namespace });
    const keys = Object.keys(defaults) as Array<keyof T>;
    return keys.reduce((acc, key) => {
      try {
        const value = t(key as string);
        acc[key] = (value === (key as string) ? defaults[key] : (value as T[keyof T]));
      } catch {
        acc[key] = defaults[key];
      }
      return acc;
    }, {} as T);
  } catch {
    return { ...defaults };
  }
}

function buildLabels(locale: string): Promise<KanbanLabels> {
  return buildLabelSet(locale, 'npd.pipelineKanban', DEFAULT_LABELS);
}

function toKanbanProject(summary: ProjectSummary): KanbanProject {
  return {
    id: summary.id,
    code: summary.code,
    name: summary.name,
    type: summary.type,
    currentGate: summary.currentGate,
    currentStage: normalizeStage(summary.currentStage),
    prio: summary.prio,
    owner: summary.owner,
    targetLaunch: summary.targetLaunch,
    createdAt: summary.createdAt,
    progressPercent: summary.progressPercent,
    closeoutStatus: summary.closeoutStatus,
  };
}

type ReadPageDataArgs = { filter: PipelineFilter; search: string | null };

/** Resolve the current user's display name (used to scope the ?filter=mine chip). */
async function resolveOwnerName(ctx: OrgContextLike): Promise<string | null> {
  try {
    const { rows } = await ctx.client.query<{ owner: string | null }>(
      `select coalesce(u.name, u.display_name, u.email::text) as owner
         from public.users u
        where u.id = $1::uuid
          and u.org_id = app.current_org_id()
        limit 1`,
      [ctx.userId],
    );
    return rows[0]?.owner ?? null;
  } catch {
    return null;
  }
}

async function readPageData({ filter, search }: ReadPageDataArgs): Promise<LoaderResult> {
  try {
    // Resolve RBAC + (for ?filter=mine) the owner name inside one org-context tx,
    // so the listProjects WHERE clause is org-scoped and never client-trusted.
    const { canAdvance, canCreate, ownerName } = await withOrgContext(
      async (rawCtx): Promise<{ canAdvance: boolean; canCreate: boolean; ownerName: string | null }> => {
        const ctx = rawCtx as OrgContextLike;
        const [canRead, canAdv, canCrt] = await Promise.all([
          hasPermission(ctx, PROJECT_VIEW_PERMISSION),
          hasPermission(ctx, GATE_ADVANCE_PERMISSION),
          hasPermission(ctx, PROJECT_CREATE_PERMISSION),
        ]);
        // Surface the read gate via a thrown sentinel so the outer block can map it.
        if (!canRead) throw new ForbiddenError();
        const owner = filter === 'mine' ? await resolveOwnerName(ctx) : null;
        return { canAdvance: canAdv, canCreate: canCrt, ownerName: owner };
      },
    );

    const query: ListProjectsInput = {};
    if (filter === 'mine') query.owner = ownerName;
    else if ((GATE_FILTERS as string[]).includes(filter)) query.gate = filter as ProjectGate;
    if (search) query.search = search;

    const result = await listProjects(query);
    if (!result.ok) {
      if (result.error === 'FORBIDDEN') {
        return { state: 'permission_denied', projects: [], canAdvance: false, canCreate: false };
      }
      return { state: 'error', projects: [], canAdvance, canCreate };
    }

    const projects = result.data.projects.map(toKanbanProject);
    return { state: projects.length === 0 ? 'empty' : 'ready', projects, canAdvance, canCreate };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { state: 'permission_denied', projects: [], canAdvance: false, canCreate: false };
    }
    console.error('[pipeline] org-scoped read failed:', error);
    return { state: 'error', projects: [], canAdvance: false, canCreate: false };
  }
}

class ForbiddenError extends Error {}

/** Server Action adapter passed to the client (T-058 owns advanceProjectGate). */
async function advanceActionAdapter(input: AdvanceInput): Promise<AdvanceResult> {
  'use server';
  const result = await advanceProjectGate(input);
  if (result.ok) {
    return { ok: true, data: { currentGate: result.data.currentGate } };
  }
  return { ok: false, error: result.error, status: result.status };
}

async function bulkAssignOwnerAdapter(input: Parameters<BulkActions['assignOwner']>[0]) {
  'use server';
  return bulkAssignOwner(input);
}

async function bulkSetPriorityAdapter(input: Parameters<BulkActions['setPriority']>[0]) {
  'use server';
  return bulkSetPriority(input);
}

async function bulkMoveGateAdapter(input: Parameters<BulkActions['moveGate']>[0]) {
  'use server';
  return bulkMoveGate(input);
}

const bulkActionsAdapter: BulkActions = {
  assignOwner: bulkAssignOwnerAdapter,
  setPriority: bulkSetPriorityAdapter,
  moveGate: bulkMoveGateAdapter,
};

export default async function PipelinePage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PipelinePageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const search = props.searchParams ? await props.searchParams : undefined;

  const filter = parseFilter(readParam(search, 'filter'));
  const searchQuery = readParam(search, 'search')?.trim() || null;

  const [kanbanLabels, tableLabels, splitLabels, switcherLabels, kpiLabels] =
    await Promise.all([
      buildLabels(locale),
      buildLabelSet(locale, 'npd.pipelineTable', DEFAULT_TABLE_LABELS),
      buildLabelSet(locale, 'npd.pipelineSplit', DEFAULT_SPLIT_LABELS),
      buildLabelSet(locale, 'npd.pipelineSwitcher', DEFAULT_SWITCHER_LABELS),
      buildLabelSet(locale, 'npd.pipelineKpi', DEFAULT_KPI_LABELS),
    ]);

  const injected = Array.isArray(props.projects);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.projects?.length ?? 0) === 0 ? 'empty' : 'ready'),
        projects: props.projects ?? [],
        canAdvance: props.canAdvance ?? false,
        canCreate: props.canCreate ?? false,
      }
    : await readPageData({ filter, search: searchQuery });

  const canCreate = props.canCreate ?? loaded.canCreate;

  return (
    <PipelineTabs
      projects={loaded.projects}
      switcherLabels={switcherLabels}
      kpiLabels={kpiLabels}
      kanbanLabels={kanbanLabels}
      tableLabels={tableLabels}
      splitLabels={splitLabels}
      canAdvance={props.canAdvance ?? loaded.canAdvance}
      state={props.state ?? loaded.state}
      advanceAction={advanceActionAdapter}
      bulkActions={bulkActionsAdapter}
      canCreate={canCreate}
    />
  );
}
