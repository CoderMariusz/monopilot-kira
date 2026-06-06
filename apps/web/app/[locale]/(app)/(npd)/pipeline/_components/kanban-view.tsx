'use client';

/**
 * T-059 — Pipeline Kanban view (kanban_view prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:36-52 (KanbanView)
 *   (+ KanbanCard 19-34, translated in ./kanban-card.tsx)
 *
 * Translation notes (from the prototype / prototype-index-npd.json#kanban_view):
 *   - window.NPD_STAGES.map(...) legacy stages → the Stage-Gate model G0..Launched
 *     (the prototype is @deprecated BL-NPD-02; the production board is gate-based,
 *     gate-helpers.ts). Documented in the closeout deviation log.
 *   - projects.filter(p => p.stage === s.key) static board → REAL ProjectSummary
 *     rows from the merged listProjects Server Action (read in page.tsx); the view
 *     buckets them by currentGate.
 *   - kanban-col-head label + count            → accessible column header + count.
 *   - empty column "—"                          → labelled placeholder per column.
 *   - (deviation) gate move = merged advanceProjectGate Server Action (T-058):
 *     adjacency-guarded; on click the card is OPTIMISTICALLY moved to the adjacent
 *     gate column; a 422 ADJACENCY_VIOLATION (or any error) SNAPS the card back to
 *     its source column and surfaces an accessible alert (§17.12 optimistic-revert).
 *
 * RBAC: `canAdvance` is resolved server-side (page.tsx) and never trusted from the
 * client — the affordance is omitted entirely when false (no render-then-disable).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import {
  STAGE_ORDER,
  nextGateOf,
  normalizeStage,
  stageLabel,
  type AdvanceAction,
  type KanbanLabels,
  type KanbanProject,
  type PageState,
  type ProjectStage,
} from './kanban-types';
import { KanbanCard } from './kanban-card';

export type { KanbanLabels, KanbanProject, PageState, ProjectGate, ProjectStage } from './kanban-types';
export type { AdvanceAction, AdvanceResult, AdvanceInput } from './kanban-types';

function StateNotice({ state, labels }: { state: PageState; labels: KanbanLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: 24, fontSize: 13 }}>
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export type KanbanViewProps = {
  projects: KanbanProject[];
  labels: KanbanLabels;
  /** Server-resolved RBAC gate (never client-trusted). */
  canAdvance: boolean;
  state?: PageState;
  /** Merged advanceProjectGate Server Action (page.tsx) or a test stub. */
  advanceAction: AdvanceAction;
};

export function KanbanView({
  projects,
  labels,
  canAdvance,
  state = 'ready',
  advanceAction,
}: KanbanViewProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [advanceError, setAdvanceError] = React.useState<string | null>(null);

  // Advance moves the project to the adjacent GATE (G0..Launched, gate-helpers).
  // The Kanban columns are STAGE-based (decoupled from the gate), so a successful
  // advance refreshes the RSC instead of optimistically reshuffling a column.
  const handleAdvance = React.useCallback(
    async (project: KanbanProject) => {
      const targetGate = nextGateOf(project.currentGate);
      if (!targetGate) return;

      setAdvanceError(null);
      setPending((prev) => ({ ...prev, [project.id]: true }));

      let result: Awaited<ReturnType<AdvanceAction>>;
      try {
        result = await advanceAction({ projectId: project.id, targetGate });
      } catch {
        result = { ok: false, error: 'PERSISTENCE_FAILED' };
      }

      setPending((prev) => {
        const next = { ...prev };
        delete next[project.id];
        return next;
      });

      if (result.ok) {
        // reconcile from the server (gate/stage may have advanced).
        try {
          router.refresh();
        } catch {
          // router.refresh is unavailable outside a Next request (vitest stub).
        }
        return;
      }

      setAdvanceError(
        result.error === 'ADJACENCY_VIOLATION' ? labels.adjacencyError : labels.advanceError,
      );
    },
    [advanceAction, router, labels.adjacencyError, labels.advanceError],
  );

  if (state !== 'ready' && state !== 'empty') {
    return (
      <main
        data-testid="kanban-screen"
        data-prototype-anchor="npd/pipeline.jsx:19-52"
        aria-labelledby="kanban-title"
        className="space-y-4"
      >
        <KanbanHeader labels={labels} count={0} />
        <section className="card" style={{ padding: 0 }}>
          <StateNotice state={state} labels={labels} />
        </section>
      </main>
    );
  }

  if (projects.length === 0) {
    return (
      <main
        data-testid="kanban-screen"
        data-prototype-anchor="npd/pipeline.jsx:19-52"
        aria-labelledby="kanban-title"
        className="space-y-4"
      >
        <KanbanHeader labels={labels} count={0} />
        <section className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🧪</div>
            <div className="empty-state-title">{labels.empty}</div>
            <div className="empty-state-body">{labels.emptyBody}</div>
          </div>
        </section>
      </main>
    );
  }

  const columns = STAGE_ORDER.map((stage) => ({
    stage,
    items: projects.filter((project) => normalizeStage(project.currentStage) === stage),
  }));

  return (
    <main
      data-testid="kanban-screen"
      data-prototype-anchor="npd/pipeline.jsx:19-52"
      aria-labelledby="kanban-title"
      className="space-y-4"
    >
      <KanbanHeader labels={labels} count={projects.length} />

      {advanceError ? (
        <div role="alert" className="alert alert-red">
          {advanceError}
        </div>
      ) : null}

      <section
        aria-label={labels.title}
        className="grid gap-3"
        // Each stage column is at least 300px wide so the project cards stay readable;
        // columns that don't fit wrap to the next row (instead of cramming all 8 onto
        // one line). auto-fill keeps empty trailing tracks so the row stays aligned.
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
      >
        {columns.map(({ stage, items }) => (
          <div
            key={stage}
            data-testid={`kanban-col-${stage}`}
            data-stage={stage}
            className="flex min-w-0 flex-col gap-2 rounded-[10px] p-2"
            style={{ background: 'var(--gray-050)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-1"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              <span>{stageLabel(stage, labels)}</span>
              <span
                data-testid={`kanban-count-${stage}`}
                aria-label={`${stageLabel(stage, labels)}: ${items.length}`}
                className="mono"
                style={{
                  fontSize: 11,
                  background: 'var(--gray-100)',
                  color: 'var(--gray-600)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '1px 8px',
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <p className="muted" style={{ padding: '16px 4px', textAlign: 'center', fontSize: 12 }}>
                {labels.columnEmpty}
              </p>
            ) : (
              items.map((project) => (
                <KanbanCard
                  key={project.id}
                  project={project}
                  labels={labels}
                  canAdvance={canAdvance}
                  advancing={pending[project.id] ?? false}
                  nextGate={nextGateOf(project.currentGate)}
                  onAdvance={handleAdvance}
                />
              ))
            )}
          </div>
        ))}
      </section>
    </main>
  );
}

function KanbanHeader({ labels, count }: { labels: KanbanLabels; count: number }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4" data-region="page-head">
      <div>
        <nav aria-label="breadcrumb" className="breadcrumb">
          NPD / {labels.title}
        </nav>
        <h1 id="kanban-title" className="page-title" style={{ marginTop: 2 }}>
          {labels.title}
        </h1>
        <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>
          {labels.subtitle} · {count}
        </p>
      </div>
    </header>
  );
}

export default KanbanView;
