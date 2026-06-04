'use client';

/**
 * T-129 — Pipeline ProjectDetailPanel (split_view prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:96-129
 *   (the sticky detail Card inside SplitView: code/name/prio badge, type, the
 *    2-col field grid Owner/Stage/Created/Target launch, the progress bar, the
 *    notes block, and the "Open project →" button)
 *
 * Translation notes (prototype-index-npd.json#split_view):
 *   - <div className="card" position:sticky top:100>  → shadcn Card, sticky top-16.
 *   - card-head code + name + prioBadge               → CardHeader: mono code +
 *                                                       CardTitle + shadcn Badge.
 *   - 2-col field grid (Owner / Stage / Created /      → labelled dt/dd grid; the
 *     Target launch / cost / margin)                    legacy "Stage" → Stage-Gate
 *                                                        "Gate" (G0..Launched);
 *                                                        cost/margin are not on the
 *                                                        merged ProjectSummary →
 *                                                        replaced by the real
 *                                                        "Recent activity" feed (see
 *                                                        deviation log).
 *   - inline progress bar (lines 117-123)             → accessible progressbar
 *                                                       (role + aria-*), matching the
 *                                                       KanbanCard convention.
 *   - notes block                                     → folded into Recent activity.
 *   - "Open project →" button (line 128)              → next/link to /pipeline/[id].
 *   - empty state (project == null, not in prototype) → labelled empty prompt.
 *
 * Pure Client Component: NO DB calls — the parent RSC (T-130 view switcher)
 * supplies the already-org-scoped projects from the merged listProjects action.
 */

import React from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';

import { gateLabelOf, type SplitLabels } from './split-labels';
import type { KanbanProject, ProjectPriority } from './kanban-types';

export type { SplitLabels } from './split-labels';

function prioVariant(prio: ProjectPriority): BadgeVariant {
  switch (prio) {
    case 'high':
      return 'danger';
    case 'low':
      return 'muted';
    default:
      return 'warning';
  }
}

function prioLabel(prio: ProjectPriority, labels: SplitLabels): string {
  switch (prio) {
    case 'high':
      return labels.prioHigh;
    case 'low':
      return labels.prioLow;
    default:
      return labels.prioNormal;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}

export type ProjectDetailPanelProps = {
  project: KanbanProject | null;
  labels: SplitLabels;
};

export function ProjectDetailPanel({ project, labels }: ProjectDetailPanelProps) {
  if (!project) {
    return (
      <aside
        role="region"
        aria-label={labels.detailLabel}
        data-testid="project-detail-panel"
        className="lg:sticky lg:top-16"
      >
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-slate-500">{labels.emptyDetail}</p>
          </CardContent>
        </Card>
      </aside>
    );
  }

  const prioText = prioLabel(project.prio, labels);
  const progress = Math.max(0, Math.min(100, project.progressPercent));

  return (
    <aside
      role="region"
      aria-label={labels.detailLabel}
      data-testid="project-detail-panel"
      data-project-id={project.id}
      className="lg:sticky lg:top-16"
    >
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-slate-500">{project.code}</div>
            <CardTitle className="text-base">{project.name}</CardTitle>
          </div>
          <Badge variant={prioVariant(project.prio)} aria-label={prioText}>
            {prioText}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Field label={labels.fieldType}>{project.type}</Field>
            <Field label={labels.fieldOwner}>
              {project.owner ?? <span className="text-slate-400">{labels.noOwner}</span>}
            </Field>
            <Field label={labels.fieldGate}>{gateLabelOf(project.currentGate, labels)}</Field>
            <Field label={labels.fieldTarget}>
              {project.targetLaunch ?? <span className="text-slate-400">{labels.noTarget}</span>}
            </Field>
          </dl>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
              {labels.progress}
            </div>
            <div className="flex items-center gap-2">
              <div
                role="progressbar"
                aria-label={`${labels.progress}: ${progress}%`}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 flex-1 overflow-hidden rounded bg-slate-100"
              >
                <div
                  className={progress >= 90 ? 'h-full bg-green-500' : 'h-full bg-blue-500'}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="font-mono text-xs text-slate-700">{progress}%</span>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
              {labels.recentActivity}
            </div>
            <p className="text-xs text-slate-500">{labels.noActivity}</p>
          </div>

          <Link
            href={`/pipeline/${project.id}`}
            prefetch
            data-slot="button"
            className="btn flex w-full items-center justify-center"
          >
            {labels.openProject}
          </Link>
        </CardContent>
      </Card>
    </aside>
  );
}

export default ProjectDetailPanel;
