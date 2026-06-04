'use client';

/**
 * T-128 — Pipeline TableView (pipeline_table prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:54-88 (TableView)
 *   (prioBadge helper 12-17 + stageColor 4-10 are translated inline below)
 *
 * Translation notes (prototype-index-npd.json#pipeline / #split_view):
 *   - <table>/<thead>/<tbody>/<tr>/<td>            → shadcn Table family primitives
 *     (Table/TableHeader/TableBody/TableRow/TableHead/TableCell) — no hand-rolled
 *     <table> sort attributes (T-128 risk red-line).
 *   - 8 columns (Project/Name/Type/Stage/Owner/Progress/Target/Prio)            →
 *     Code / Name / Type / Current Gate / Priority / Owner / Target Launch /
 *     Progress (reordered to the acceptance-criteria column order).
 *   - stageColor[p.stage] + window.NPD_STAGES label → gate Badge on the merged
 *     Stage-Gate model (G0..Launched); the prototype's legacy stage model is
 *     @deprecated (BL-NPD-02) — documented in the closeout deviation log.
 *   - prioBadge helper                              → PriorityBadge (high/normal/low),
 *     colour paired with text (a11y: never colour-only).
 *   - inline progress bar (lines 73-79)            → accessible role="progressbar".
 *   - selectedId highlight + onSelect prop          → row activation → onSelect(id).
 *
 * T-128 contract layered on the static prototype table:
 *   - Sortable column headers (chevron) with URL persistence (?sort=&dir=) via
 *     useRouter + useSearchParams — the component does NOT mutate parent state.
 *   - Bulk-actions toolbar (Assign Owner / Set Priority / Move Gate) that appears
 *     when ≥1 row is checked (Checkbox primitive + select-all header checkbox).
 *
 * Data: REAL `ProjectSummary` rows (merged listProjects, T-057) projected to
 * `TableProject` by the parent RSC (T-130 view-switcher). NO DB calls here.
 * RBAC is resolved server-side by the parent; this Client Component never trusts
 * the client session.
 */

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monopilot/ui/Table';

export type ProjectGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'Launched';
export type ProjectPriority = 'high' | 'normal' | 'low';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** Sortable columns — keys persisted to the URL ?sort= param. */
export type SortColumn =
  | 'code'
  | 'name'
  | 'type'
  | 'gate'
  | 'priority'
  | 'owner'
  | 'target'
  | 'progress';

export type SortDir = 'asc' | 'desc';

/** A projection of the merged ProjectSummary (listProjects, T-057). */
export type TableProject = {
  id: string;
  code: string;
  name: string;
  type: string;
  currentGate: ProjectGate;
  prio: ProjectPriority;
  owner: string | null;
  targetLaunch: string | null;
  progressPercent: number;
};

export type TableLabels = {
  title: string;
  caption: string;
  colCode: string;
  colName: string;
  colType: string;
  colGate: string;
  colPriority: string;
  colOwner: string;
  colTarget: string;
  colProgress: string;
  gateG0: string;
  gateG1: string;
  gateG2: string;
  gateG3: string;
  gateG4: string;
  gateLaunched: string;
  prioHigh: string;
  prioNormal: string;
  prioLow: string;
  noOwner: string;
  noTarget: string;
  sortAsc: string;
  sortDesc: string;
  sortNone: string;
  selectAll: string;
  selectRow: string;
  selectedCount: string;
  bulkAssignOwner: string;
  bulkSetPriority: string;
  bulkMoveGate: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

const GATE_ORDER: ProjectGate[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'Launched'];
const PRIO_ORDER: Record<ProjectPriority, number> = { high: 0, normal: 1, low: 2 };

function gateLabel(gate: ProjectGate, labels: TableLabels): string {
  switch (gate) {
    case 'G0':
      return labels.gateG0;
    case 'G1':
      return labels.gateG1;
    case 'G2':
      return labels.gateG2;
    case 'G3':
      return labels.gateG3;
    case 'G4':
      return labels.gateG4;
    case 'Launched':
      return labels.gateLaunched;
    default:
      return gate;
  }
}

/** stageColor[p.stage] → gate Badge variant (text-paired, never colour-only). */
function gateVariant(gate: ProjectGate): BadgeVariant {
  switch (gate) {
    case 'G0':
      return 'muted';
    case 'G1':
      return 'info';
    case 'G2':
      return 'warning';
    case 'G3':
      return 'secondary';
    case 'G4':
      return 'default';
    case 'Launched':
      return 'success';
    default:
      return 'muted';
  }
}

/** prioBadge helper (prototype 12-17) → PriorityBadge. */
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

function prioLabel(prio: ProjectPriority, labels: TableLabels): string {
  switch (prio) {
    case 'high':
      return labels.prioHigh;
    case 'low':
      return labels.prioLow;
    default:
      return labels.prioNormal;
  }
}

const SORT_COLUMNS: SortColumn[] = [
  'code',
  'name',
  'type',
  'gate',
  'priority',
  'owner',
  'target',
  'progress',
];

function parseSort(params: URLSearchParams): { sort: SortColumn | null; dir: SortDir } {
  const rawSort = params.get('sort');
  const sort = rawSort && (SORT_COLUMNS as string[]).includes(rawSort) ? (rawSort as SortColumn) : null;
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  return { sort, dir };
}

function compareBy(column: SortColumn, a: TableProject, b: TableProject): number {
  switch (column) {
    case 'code':
      return a.code.localeCompare(b.code);
    case 'name':
      return a.name.localeCompare(b.name);
    case 'type':
      return a.type.localeCompare(b.type);
    case 'gate':
      return GATE_ORDER.indexOf(a.currentGate) - GATE_ORDER.indexOf(b.currentGate);
    case 'priority':
      return PRIO_ORDER[a.prio] - PRIO_ORDER[b.prio];
    case 'owner':
      return (a.owner ?? '').localeCompare(b.owner ?? '');
    case 'target':
      return (a.targetLaunch ?? '').localeCompare(b.targetLaunch ?? '');
    case 'progress':
      return a.progressPercent - b.progressPercent;
    default:
      return 0;
  }
}

function sortProjects(
  projects: TableProject[],
  sort: SortColumn | null,
  dir: SortDir,
): TableProject[] {
  if (!sort) return projects;
  const sorted = [...projects].sort((a, b) => compareBy(sort, a, b));
  return dir === 'desc' ? sorted.reverse() : sorted;
}

type ColumnDef = { key: SortColumn; label: keyof TableLabels };

const COLUMNS: ColumnDef[] = [
  { key: 'code', label: 'colCode' },
  { key: 'name', label: 'colName' },
  { key: 'type', label: 'colType' },
  { key: 'gate', label: 'colGate' },
  { key: 'priority', label: 'colPriority' },
  { key: 'owner', label: 'colOwner' },
  { key: 'target', label: 'colTarget' },
  { key: 'progress', label: 'colProgress' },
];

function StateNotice({ state, labels }: { state: PageState; labels: TableLabels }) {
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

export type TableViewProps = {
  projects: TableProject[];
  labels: TableLabels;
  state?: PageState;
  /** Row activation — parent (SplitView/T-129) tracks selection; no parent mutation here. */
  onSelect?: (id: string) => void;
};

export function TableView({ projects, labels, state = 'ready', onSelect }: TableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sort, dir } = parseSort(searchParams);

  const [selected, setSelected] = React.useState<Record<string, boolean>>({});

  const toggleSort = React.useCallback(
    (column: SortColumn) => {
      const next = new URLSearchParams(searchParams.toString());
      const nextDir: SortDir = sort === column && dir === 'asc' ? 'desc' : 'asc';
      next.set('sort', column);
      next.set('dir', nextDir);
      router.push(`?${next.toString()}`);
    },
    [router, searchParams, sort, dir],
  );

  const ordered = React.useMemo(() => sortProjects(projects, sort, dir), [projects, sort, dir]);

  const selectedIds = React.useMemo(
    () => ordered.filter((p) => selected[p.id]).map((p) => p.id),
    [ordered, selected],
  );
  const selectedCount = selectedIds.length;
  const allSelected = ordered.length > 0 && selectedCount === ordered.length;

  const toggleAll = React.useCallback(
    (checked: boolean) => {
      setSelected(() => {
        if (!checked) return {};
        const next: Record<string, boolean> = {};
        for (const project of ordered) next[project.id] = true;
        return next;
      });
    },
    [ordered],
  );

  const toggleRow = React.useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);

  if (state !== 'ready' && state !== 'empty') {
    return (
      <section
        data-testid="pipeline-table-screen"
        data-prototype-anchor="npd/pipeline.jsx:54-88"
        aria-label={labels.title}
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <StateNotice state={state} labels={labels} />
      </section>
    );
  }

  if (ordered.length === 0) {
    return (
      <section
        data-testid="pipeline-table-screen"
        data-prototype-anchor="npd/pipeline.jsx:54-88"
        aria-label={labels.title}
        className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm"
      >
        <p className="text-base font-semibold text-slate-900">{labels.empty}</p>
        <p className="mt-1 text-sm text-slate-600">{labels.emptyBody}</p>
      </section>
    );
  }

  const sortStateLabel = (column: SortColumn): string => {
    if (sort !== column) return labels.sortNone;
    return dir === 'asc' ? labels.sortAsc : labels.sortDesc;
  };

  const sortIndicator = (column: SortColumn): string => {
    if (sort !== column) return '↕';
    return dir === 'asc' ? '↑' : '↓';
  };

  return (
    <section
      data-testid="pipeline-table-screen"
      data-prototype-anchor="npd/pipeline.jsx:54-88"
      aria-label={labels.title}
      className="space-y-2"
    >
      {selectedCount > 0 ? (
        <div
          role="toolbar"
          aria-label={labels.selectedCount.replace('{count}', String(selectedCount))}
          className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
        >
          <span data-testid="pipeline-bulk-count" className="px-1 text-sm font-medium text-slate-700">
            {labels.selectedCount.replace('{count}', String(selectedCount))}
          </span>
          <Button type="button" data-testid="bulk-assign-owner">
            {labels.bulkAssignOwner}
          </Button>
          <Button type="button" data-testid="bulk-set-priority">
            {labels.bulkSetPriority}
          </Button>
          <Button type="button" data-testid="bulk-move-gate">
            {labels.bulkMoveGate}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableCaption className="sr-only">{labels.caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-10">
                <Checkbox
                  checked={allSelected}
                  aria-label={labels.selectAll}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              {COLUMNS.map((column) => {
                const headerText = labels[column.label];
                const active = sort === column.key;
                return (
                  <TableHead
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      data-testid={`pipeline-sort-${column.key}`}
                      onClick={() => toggleSort(column.key)}
                      aria-label={`${headerText}, ${sortStateLabel(column.key)}`}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-950"
                    >
                      <span>{headerText}</span>
                      <span aria-hidden="true" className="text-xs text-slate-400">
                        {sortIndicator(column.key)}
                      </span>
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((project) => {
              const progress = Math.max(0, Math.min(100, project.progressPercent));
              const rowSelected = Boolean(selected[project.id]);
              return (
                <TableRow
                  key={project.id}
                  data-testid={`pipeline-table-row-${project.code}`}
                  data-code={project.code}
                  data-selected={rowSelected || undefined}
                  className={
                    rowSelected
                      ? 'cursor-pointer bg-blue-50'
                      : 'cursor-pointer hover:bg-slate-50'
                  }
                  onClick={() => onSelect?.(project.id)}
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={rowSelected}
                      aria-label={`${labels.selectRow}: ${project.code}`}
                      onCheckedChange={(checked) => toggleRow(project.id, checked)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{project.code}</TableCell>
                  <TableCell className="font-medium text-slate-900">{project.name}</TableCell>
                  <TableCell className="text-slate-500">{project.type}</TableCell>
                  <TableCell>
                    <Badge variant={gateVariant(project.currentGate)}>
                      {gateLabel(project.currentGate, labels)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={prioVariant(project.prio)} aria-label={prioLabel(project.prio, labels)}>
                      {prioLabel(project.prio, labels)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {project.owner ?? <span className="text-slate-400">{labels.noOwner}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {project.targetLaunch ?? (
                      <span className="text-slate-400">{labels.noTarget}</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-label={project.name}
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-1.5 max-w-[100px] flex-1 overflow-hidden rounded bg-slate-100"
                      >
                        <div
                          className={progress >= 90 ? 'h-full bg-green-500' : 'h-full bg-blue-500'}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="min-w-[30px] font-mono text-[11px] text-slate-500">
                        {progress}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default TableView;
