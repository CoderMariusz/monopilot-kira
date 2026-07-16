'use client';

/**
 * 13-MAINTENANCE — /maintenance MWO list screen (Wave-8 lane CL1).
 *
 * Prototype parity (1:1 where the slice covers it):
 *   - status tabs with per-tab counts (TabsCounted)
 *       → prototypes/design/Monopilot Design System/maintenance/work-orders.jsx:66-141
 *   - search box (MWO #, equipment, title) + "+ New mWO" header action
 *       → work-orders.jsx:131-136
 *   - dense table: mWO # (mono), asset/equipment, priority badge, status badge,
 *     source chip, per-status row action (open→Start, in_progress→Complete)
 *       → work-orders.jsx:200-231
 *   - create modal (equipment select, priority, problem description, due date)
 *       → modals.jsx:186-233 (MwoCreateModal)
 *   - PM schedules list view (read-only) → pm-schedules.jsx:3-277 (list view only)
 *
 * Documented deviations (slice scope, per lane CL1):
 *   - type/source filter bar, §3.3 grouped-by-status accordion, overdue/My-work
 *     tabs, WR triage/assign modals, export — deferred to later 13-c slices.
 *   - mWO type radio is not offered: this slice creates 'reactive' equipment MWOs
 *     only (PM/calibration/sanitation types are engine-created later).
 *   - asset select = public.equipment (the real registry), not MNT_ASSETS.
 *
 * Presentational: rows, counts, labels, RBAC flags and the server actions all
 * arrive from the server page; this component owns only tab/search/modal state.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../lib/shared/download';
import { MwoCreateModal } from './mwo-create-modal';
import { MwoOverview } from './mwo-overview';
import { PmScheduleList } from './mwo-pm-schedule-list';
import { RowActions } from './mwo-row-actions';
import { MwoTransitionModal } from './mwo-transition-modal';
import type {
  EquipmentOption,
  MwoListRow,
  MwoOverviewStats,
  MwoPriority,
  MwoSource,
  MwoState,
  MwoTransition,
  PmScheduleRow,
} from '../_actions/mwo-actions';

export const STATE_VARIANT: Record<MwoState, BadgeVariant> = {
  requested: 'warning',
  approved: 'info',
  open: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'muted',
};

export const PRIORITY_VARIANT: Record<MwoPriority, BadgeVariant> = {
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
    equipment: string;
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
    equipment: string;
    equipmentPlaceholder: string;
    noEquipment: string;
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
  edit: {
    button: string;
    title: string;
    submit: string;
    submitting: string;
    cancel: string;
    errorRequired: string;
    errorFailed: string;
    errorForbidden: string;
    errorLocked: string;
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
    /** Honest scope note — list + generate-from-due only; no schedule editor yet. */
    subtitle: string;
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
    generateMwo: string;
    generating: string;
    generateFailed: string;
    colActions: string;
  };
};

export type MwoActionPermissions = {
  canCreate: boolean;
  canExecute: boolean;
  canCancel: boolean;
};

type MwoActionFailureReason =
  | 'forbidden'
  | 'not_found'
  | 'invalid_transition'
  | 'loto_not_verified'
  | 'loto_same_actor'
  | 'esign_failed'
  | 'error';

type CreateResult =
  | { ok: true; data: MwoListRow }
  | { ok: false; reason: MwoActionFailureReason; message?: string };

export type CreateMwoAction = (input: {
  equipmentId: string;
  title: string;
  description?: string;
  priority: MwoPriority;
  dueDate?: string;
}) => Promise<CreateResult>;

export type GenerateMwoFromPmScheduleAction = (input: { scheduleId: string }) => Promise<CreateResult>;

export type TransitionMwoAction = (input: {
  mwoId: string;
  to: MwoTransition;
  note?: string;
}) => Promise<CreateResult>;

// Formatters live IN this client module — passing functions from the RSC page
// crashes live with Next16 "Functions cannot be passed to Client Components".
export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
export function fmtDateTime(iso: string | null): string {
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
  equipment,
  labels,
  permissions,
  createMwoAction,
  generateMwoFromPmScheduleAction,
  transitionMwoAction,
}: {
  rows: MwoListRow[];
  statusCounts: Record<MwoState, number>;
  overviewStats?: MwoOverviewStats;
  pmSchedules: PmScheduleRow[];
  equipment: EquipmentOption[];
  labels: MwoListLabels;
  permissions: MwoActionPermissions;
  createMwoAction: CreateMwoAction;
  generateMwoFromPmScheduleAction: GenerateMwoFromPmScheduleAction;
  transitionMwoAction: TransitionMwoAction;
}) {
  const router = useRouter();
  const params = useParams();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
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
          (r.equipmentCode ?? '').toLowerCase().includes(q) ||
          (r.equipmentName ?? '').toLowerCase().includes(q)),
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
        'equipment_id',
        'equipment_code',
        'equipment_name',
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
        r.equipmentId,
        r.equipmentCode,
        r.equipmentName,
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
        <PmScheduleList
          pmSchedules={pmSchedules}
          labels={labels}
          canGenerate={permissions.canCreate}
          generateMwoFromPmScheduleAction={generateMwoFromPmScheduleAction}
          onGenerated={() => router.refresh()}
        />
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
                    <TableHead scope="col">{labels.col.equipment}</TableHead>
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
                        <TableCell className="font-mono text-sm font-semibold text-slate-900">
                          <Link
                            href={`/${locale}/maintenance/mwos/${r.id}`}
                            className="hover:underline"
                            data-testid={`mwo-link-${r.id}`}
                          >
                            {r.mwoNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {r.equipmentCode ? (
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-semibold text-slate-900">{r.equipmentCode}</span>
                              <span className="text-[11px] text-slate-500">{r.equipmentName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400" title={r.equipmentId ?? undefined}>—</span>
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
          equipment={equipment}
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
