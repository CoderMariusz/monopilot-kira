'use client';

/**
 * T-059 — Pipeline Kanban card (kanban_view prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:19-34 (KanbanCard)
 *
 * Translation notes (from the prototype / prototype-index-npd.json#kanban_view):
 *   - <div className="kanban-card">          → shadcn Card / CardContent primitive.
 *   - kanban-card-title + code · type        → CardTitle link + mono code/type line.
 *   - prio-${p.prio} accent + prioBadge      → shadcn Badge (prio mapped to variant);
 *                                              colour is paired with text (a11y: never
 *                                              colour-only).
 *   - inline progress bar (lines 23-28)      → accessible progressbar (role + aria-*).
 *   - kanban-card-meta owner + ▶ target      → owner + target-launch meta row.
 *   - onClick → onOpen(p.id)                  → next/link to the Stage-Gate project
 *                                              detail (/pipeline/[id]).
 *   - (deviation) gate move is the merged advanceProjectGate Server Action → an
 *     explicit, accessible "Advance" affordance (not literal @dnd-kit drag), gated
 *     server-side by canAdvance and hidden on the terminal Launched gate.
 */

import React from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';

import { LaunchedCardCloseoutPill } from './launched-card-closeout-pill';
import type { KanbanLabels, KanbanProject, ProjectGate, ProjectPriority } from './kanban-types';

export type { KanbanLabels, KanbanProject } from './kanban-types';

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

function prioLabel(prio: ProjectPriority, labels: KanbanLabels): string {
  switch (prio) {
    case 'high':
      return labels.prioHigh;
    case 'low':
      return labels.prioLow;
    default:
      return labels.prioNormal;
  }
}

export type KanbanCardProps = {
  project: KanbanProject;
  labels: KanbanLabels;
  /** Server-resolved RBAC gate (never client-trusted). */
  canAdvance: boolean;
  /** True while this card's advance request is in flight (optimistic). */
  advancing: boolean;
  /** Adjacent next gate, or null when the project is at the terminal gate. */
  nextGate: ProjectGate | null;
  onAdvance: (project: KanbanProject) => void;
};

export function KanbanCard({
  project,
  labels,
  canAdvance,
  advancing,
  nextGate,
  onAdvance,
}: KanbanCardProps) {
  const prioText = prioLabel(project.prio, labels);
  const progress = Math.max(0, Math.min(100, project.progressPercent));
  const showAdvance = canAdvance && nextGate !== null;

  return (
    <div data-testid={`kanban-card-${project.code}`} data-gate={project.currentGate}>
      <Card className="kanban-card">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/pipeline/${project.id}`}
            prefetch
            className="text-sm font-semibold text-slate-950 hover:underline"
          >
            {project.name}
          </Link>
          <Badge variant={prioVariant(project.prio)} aria-label={prioText}>
            {prioText}
          </Badge>
        </div>

        <div className="font-mono text-[11px] text-slate-500">
          {project.code} · {project.type}
        </div>

        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={project.name}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 flex-1 overflow-hidden rounded bg-slate-100"
          >
            <div
              className={progress >= 90 ? 'h-full bg-green-500' : 'h-full bg-blue-500'}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-slate-500">{progress}%</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-600">
          <span>{project.owner ?? <span className="text-slate-400">{labels.noOwner}</span>}</span>
          <span>
            {project.targetLaunch ? (
              <>▶ {project.targetLaunch}</>
            ) : (
              <span className="text-slate-400">{labels.noTarget}</span>
            )}
          </span>
        </div>

        {project.currentGate === 'Launched' && project.closeoutStatus ? (
          <LaunchedCardCloseoutPill status={project.closeoutStatus} />
        ) : null}

        {showAdvance ? (
          <div className="pt-1">
            <Button
              type="button"
              data-testid={`kanban-advance-${project.code}`}
              aria-label={labels.advance}
              disabled={advancing}
              onClick={() => onAdvance(project)}
            >
              {advancing ? labels.advancing : labels.advance}
            </Button>
          </div>
        ) : null}
      </CardContent>
      </Card>
    </div>
  );
}

export default KanbanCard;
