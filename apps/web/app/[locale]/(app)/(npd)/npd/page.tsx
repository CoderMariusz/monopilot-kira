/**
 * T-052 — NPD Dashboard page (SCR-01).
 *
 * Server Component. Reads REAL, org-scoped data via the T-051 Server Actions
 * `getDashboardSummary` + `getLaunchAlerts` (RLS-enforced as app_user with
 * app.current_org_id()). No mocks, no hard-coded rows.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *   PRD docs/prd/01-NPD-PRD.md §11.1 (layout), §11.5 (refresh), §11.7 (controls)
 *
 * Data wiring (translation-notes-npd.md · npd_dashboard):
 *   - KPI tiles            → getDashboardSummary().summary
 *   - Department progress  → getDashboardSummary().perDept
 *   - Launch alerts table  → getLaunchAlerts({ showBuilt: true }) — prefetch both
 *                            built + active rows so the client show-built toggle
 *                            filters with no extra request (§11.7).
 *
 * RBAC (§11.6): view gate enforced server-side by the actions (throw FORBIDDEN);
 *   action affordances (Create FA / Refresh D365) gated by per-permission check.
 */

import { getTranslations } from 'next-intl/server';

import {
  DashboardScreen,
  type AlertLevel,
  type DashboardScreenLabels,
  type DashboardSummary,
  type Dept,
  type DeptProgress,
  type LaunchAlert,
  type PageState,
} from './_components/dashboard-screen';
import {
  DashboardPipelinePreview,
  DEFAULT_PIPELINE_PREVIEW_LABELS,
  type DashboardPipelinePreviewLabels,
  type GateStatus,
  type RecentProject,
} from '../_components/dashboard-pipeline-preview';
import { getDashboardSummary } from '../../../../(npd)/dashboard/_actions/get-dashboard-summary';
import { getLaunchAlerts } from '../../../../(npd)/dashboard/_actions/get-launch-alerts';
import { listProjects } from '../../../../(npd)/pipeline/_actions/list-projects';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const CREATE_PERMISSIONS = ['npd.fa.create', 'fa.create'] as const;
const REFRESH_PERMISSIONS = ['npd.d365_builder.execute', 'd365_builder.execute'] as const;

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type DashboardData = {
  state: PageState;
  canCreate: boolean;
  canRefresh: boolean;
  summary: DashboardSummary;
  perDept: DeptProgress[];
  alerts: LaunchAlert[];
  recentProjects: RecentProject[];
};

type DashboardPageProps = {
  params?: Promise<{ locale: string }>;
  // Test-only injection seam (mirrors fa/page.tsx convention).
  state?: PageState;
  canCreate?: boolean;
  canRefresh?: boolean;
  summary?: DashboardSummary;
  perDept?: DeptProgress[];
  alerts?: LaunchAlert[];
  recentProjects?: RecentProject[];
};

const DEFAULT_LABELS: DashboardScreenLabels = {
  breadcrumbRoot: 'NPD',
  breadcrumbCurrent: 'Dashboard',
  title: 'NPD Dashboard',
  subtitle: 'Pipeline overview across 7 departments',
  refreshD365: 'Refresh D365 cache',
  createFa: 'Create FA',
  kpiTotalActive: 'Total active FAs',
  kpiTotalActiveHint: 'Not yet built for D365',
  kpiComplete: 'Fully complete',
  kpiCompleteHint: 'Ready for D365 build',
  kpiInProgress: 'In progress / pending',
  kpiInProgressHint: 'Awaiting department fill',
  kpiBuilt: 'Built for D365',
  kpiBuiltHint: 'Awaiting retailer approval',
  deptProgressTitle: 'Department progress',
  deptProgressSubtitle: '7 departments',
  colDept: 'Department',
  colDone: 'Done',
  colPending: 'Pending',
  colBlocked: 'Blocked',
  colProgress: 'Progress',
  legendTitle: 'Launch alert legend',
  legendRed: 'Launch ≤ 10 days, or missing required fields',
  legendAmber: 'Launch ≤ 21 days and missing data',
  legendGreen: 'On track · no data gaps',
  legendNote: 'Row-level alert badges recalculate on each load.',
  showBuilt: 'Show built FAs (hidden by default)',
  alertsTitle: 'Launch alerts',
  alertsSubtitle: 'Sorted by days left, soonest first',
  colFaCode: 'FA Code',
  colProduct: 'Product',
  colLaunch: 'Launch date',
  colDaysLeft: 'Days left',
  colAlert: 'Alert',
  colMissing: 'Missing data',
  alertRed: 'Red',
  alertAmber: 'Amber',
  alertGreen: 'Green',
  openFa: 'Open FA',
  noDate: 'No date set',
  deptCore: 'Core',
  deptPlanning: 'Planning',
  deptCommercial: 'Commercial',
  deptProduction: 'Production',
  deptTechnical: 'Technical',
  deptMrp: 'MRP',
  deptProcurement: 'Procurement',
  loading: 'Loading dashboard…',
  empty: 'No active Factory Articles yet',
  emptyBody: 'Launch alerts appear once Factory Articles are created from a Brief.',
  error: 'Unable to load the dashboard. Try again once the backend is available.',
  forbidden: 'You do not have permission to view the NPD dashboard.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof DashboardScreenLabels>;

function translateLabel(t: (key: string) => string, key: keyof DashboardScreenLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<DashboardScreenLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.dashboard' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as DashboardScreenLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function hasAnyPermission(ctx: OrgContextLike, permissions: readonly string[]): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) p(permission)
            where p.permission = any($3::text[])
          )
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permissions],
  );
  return rows.length > 0;
}

const ALERT_LEVELS = new Set<AlertLevel>(['RED', 'YELLOW', 'GREEN']);

function normalizeAlertLevel(value: unknown): AlertLevel {
  return ALERT_LEVELS.has(value as AlertLevel) ? (value as AlertLevel) : 'GREEN';
}

async function readActionAffordances(): Promise<{ canCreate: boolean; canRefresh: boolean }> {
  return await withOrgContext(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    const [canCreate, canRefresh] = await Promise.all([
      hasAnyPermission(ctx, CREATE_PERMISSIONS),
      hasAnyPermission(ctx, REFRESH_PERMISSIONS),
    ]);
    return { canCreate, canRefresh };
  });
}

const RECENT_PROJECTS_LIMIT = 10;

type ProjectSummaryLike = {
  id: string;
  code: string;
  name: string;
  currentGate: string;
  owner: string | null;
  progressPercent: number;
};

/**
 * Derive the preview gate-status dot from the real project state. listProjects
 * (T-057) exposes the current gate + checklist progress; we map:
 *   - Launched / 100% checklist  → done
 *   - any checklist progress      → in-progress
 *   - no progress yet             → todo
 * (`blocked` is reserved in the GateStatus union but not surfaced by listProjects;
 * see the deviation log.)
 */
function deriveGateStatus(project: ProjectSummaryLike): GateStatus {
  if (project.currentGate === 'Launched' || project.progressPercent >= 100) return 'done';
  if (project.progressPercent > 0) return 'in-progress';
  return 'todo';
}

function mapRecentProject(project: ProjectSummaryLike): RecentProject {
  return {
    id: project.id,
    projectId: project.id,
    code: project.code,
    productCode: project.code,
    name: project.name,
    owner: project.owner ?? '—',
    currentGate: project.currentGate,
    gateStatus: deriveGateStatus(project),
  };
}

/**
 * Recent-projects snapshot for the T-133 preview region. Real, org-scoped data via
 * the T-057 `listProjects` Server Action (RLS app.current_org_id()); listProjects
 * already orders by created_at desc, so we take the top N. A FORBIDDEN/failure here
 * degrades the preview to empty without failing the whole dashboard.
 */
async function readRecentProjects(): Promise<RecentProject[]> {
  const result = await listProjects();
  if (!result.ok) return [];
  return result.data.projects.slice(0, RECENT_PROJECTS_LIMIT).map(mapRecentProject);
}

async function buildPipelineLabels(locale: string): Promise<DashboardPipelinePreviewLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.dashboardPipeline' });
    const keys = Object.keys(DEFAULT_PIPELINE_PREVIEW_LABELS) as Array<
      keyof DashboardPipelinePreviewLabels
    >;
    return keys.reduce((labels, key) => {
      try {
        const value = t(key);
        labels[key] = value === key ? DEFAULT_PIPELINE_PREVIEW_LABELS[key] : value;
      } catch {
        labels[key] = DEFAULT_PIPELINE_PREVIEW_LABELS[key];
      }
      return labels;
    }, {} as DashboardPipelinePreviewLabels);
  } catch {
    return { ...DEFAULT_PIPELINE_PREVIEW_LABELS };
  }
}

async function readDashboard(): Promise<DashboardData> {
  try {
    // Prefetch built + active alerts so the client toggle filters without a refetch.
    // Recent projects (T-057) feed the T-133 pipeline-preview region in parallel.
    const [summaryResult, alertsResult, affordances, recentProjects] = await Promise.all([
      getDashboardSummary(),
      getLaunchAlerts({ showBuilt: true }),
      readActionAffordances(),
      readRecentProjects(),
    ]);

    const summary: DashboardSummary = {
      totalActive: summaryResult.summary.totalActive,
      fullyComplete: summaryResult.summary.fullyComplete,
      inProgress: summaryResult.summary.pending,
      totalBuilt: summaryResult.summary.totalBuilt,
    };

    const perDept: DeptProgress[] = summaryResult.perDept.map((row) => ({
      dept: row.dept as Dept,
      done: row.done,
      pending: row.pending,
      blocked: row.blocked,
    }));

    const alerts: LaunchAlert[] = alertsResult.alerts.map((row) => ({
      productCode: row.productCode,
      productName: row.productName,
      launchDate: row.launchDate,
      daysLeft: row.daysLeft,
      alertLevel: normalizeAlertLevel(row.alertLevel),
      missingData: row.missingData,
      built: row.built,
    }));

    const activeAlerts = alerts.filter((a) => !a.built);
    const state: PageState =
      summary.totalActive === 0 && activeAlerts.length === 0 ? 'empty' : 'ready';

    return {
      state,
      canCreate: affordances.canCreate,
      canRefresh: affordances.canRefresh,
      summary,
      perDept,
      alerts,
      recentProjects,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return emptyData('permission_denied');
    }
    console.error('[npd-dashboard] org-scoped read failed:', error);
    return emptyData('error');
  }
}

function emptyData(state: PageState): DashboardData {
  return {
    state,
    canCreate: false,
    canRefresh: false,
    summary: { totalActive: 0, fullyComplete: 0, inProgress: 0, totalBuilt: 0 },
    perDept: [],
    alerts: [],
    recentProjects: [],
  };
}

export default async function NpdDashboardPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as DashboardPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const [labels, pipelineLabels] = await Promise.all([
    buildLabels(locale),
    buildPipelineLabels(locale),
  ]);

  const injected =
    props.summary !== undefined ||
    props.alerts !== undefined ||
    props.state !== undefined ||
    props.recentProjects !== undefined;
  const data: DashboardData = injected
    ? {
        state: props.state ?? 'ready',
        canCreate: props.canCreate ?? false,
        canRefresh: props.canRefresh ?? false,
        summary: props.summary ?? { totalActive: 0, fullyComplete: 0, inProgress: 0, totalBuilt: 0 },
        perDept: props.perDept ?? [],
        alerts: props.alerts ?? [],
        recentProjects: props.recentProjects ?? [],
      }
    : await readDashboard();

  return (
    <DashboardScreen
      state={data.state}
      labels={labels}
      canCreate={data.canCreate}
      canRefresh={data.canRefresh}
      summary={data.summary}
      perDept={data.perDept}
      alerts={data.alerts}
      pipelinePreview={
        <DashboardPipelinePreview recentProjects={data.recentProjects} labels={pipelineLabels} />
      }
    />
  );
}
