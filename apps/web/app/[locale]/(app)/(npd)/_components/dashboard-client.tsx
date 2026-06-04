'use client';

/**
 * T-134 — NPD dashboard wiring wrapper (scaffold composition).
 *
 * Composes the scaffold KPI counters + pipeline preview islands with the data
 * shapes the Server Component supplies. This wrapper is the scaffold seam asserted
 * by dashboard-client.test.tsx (counters-before-preview ordering + route links).
 *
 * NOTE: the production, prototype-faithful NPD dashboard (anchor
 * fa-screens.jsx:32-174) lives in ../dashboard/page.tsx + ../dashboard/_components/
 * dashboard-screen.tsx. This wrapper is retained only to satisfy the pre-existing
 * scaffold contract; see the T-052 deviation log.
 */

import React from 'react';
import Link from 'next/link';

import { Badge } from '@monopilot/ui/Badge';

import { DashboardCounters } from './dashboard-counters';
import type { GateStatus } from './dashboard-pipeline-preview';

export type DashboardSummary = {
  totalFas: number;
  byStatus: {
    done: number;
    pending: number;
    blocked: number;
  };
  overdueAlerts: number;
};

export type RecentNpdProject = {
  projectId: string;
  productCode: string;
  projectName: string;
  owner: string;
  currentGate: string;
  gateStatus: GateStatus;
};

export type DashboardClientProps = {
  summary: DashboardSummary;
  recentProjects: RecentNpdProject[];
};

const gateStatusLabels: Record<GateStatus, string> = {
  todo: 'Pending',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

export function DashboardClient({ summary, recentProjects }: DashboardClientProps) {
  const compact = recentProjects.slice(0, 10);

  return (
    <div className="space-y-4">
      <DashboardCounters
        summary={{
          totalFas: summary.totalFas,
          done: summary.byStatus.done,
          pending: summary.byStatus.pending,
          blocked: summary.byStatus.blocked,
          overdueAlerts: summary.overdueAlerts,
        }}
      />

      <section
        aria-label="Dashboard pipeline preview"
        data-slot="card"
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div
          data-slot="card-header"
          className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"
        >
          <h2 className="text-sm font-semibold text-slate-900">Pipeline (recent)</h2>
          <Link className="text-xs font-medium text-blue-600 hover:text-blue-700" href="/(npd)/pipeline">
            View all pipeline
          </Link>
        </div>
        <div data-slot="card-content" className="px-4 py-3">
          {compact.length === 0 ? (
            <p className="text-sm text-slate-500">No recent projects in the pipeline yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {compact.map((project) => (
                <Link
                  aria-label={`${project.productCode} ${project.projectName} ${project.owner} ${project.currentGate}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-1 py-3 text-sm transition hover:bg-slate-50"
                  href={`/(npd)/fa/${project.productCode}`}
                  key={project.projectId}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">
                      <span className="font-mono text-xs text-blue-700">{project.productCode}</span>
                      <span className="mx-2 text-slate-300">/</span>
                      {project.projectName}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {project.owner} · {project.currentGate}
                    </span>
                  </span>
                  <span className="flex items-center">
                    <Badge
                      variant={
                        project.gateStatus === 'blocked'
                          ? 'destructive'
                          : project.gateStatus === 'done'
                            ? 'success'
                            : 'secondary'
                      }
                    >
                      <span aria-hidden="true" className="text-[10px] leading-none">
                        ●
                      </span>{' '}
                      {gateStatusLabels[project.gateStatus]}
                    </Badge>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default DashboardClient;
