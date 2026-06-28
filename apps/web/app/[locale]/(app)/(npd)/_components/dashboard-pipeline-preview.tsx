'use client';

/**
 * T-133 — Dashboard Pipeline preview region (NPD-e slice of T-052).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *
 * Standalone Client Component: a compact recent-projects mini-view (top 5-10) with
 * per-project current-gate status Badge dots and a view-all link to the full
 * pipeline page. Consumes a `recentProjects` prop from the parent RSC (T-134) — it
 * performs NO DB call and imports NO Server Action (parent provides real data via
 * withOrgContext → listProjects, T-057).
 *
 * i18n: distinct namespace `npd.dashboardPipeline`. All visible strings arrive as
 * `labels` props resolved server-side via next-intl (mirrors the DashboardScreen
 * label-injection pattern). Defaults are English so the component is renderable in
 * isolation (RTL) without a next-intl provider.
 *
 * The 5 UI states are surfaced by the parent page (loading/error/permission_denied
 * short-circuit the dashboard); this region owns the EMPTY state (no recent
 * projects) and the populated/ready state. Optimistic mutation is N/A (read-only
 * region, BL-NPD-04 30s refresh is out of scope — static render).
 */

import Link from 'next/link';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';

export type GateStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

export type RecentProject = {
  id: string;
  projectId: string;
  code: string;
  productCode: string;
  name: string;
  owner: string;
  currentGate: string;
  gateStatus: GateStatus;
};

export type DashboardPipelinePreviewLabels = {
  title: string;
  subtitle: string;
  viewAll: string;
  empty: string;
  statusTodo: string;
  statusInProgress: string;
  statusBlocked: string;
  statusDone: string;
};

export type DashboardPipelinePreviewProps = {
  recentProjects: RecentProject[];
  labels?: DashboardPipelinePreviewLabels;
};

/**
 * English defaults. The parent RSC overrides these via the `npd.dashboardPipeline`
 * next-intl namespace; kept here so the component renders standalone in tests.
 */
export const DEFAULT_PIPELINE_PREVIEW_LABELS: DashboardPipelinePreviewLabels = {
  title: 'Pipeline (recent)',
  subtitle: 'Recent FG gate movement',
  viewAll: 'View all',
  empty: 'No recent projects in the pipeline yet.',
  statusTodo: 'Pending',
  statusInProgress: 'In progress',
  statusBlocked: 'Blocked',
  statusDone: 'Done',
};

const MAX_PREVIEW_ROWS = 10;

function statusLabel(status: GateStatus, labels: DashboardPipelinePreviewLabels): string {
  switch (status) {
    case 'blocked':
      return labels.statusBlocked;
    case 'done':
      return labels.statusDone;
    case 'in-progress':
      return labels.statusInProgress;
    default:
      return labels.statusTodo;
  }
}

const gateStatusClasses: Record<GateStatus, string> = {
  todo: 'border-slate-200 bg-slate-50 text-slate-600',
  'in-progress': 'border-amber-200 bg-amber-50 text-amber-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

function StatusBadge({
  status,
  labels,
}: {
  status: GateStatus;
  labels: DashboardPipelinePreviewLabels;
}) {
  return (
    <Badge
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${gateStatusClasses[status]}`}
      variant={status === 'blocked' ? 'destructive' : status === 'done' ? 'success' : 'secondary'}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        ●
      </span>
      {statusLabel(status, labels)}
    </Badge>
  );
}

export function DashboardPipelinePreview({
  recentProjects,
  labels = DEFAULT_PIPELINE_PREVIEW_LABELS,
}: DashboardPipelinePreviewProps) {
  const compactProjects = recentProjects.slice(0, MAX_PREVIEW_ROWS);

  return (
    <Card
      aria-labelledby="dashboard-pipeline-preview-title"
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
      role="region"
    >
      <CardHeader className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900" id="dashboard-pipeline-preview-title">
            {labels.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
        </div>
        <Link className="text-xs font-medium text-blue-600 hover:text-blue-700" href="/pipeline">
          {labels.viewAll}
        </Link>
      </CardHeader>
      <CardContent className="px-4 py-3">
        {compactProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            {labels.empty}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {compactProjects.map((project) => {
              // A recent-project row routes to that project's pipeline working
              // surface (keyed by project UUID, like every other NPD surface) —
              // NOT to /fg/<code>. The FG detail route expects an FG product_code
              // (e.g. FA5609); the dashboard only carries the NPD project code, so
              // /fg/<projectCode> always 404'd. project.projectId is the real id.
              const detailHref = `/pipeline/${encodeURIComponent(project.projectId)}`;

              return (
                <Link
                  aria-label={`${project.code} ${project.name} ${project.owner} ${project.currentGate}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-1 py-3 text-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  href={detailHref}
                  key={project.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">
                      <span className="font-mono text-xs text-blue-700">{project.code}</span>
                      <span className="mx-2 text-slate-300">/</span>
                      {project.name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {project.owner} · {project.currentGate}
                    </span>
                  </span>
                  <span className="flex items-center">
                    <StatusBadge status={project.gateStatus} labels={labels} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DashboardPipelinePreview;
