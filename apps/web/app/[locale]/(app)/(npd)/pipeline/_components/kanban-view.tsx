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

import {
  GATE_ORDER,
  gateLabel,
  nextGateOf,
  type AdvanceAction,
  type KanbanLabels,
  type KanbanProject,
  type PageState,
  type ProjectGate,
} from './kanban-types';
import { KanbanCard } from './kanban-card';

export type { KanbanLabels, KanbanProject, PageState, ProjectGate } from './kanban-types';
export type { AdvanceAction, AdvanceResult, AdvanceInput } from './kanban-types';

function StateNotice({ state, labels }: { state: PageState; labels: KanbanLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
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
  // Optimistic gate overrides keyed by project id; the source gate is kept so a
  // failed advance can snap the card back to where it started.
  const [overrides, setOverrides] = React.useState<Record<string, ProjectGate>>({});
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [advanceError, setAdvanceError] = React.useState<string | null>(null);

  const gateOf = React.useCallback(
    (project: KanbanProject): ProjectGate => overrides[project.id] ?? project.currentGate,
    [overrides],
  );

  const handleAdvance = React.useCallback(
    async (project: KanbanProject) => {
      const sourceGate = gateOf(project);
      const targetGate = nextGateOf(sourceGate);
      if (!targetGate) return;

      setAdvanceError(null);
      // optimistic: move the card to the adjacent column immediately.
      setOverrides((prev) => ({ ...prev, [project.id]: targetGate }));
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
        // reconcile to the server-confirmed gate.
        setOverrides((prev) => ({ ...prev, [project.id]: result.data.currentGate }));
        return;
      }

      // revert: snap the card back to its source column + surface the error.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[project.id];
        return next;
      });
      setAdvanceError(
        result.error === 'ADJACENCY_VIOLATION' ? labels.adjacencyError : labels.advanceError,
      );
    },
    [advanceAction, gateOf, labels.adjacencyError, labels.advanceError],
  );

  if (state !== 'ready' && state !== 'empty') {
    return (
      <main
        data-testid="kanban-screen"
        data-prototype-anchor="npd/pipeline.jsx:19-52"
        aria-labelledby="kanban-title"
        className="mx-auto w-full max-w-7xl space-y-4 p-6"
      >
        <KanbanHeader labels={labels} count={0} />
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
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
        className="mx-auto w-full max-w-7xl space-y-4 p-6"
      >
        <KanbanHeader labels={labels} count={0} />
        <section className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-900">{labels.empty}</p>
          <p className="mt-1 text-sm text-slate-600">{labels.emptyBody}</p>
        </section>
      </main>
    );
  }

  const columns = GATE_ORDER.map((gate) => ({
    gate,
    items: projects.filter((project) => gateOf(project) === gate),
  }));

  return (
    <main
      data-testid="kanban-screen"
      data-prototype-anchor="npd/pipeline.jsx:19-52"
      aria-labelledby="kanban-title"
      className="mx-auto w-full max-w-7xl space-y-4 p-6"
    >
      <KanbanHeader labels={labels} count={projects.length} />

      {advanceError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {advanceError}
        </div>
      ) : null}

      <section
        aria-label={labels.title}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        {columns.map(({ gate, items }) => (
          <div
            key={gate}
            data-testid={`kanban-col-${gate}`}
            data-gate={gate}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
          >
            <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <span>{gateLabel(gate, labels)}</span>
              <span
                data-testid={`kanban-count-${gate}`}
                aria-label={`${gateLabel(gate, labels)}: ${items.length}`}
                className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700"
              >
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-slate-400">{labels.columnEmpty}</p>
            ) : (
              items.map((project) => (
                <KanbanCard
                  key={project.id}
                  project={{ ...project, currentGate: gate }}
                  labels={labels}
                  canAdvance={canAdvance}
                  advancing={pending[project.id] ?? false}
                  nextGate={nextGateOf(gate)}
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
        <nav aria-label="breadcrumb" className="text-xs text-slate-500">
          NPD / {labels.title}
        </nav>
        <h1 id="kanban-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          {labels.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {labels.subtitle} · {count}
        </p>
      </div>
    </header>
  );
}

export default KanbanView;
