'use client';

/**
 * T-129 — Pipeline SplitView (split_view prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:89-131 (SplitView)
 *     - line 94 .split layout            → CSS grid grid-cols-[1fr_380px] gap-4
 *       (the translation-notes / prototype-index split_view contract). No
 *       ResizablePanelGroup primitive exists in @monopilot/ui; the prototype's
 *       split is itself a static 2-column grid, so a grid is the faithful match.
 *     - line 95 <TableView ... selectedId onSelect> → the left compact selection
 *       list (shadcn Table). The selected row is highlighted (bg-blue-50) and the
 *       selection drives the right detail panel — the TableView selection mode.
 *     - lines 96-129 sticky detail Card  → ./project-detail-panel.tsx (right aside).
 *
 * Behaviour contract (task T-129 + §17.12):
 *   - selId state (line 91) → URL param ?selected=<projectId> (shareable links),
 *     persisted with router.replace (no history spam) + read from useSearchParams.
 *   - keyboard navigation on the list: ArrowDown/ArrowUp move the active row,
 *     Enter / click commit the selection.
 *   - < 1280 px → the detail aside is dropped and the SplitView degrades to the
 *     plain selection list (TableView fallback) per the §17.12 breakpoint contract.
 *
 * Pure Client Component: NO DB calls — the parent RSC (T-130 view switcher)
 * supplies the already-org-scoped, RLS-enforced projects (merged listProjects).
 */

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monopilot/ui/Table';

import { ProjectDetailPanel } from './project-detail-panel';
import { gateLabelOf, type SplitLabels } from './split-labels';
import type { KanbanProject, PageState, ProjectPriority } from './kanban-types';

export type { SplitLabels } from './split-labels';
export type { KanbanProject, PageState } from './kanban-types';

const DESKTOP_QUERY = '(min-width: 1280px)';

function useIsDesktop(): boolean {
  // SSR-safe: assume desktop until the client confirms the viewport.
  const [isDesktop, setIsDesktop] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, []);
  return isDesktop;
}

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

function StateNotice({ state, labels }: { state: PageState; labels: SplitLabels }) {
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

export type SplitViewProps = {
  projects: KanbanProject[];
  labels: SplitLabels;
  state?: PageState;
};

export function SplitView({ projects, labels, state = 'ready' }: SplitViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();

  const selectedFromUrl = searchParams.get('selected');

  // Active selection: URL ?selected= wins; otherwise the first project.
  const [selectedId, setSelectedId] = React.useState<string | null>(
    selectedFromUrl ?? projects[0]?.id ?? null,
  );

  // Keep selection in sync when the URL changes (back/forward, shared link).
  React.useEffect(() => {
    if (selectedFromUrl && projects.some((p) => p.id === selectedFromUrl)) {
      setSelectedId(selectedFromUrl);
    }
  }, [selectedFromUrl, projects]);

  const select = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', id);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const activeIndex = React.useMemo(() => {
    const idx = projects.findIndex((p) => p.id === selectedId);
    return idx < 0 ? 0 : idx;
  }, [projects, selectedId]);

  const onListKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (projects.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = Math.min(activeIndex + 1, projects.length - 1);
        setSelectedId(projects[next]!.id);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        setSelectedId(projects[prev]!.id);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const current = projects[activeIndex];
        if (current) select(current.id);
      }
    },
    [activeIndex, projects, select],
  );

  const selectedProject = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  // Non-ready states: render the page chrome + the state notice (no list/aside).
  if (state !== 'ready' && state !== 'empty') {
    return (
      <main
        data-testid="split-screen"
        data-prototype-anchor="npd/pipeline.jsx:89-131"
        aria-labelledby="split-title"
        className="space-y-4"
      >
        <SplitHeader labels={labels} />
        <section className="card" style={{ padding: 0 }}>
          <StateNotice state={state} labels={labels} />
        </section>
      </main>
    );
  }

  if (state === 'empty' || projects.length === 0) {
    return (
      <main
        data-testid="split-screen"
        data-prototype-anchor="npd/pipeline.jsx:89-131"
        aria-labelledby="split-title"
        className="space-y-4"
      >
        <SplitHeader labels={labels} />
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

  const list = (
    <section
      role="region"
      aria-label={labels.listLabel}
      data-testid="split-list"
      className="card"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div
        role="listbox"
        aria-label={labels.listLabel}
        aria-activedescendant={`split-row-${projects[activeIndex]?.id}`}
        tabIndex={0}
        onKeyDown={onListKeyDown}
        className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.colCode}</TableHead>
              <TableHead scope="col">{labels.colName}</TableHead>
              <TableHead scope="col">{labels.colGate}</TableHead>
              <TableHead scope="col">{labels.colOwner}</TableHead>
              <TableHead scope="col">{labels.colProgress}</TableHead>
              <TableHead scope="col">{labels.colPrio}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const isSelected = project.id === selectedId;
              const progress = Math.max(0, Math.min(100, project.progressPercent));
              return (
                <TableRow
                  key={project.id}
                  id={`split-row-${project.id}`}
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected || undefined}
                  data-testid={`split-row-${project.code}`}
                  className={
                    isSelected
                      ? 'cursor-pointer bg-blue-50'
                      : 'cursor-pointer hover:bg-slate-50'
                  }
                  onClick={() => select(project.id)}
                >
                  <TableCell className="font-mono text-xs">{project.code}</TableCell>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell className="text-slate-600">
                    {gateLabelOf(project.currentGate, labels)}
                  </TableCell>
                  <TableCell>
                    {project.owner ?? <span className="text-slate-400">{labels.noOwner}</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-label={`${project.name}: ${progress}%`}
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        style={{ width: 80, height: 5, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}
                      >
                        <div
                          style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: progress >= 90 ? 'var(--green)' : 'var(--blue)',
                          }}
                        />
                      </div>
                      <span className="mono muted" style={{ fontSize: 11 }}>{progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={prioVariant(project.prio)}
                      aria-label={prioLabel(project.prio, labels)}
                    >
                      {prioLabel(project.prio, labels)}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );

  return (
    <main
      data-testid="split-screen"
      data-prototype-anchor="npd/pipeline.jsx:89-131"
      aria-labelledby="split-title"
      className="space-y-4"
    >
      <SplitHeader labels={labels} />

      {isDesktop ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
          {list}
          <ProjectDetailPanel project={selectedProject} labels={labels} />
        </div>
      ) : (
        // < 1280 px: TableView fallback — selection list only, no detail aside.
        list
      )}
    </main>
  );
}

function SplitHeader({ labels }: { labels: SplitLabels }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4" data-region="page-head">
      <div>
        <nav aria-label="breadcrumb" className="breadcrumb">
          NPD / {labels.title}
        </nav>
        <h1 id="split-title" className="page-title" style={{ marginTop: 2 }}>
          {labels.title}
        </h1>
        <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>{labels.subtitle}</p>
      </div>
    </header>
  );
}

export default SplitView;
