'use client';

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

export type DashboardPipelinePreviewProps = {
  recentProjects: RecentProject[];
};

const gateStatusLabels: Record<GateStatus, string> = {
  todo: 'Pending',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const gateStatusClasses: Record<GateStatus, string> = {
  todo: 'border-slate-200 bg-slate-50 text-slate-600',
  'in-progress': 'border-amber-200 bg-amber-50 text-amber-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

function StatusBadge({ status }: { status: GateStatus }) {
  return (
    <Badge
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${gateStatusClasses[status]}`}
      variant={status === 'blocked' ? 'destructive' : status === 'done' ? 'success' : 'secondary'}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        ●
      </span>
      {gateStatusLabels[status]}
    </Badge>
  );
}

export function DashboardPipelinePreview({ recentProjects }: DashboardPipelinePreviewProps) {
  const compactProjects = recentProjects.slice(0, 10);

  return (
    <Card
      aria-labelledby="dashboard-pipeline-preview-title"
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
      role="region"
    >
      <CardHeader className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900" id="dashboard-pipeline-preview-title">
            Pipeline (recent)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Recent FA gate movement</p>
        </div>
        <Link className="text-xs font-medium text-blue-600 hover:text-blue-700" href="/pipeline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="px-4 py-3">
        {compactProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            No recent projects in the pipeline yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {compactProjects.map((project) => {
              const productCode = project.productCode || project.code;
              const detailHref = `/fa/${encodeURIComponent(productCode)}`;

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
                    <StatusBadge status={project.gateStatus} />
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
