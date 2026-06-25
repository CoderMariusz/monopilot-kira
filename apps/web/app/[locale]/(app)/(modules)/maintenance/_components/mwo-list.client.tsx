'use client';

/**
 * 13-MAINTENANCE — /maintenance MWO list screen (Wave-8 lane CL1).
 *
 * Prototype parity (1:1 where the slice covers it):
 *   - status tabs with per-tab counts (TabsCounted)
 *       → prototypes/design/Monopilot Design System/maintenance/work-orders.jsx:66-141
 *   - search box (MWO #, machine, title) + "+ New mWO" header action
 *       → work-orders.jsx:131-136
 *   - dense table: mWO # (mono), asset/machine, priority badge, status badge,
 *     source chip, per-status row action (open→Start, in_progress→Complete)
 *       → work-orders.jsx:200-231
 *   - create modal (machine select, priority, problem description, due date)
 *       → modals.jsx:186-233 (MwoCreateModal)
 *   - PM schedules list view (read-only) → pm-schedules.jsx:3-277 (list view only)
 *
 * Documented deviations (slice scope, per lane CL1):
 *   - type/source filter bar, §3.3 grouped-by-status accordion, overdue/My-work
 *     tabs, WR triage/assign modals, export — deferred to later 13-c slices.
 *   - mWO type radio is not offered: this slice creates 'reactive' machine MWOs
 *     only (PM/calibration/sanitation types are engine-created later).
 *   - asset select = public.machines (the real registry), not MNT_ASSETS.
 *
 * Presentational: rows, counts, labels, RBAC flags and the server actions all
 * arrive from the server page; this component owns only tab/search/modal state.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../lib/shared/download';
import type {
  MachineOption,
  MwoListRow,
  MwoOverviewStats,
  MwoPriority,
  MwoSource,
  MwoState,
  MwoTransition,
  PmScheduleRow,
} from '../_actions/mwo-actions';

const STATE_VARIANT: Record<MwoState, BadgeVariant> = {
  requested: 'warning',
  approved: 'info',
  open: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'muted',
};

const PRIORITY_VARIANT: Record<MwoPriority, BadgeVariant> = {
  low: 'muted',
  medium: 'secondary',
  high: 'warning',
  critical: 'danger',
};

/** Tab order mirrors the prototype (work-orders.jsx:66-76). */
const TAB_ORDER: Array<'all' | MwoState> = [
  'all',
  'requested',
  'approved',
  'open',
  'in_progress',
  'completed',
  'cancelled',
];

export type MwoListLabels = {
  countLine: string;
  searchPlaceholder: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  viewWorkOrders: string;
  viewPmSchedules: string;
  tab: Record<'all' | MwoState, string>;
  status: Record<MwoState, string>;
  priority: Record<MwoPriority, string>;
  source: Record<MwoSource, string>;
  overdue: string;
  overview?: {
    backlogTitle: string;
    backlogSubtitle: string;
    d0_7: string;
    d8_30: string;
    d31_plus: string;
    ratioTitle: string;
    ratioSubtitle: string;
    planned: string;
    unplanned: string;
    exportCsv: string;
  };
  col: {
    mwo: string;
    machine: string;
    title: string;
    priority: string;
    status: string;
    source: string;
    due: string;
    created: string;
    actions: string;
  };
  action: { start: string; complete: string; cancel: string };
  create: {
    button: string;
    title: string;
    machine: string;
    machinePlaceholder: string;
    noMachines: string;
    titleField: string;
    titlePlaceholder: string;
    description: string;
    descriptionPlaceholder: string;
    priority: string;
    dueDate: string;
    submit: string;
    submitting: string;
    cancel: string;
    errorRequired: string;
    errorFailed: string;
  };
  transition: {
    startTitle: string;
    completeTitle: string;
    cancelTitle: string;
    noteComplete: string;
    noteCancel: string;
    confirmStart: string;
    confirmComplete: string;
    confirmCancel: string;
    dismiss: string;
    errorFailed: string;
    errorIllegal: string;
    errorForbidden: string;
  };
  pm: {
    title: string;
    empty: string;
    col: {
      equipment: string;
      type: string;
      interval: string;
      nextDue: string;
      lastCompleted: string;
      active: string;
    };
    type: Record<PmScheduleRow['scheduleType'], string>;
    intervalUnit: Record<PmScheduleRow['intervalBasis'], string>;
    activeYes: string;
    activeNo: string;
  };
};

export type MwoActionPermissions = {
  canCreate: boolean;
  canExecute: boolean;
  canCancel: boolean;
};

type CreateResult =
  | { ok: true; data: MwoListRow }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'invalid_transition' | 'error'; message?: string };

export type CreateMwoAction = (input: {
  machineId: string;
  title: string;
  description?: string;
  priority: MwoPriority;
  dueDate?: string;
}) => Promise<CreateResult>;

export type TransitionMwoAction = (input: {
  mwoId: string;
  to: MwoTransition;
  note?: string;
}) => Promise<CreateResult>;

// Formatters live IN this client module — passing functions from the RSC page
// crashes live with Next16 "Functions cannot be passed to Client Components".
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

const OPEN_STATES: ReadonlySet<MwoState> = new Set(['requested', 'approved', 'open', 'in_progress']);

export function MwoListScreen({
  rows,
  statusCounts,
  overviewStats,
  pmSchedules,
  machines,
  labels,
  permissions,
  createMwoAction,
  transitionMwoAction,
}: {
  rows: MwoListRow[];
  statusCounts: Record<MwoState, number>;
  overviewStats?: MwoOverviewStats;
  pmSchedules: PmScheduleRow[];
  machines: MachineOption[];
  labels: MwoListLabels;
  permissions: MwoActionPermissions;
  createMwoAction: CreateMwoAction;
  transitionMwoAction: TransitionMwoAction;
}) {
  const router = useRouter();
  const [view, setView] = useState<'mwos' | 'pm'>('mwos');
  const [tab, setTab] = useState<'all' | MwoState>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{
    row: MwoListRow;
    to: MwoTransition;
  } | null>(null);
  const overviewLabels = labels.overview ?? {
    backlogTitle: 'Backlog ageing',
    backlogSubtitle: 'Open MWOs by age',
    d0_7: '0-7 days',
    d8_30: '8-30 days',
    d31_plus: '31+ days',
    ratioTitle: 'Planned vs unplanned',
    ratioSubtitle: 'Open MWO source mix',
    planned: 'Planned',
    unplanned: 'Unplanned',
    exportCsv: 'Export CSV',
  };
  const stats = overviewStats ?? buildOverviewStats(rows);

  const tabCount = (k: 'all' | MwoState): number =>
    k === 'all' ? rows.length : statusCounts[k] ?? 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tab === 'all' || r.state === tab) &&
        (q === '' ||
          r.mwoNumber.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          (r.machineCode ?? '').toLowerCase().includes(q) ||
          (r.machineName ?? '').toLowerCase().includes(q)),
    );
  }, [rows, tab, search]);

  const today = new Date().toISOString().slice(0, 10);
  const handleExportCsv = () => {
    const csv = toCsv(
      [
        'id',
        'mwo_number',
        'title',
        'state',
        'priority',
        'source',
        'machine_id',
        'machine_code',
        'machine_name',
        'due_date',
        'created_at',
        'started_at',
        'completed_at',
      ],
      visible.map((r) => [
        r.id,
        r.mwoNumber,
        r.title,
        r.state,
        r.priority,
        r.source,
        r.machineId,
        r.machineCode,
        r.machineName,
        r.dueDate,
        r.createdAt,
        r.startedAt,
        r.completedAt,
      ]),
    );
    downloadCsv(csv, `maintenance-mwos-${isoDateStamp()}.csv`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* View switch: Work orders / PM schedules */}
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label={labels.viewWorkOrders} className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(
            [
              { k: 'mwos' as const, l: labels.viewWorkOrders },
              { k: 'pm' as const, l: labels.viewPmSchedules },
            ] as const
          ).map(({ k, l }) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={view === k}
              data-testid={`mwo-view-${k}`}
              onClick={() => setView(k)}
              className={[
                'rounded-md px-3 py-1.5 text-sm transition',
                view === k ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto" />
        {view === 'mwos' && permissions.canCreate ? (
          <button
            type="button"
            data-testid="mwo-create-open"
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {labels.create.button}
          </button>
        ) : null}
      </div>

      {view === 'pm' ? (
        <PmScheduleList pmSchedules={pmSchedules} labels={labels} />
      ) : (
        <>
          <p data-testid="mwo-count-line" className="text-xs text-slate-500">
            {labels.countLine}
          </p>

          <MwoOverview stats={stats} labels={overviewLabels} />

          {/* Status tabs (work-orders.jsx:66-141) */}
          <div role="tablist" aria-label={labels.col.status} className="flex flex-wrap gap-1 border-b border-slate-200">
            {TAB_ORDER.map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  data-testid={`mwo-tab-${k}`}
                  onClick={() => setTab(k)}
                  className={[
                    'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition',
                    on
                      ? 'border-slate-900 font-semibold text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  {labels.tab[k]}
                  <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">
                    {tabCount(k)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + row count */}
          <Card className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              data-testid="mwo-search"
              className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
            <span className="ml-auto text-xs text-slate-500" data-testid="mwo-rows">
              {labels.rowsLabel.replace('{count}', String(visible.length))}
            </span>
            <button
              type="button"
              data-testid="mwo-export-csv"
              onClick={handleExportCsv}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {overviewLabels.exportCsv}
            </button>
          </Card>

          {/* Table / honest empty states */}
          <Card data-testid="mwo-table-card" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {rows.length === 0 ? (
              <p data-testid="mwo-empty" data-state="empty" className="px-4 py-10 text-center text-sm text-slate-500">
                {labels.emptyAll}
              </p>
            ) : visible.length === 0 ? (
              <p data-testid="mwo-empty-filtered" data-state="empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
                {labels.emptyFiltered}
              </p>
            ) : (
              <Table aria-label={labels.viewWorkOrders}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.col.mwo}</TableHead>
                    <TableHead scope="col">{labels.col.machine}</TableHead>
                    <TableHead scope="col">{labels.col.title}</TableHead>
                    <TableHead scope="col">{labels.col.priority}</TableHead>
                    <TableHead scope="col">{labels.col.status}</TableHead>
                    <TableHead scope="col">{labels.col.source}</TableHead>
                    <TableHead scope="col">{labels.col.due}</TableHead>
                    <TableHead scope="col">{labels.col.created}</TableHead>
                    <TableHead scope="col">{labels.col.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => {
                    const overdue = OPEN_STATES.has(r.state) && r.dueDate !== null && r.dueDate < today;
                    return (
                      <TableRow key={r.id} data-testid={`mwo-row-${r.id}`}>
                        <TableCell className="font-mono text-sm font-semibold text-slate-900">{r.mwoNumber}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {r.machineCode ? (
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-semibold text-slate-900">{r.machineCode}</span>
                              <span className="text-[11px] text-slate-500">{r.machineName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400" title={r.machineId ?? undefined}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-sm text-slate-700" title={r.title}>
                          {r.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant={PRIORITY_VARIANT[r.priority]}>{labels.priority[r.priority]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATE_VARIANT[r.state]}>{labels.status[r.state]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{labels.source[r.source]}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">
                          <span className={overdue ? 'font-semibold text-red-600' : undefined}>
                            {fmtDate(r.dueDate)}
                          </span>
                          {overdue ? (
                            <Badge variant="danger" className="ml-1.5 text-[10px]" data-testid={`mwo-overdue-${r.id}`}>
                              {labels.overdue}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-slate-500">{fmtDateTime(r.createdAt)}</TableCell>
                        <TableCell>
                          <RowActions
                            row={r}
                            labels={labels}
                            permissions={permissions}
                            onTransition={(to) => setPendingTransition({ row: r, to })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {createOpen ? (
        <MwoCreateModal
          machines={machines}
          labels={labels}
          createMwoAction={createMwoAction}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {pendingTransition ? (
        <MwoTransitionModal
          row={pendingTransition.row}
          to={pendingTransition.to}
          labels={labels}
          transitionMwoAction={transitionMwoAction}
          onClose={() => setPendingTransition(null)}
          onDone={() => {
            setPendingTransition(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function buildOverviewStats(rows: MwoListRow[]): MwoOverviewStats {
  const now = Date.now();
  const backlog = { d0_7: 0, d8_30: 0, d31_plus: 0 };
  const ratio = { planned: 0, unplanned: 0 };
  for (const row of rows) {
    if (!OPEN_STATES.has(row.state)) continue;
    const created = new Date(row.createdAt).getTime();
    const ageDays = Number.isNaN(created) ? 0 : Math.max(0, Math.floor((now - created) / 86_400_000));
    if (ageDays <= 7) backlog.d0_7 += 1;
    else if (ageDays <= 30) backlog.d8_30 += 1;
    else backlog.d31_plus += 1;

    if (row.source === 'pm_schedule' || row.source === 'calibration_alert') ratio.planned += 1;
    else ratio.unplanned += 1;
  }
  return { backlog, ratio };
}

function MwoOverview({
  stats,
  labels,
}: {
  stats: MwoOverviewStats;
  labels: NonNullable<MwoListLabels['overview']>;
}) {
  const backlog = [
    { label: labels.d0_7, value: stats.backlog.d0_7 },
    { label: labels.d8_30, value: stats.backlog.d8_30 },
    { label: labels.d31_plus, value: stats.backlog.d31_plus },
  ];
  const backlogMax = Math.max(1, ...backlog.map((b) => b.value));
  const ratioTotal = Math.max(1, stats.ratio.planned + stats.ratio.unplanned);
  const plannedPct = Math.round((stats.ratio.planned / ratioTotal) * 100);
  const unplannedPct = Math.max(0, 100 - plannedPct);

  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]" data-testid="mwo-overview">
      <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">{labels.backlogTitle}</h2>
          <p className="text-xs text-slate-500">{labels.backlogSubtitle}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {backlog.map((bucket) => (
            <div key={bucket.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">{bucket.label}</span>
                <span className="font-mono text-lg font-semibold text-slate-900">{bucket.value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200" aria-hidden="true">
                <div
                  className="h-2 rounded-full bg-slate-900"
                  style={{ width: `${Math.max(4, Math.round((bucket.value / backlogMax) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">{labels.ratioTitle}</h2>
          <p className="text-xs text-slate-500">{labels.ratioSubtitle}</p>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-amber-100" aria-hidden="true">
          <div className="bg-emerald-600" style={{ width: `${plannedPct}%` }} />
          <div className="bg-amber-400" style={{ width: `${unplannedPct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-slate-500">{labels.planned}</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{stats.ratio.planned}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{labels.unplanned}</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{stats.ratio.unplanned}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>{plannedPct}%</span>
          <span>{unplannedPct}%</span>
        </div>
      </Card>
    </div>
  );
}

/** Per-status row action (work-orders.jsx:222-227): open→Start, in_progress→Complete, + Cancel. */
function RowActions({
  row,
  labels,
  permissions,
  onTransition,
}: {
  row: MwoListRow;
  labels: MwoListLabels;
  permissions: MwoActionPermissions;
  onTransition: (to: MwoTransition) => void;
}) {
  const terminal = row.state === 'completed' || row.state === 'cancelled';
  if (terminal) return <span className="text-xs text-slate-300">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {row.state === 'open' && permissions.canExecute ? (
        <button
          type="button"
          data-testid={`mwo-start-${row.id}`}
          onClick={() => onTransition('in_progress')}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {labels.action.start}
        </button>
      ) : null}
      {row.state === 'in_progress' && permissions.canExecute ? (
        <button
          type="button"
          data-testid={`mwo-complete-${row.id}`}
          onClick={() => onTransition('completed')}
          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          {labels.action.complete}
        </button>
      ) : null}
      {permissions.canCancel ? (
        <button
          type="button"
          data-testid={`mwo-cancel-${row.id}`}
          onClick={() => onTransition('cancelled')}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-red-200 hover:text-red-600"
        >
          {labels.action.cancel}
        </button>
      ) : null}
      {!permissions.canExecute && !permissions.canCancel ? (
        <span className="text-xs text-slate-300">—</span>
      ) : null}
    </div>
  );
}

/** MODAL: create MWO (modals.jsx:186-233, machine-scoped reactive subset). */
function MwoCreateModal({
  machines,
  labels,
  createMwoAction,
  onClose,
  onCreated,
}: {
  machines: MachineOption[];
  labels: MwoListLabels;
  createMwoAction: CreateMwoAction;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [machineId, setMachineId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MwoPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const submit = () => {
    if (!machineId || title.trim().length < 3) {
      setError(labels.create.errorRequired);
      return;
    }
    setError(null);
    startSubmit(async () => {
      const result = await createMwoAction({
        machineId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      });
      if (result.ok) onCreated();
      else setError(result.reason === 'forbidden' ? labels.transition.errorForbidden : labels.create.errorFailed);
    });
  };

  return (
    <ModalShell title={labels.create.title} testId="mwo-create-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.machine}</span>
          {machines.length === 0 ? (
            <span data-testid="mwo-create-no-machines" className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              {labels.create.noMachines}
            </span>
          ) : (
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              data-testid="mwo-create-machine"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">{labels.create.machinePlaceholder}</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.titleField}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={labels.create.titlePlaceholder}
            data-testid="mwo-create-title"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.description}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={labels.create.descriptionPlaceholder}
            rows={3}
            data-testid="mwo-create-description"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.create.priority}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as MwoPriority)}
              data-testid="mwo-create-priority"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            >
              {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                <option key={p} value={p}>
                  {labels.priority[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.create.dueDate}</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="mwo-create-due-date"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>

        {error ? (
          <p role="alert" data-testid="mwo-create-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="mwo-create-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.create.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || machines.length === 0}
            data-testid="mwo-create-submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? labels.create.submitting : labels.create.submit}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/** MODAL: confirm a state transition (note for complete/cancel). */
function MwoTransitionModal({
  row,
  to,
  labels,
  transitionMwoAction,
  onClose,
  onDone,
}: {
  row: MwoListRow;
  to: MwoTransition;
  labels: MwoListLabels;
  transitionMwoAction: TransitionMwoAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const title =
    to === 'in_progress'
      ? labels.transition.startTitle
      : to === 'completed'
        ? labels.transition.completeTitle
        : labels.transition.cancelTitle;
  const confirmLabel =
    to === 'in_progress'
      ? labels.transition.confirmStart
      : to === 'completed'
        ? labels.transition.confirmComplete
        : labels.transition.confirmCancel;
  const noteLabel = to === 'cancelled' ? labels.transition.noteCancel : labels.transition.noteComplete;

  const submit = () => {
    setError(null);
    startSubmit(async () => {
      const result = await transitionMwoAction({
        mwoId: row.id,
        to,
        note: note.trim() || undefined,
      });
      if (result.ok) onDone();
      else if (result.reason === 'forbidden') setError(labels.transition.errorForbidden);
      else if (result.reason === 'invalid_transition') setError(labels.transition.errorIllegal);
      else setError(labels.transition.errorFailed);
    });
  };

  return (
    <ModalShell title={`${title} — ${row.mwoNumber}`} testId="mwo-transition-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {to !== 'in_progress' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{noteLabel}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              data-testid="mwo-transition-note"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        ) : null}

        {error ? (
          <p role="alert" data-testid="mwo-transition-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="mwo-transition-dismiss"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.transition.dismiss}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            data-testid="mwo-transition-confirm"
            className={[
              'rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300',
              to === 'cancelled' ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800',
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/** Read-only PM schedule list (pm-schedules.jsx:3-277, list view only). */
function PmScheduleList({ pmSchedules, labels }: { pmSchedules: PmScheduleRow[]; labels: MwoListLabels }) {
  return (
    <Card data-testid="pm-schedule-card" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {pmSchedules.length === 0 ? (
        <p data-testid="pm-empty" data-state="empty" className="px-4 py-10 text-center text-sm text-slate-500">
          {labels.pm.empty}
        </p>
      ) : (
        <Table aria-label={labels.pm.title}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.pm.col.equipment}</TableHead>
              <TableHead scope="col">{labels.pm.col.type}</TableHead>
              <TableHead scope="col">{labels.pm.col.interval}</TableHead>
              <TableHead scope="col">{labels.pm.col.nextDue}</TableHead>
              <TableHead scope="col">{labels.pm.col.lastCompleted}</TableHead>
              <TableHead scope="col">{labels.pm.col.active}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pmSchedules.map((s) => (
              <TableRow key={s.id} data-testid={`pm-row-${s.id}`}>
                <TableCell className="text-xs text-slate-600">
                  {s.equipmentCode ? (
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-semibold text-slate-900">{s.equipmentCode}</span>
                      <span className="text-[11px] text-slate-500">{s.equipmentName}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{labels.pm.type[s.scheduleType]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600">
                  {s.intervalValue} {labels.pm.intervalUnit[s.intervalBasis]}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600">{fmtDate(s.nextDueDate)}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{fmtDateTime(s.lastCompletedAt)}</TableCell>
                <TableCell>
                  <Badge variant={s.active ? 'success' : 'muted'}>
                    {s.active ? labels.pm.activeYes : labels.pm.activeNo}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** Minimal a11y modal shell (overlay + dialog), styled to the locked system. */
function ModalShell({
  title,
  testId,
  onClose,
  children,
}: {
  title: string;
  testId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      data-testid={`${testId}-overlay`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
