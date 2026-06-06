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
  // Left accent rail mirrors the prototype's prio-${p.prio} card border.
  const accent =
    project.prio === 'high'
      ? 'var(--red)'
      : project.prio === 'low'
        ? 'var(--gray-300, #cbd5e1)'
        : 'var(--amber)';

  return (
    <div data-testid={`kanban-card-${project.code}`} data-gate={project.currentGate}>
      <Card
        className="kanban-card"
        style={{
          margin: 0,
          padding: 0,
          borderLeft: `3px solid ${accent}`,
          cursor: 'pointer',
        }}
      >
        <CardContent className="space-y-2" style={{ padding: 10 }}>
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/pipeline/${project.id}`}
              prefetch
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
            >
              {project.name}
            </Link>
            <Badge variant={prioVariant(project.prio)} aria-label={prioText}>
              {prioText}
            </Badge>
          </div>

          <div className="mono muted" style={{ fontSize: 11 }}>
            {project.code} · {project.type}
          </div>

          <div className="flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={project.name}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                flex: 1,
                height: 4,
                background: 'var(--gray-100)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: progress >= 90 ? 'var(--green)' : 'var(--blue)',
                }}
              />
            </div>
            <span className="mono muted" style={{ fontSize: 10 }}>
              {progress}%
            </span>
          </div>

          <div
            className="flex items-center justify-between muted"
            style={{ fontSize: 11 }}
          >
            <span>
              {project.owner ?? (
                <span style={{ color: 'var(--gray-400, #94a3b8)' }}>{labels.noOwner}</span>
              )}
            </span>
            <span>
              {project.targetLaunch ? (
                <>▶ {project.targetLaunch}</>
              ) : (
                <span style={{ color: 'var(--gray-400, #94a3b8)' }}>{labels.noTarget}</span>
              )}
            </span>
          </div>

          {project.currentGate === 'Launched' && project.closeoutStatus ? (
            <LaunchedCardCloseoutPill status={project.closeoutStatus} />
          ) : null}

          {showAdvance ? (
            <div style={{ paddingTop: 2 }}>
              <Button
                type="button"
                className="btn-primary btn-sm"
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
