'use client';

/**
 * P-L1 — `/production/wos` WO list screen (prototype wo-list.jsx:4-106).
 *
 * Presentational client component: receives already-loaded, org-scoped rows +
 * status counts + i18n labels from the server page and owns ONLY the client-side
 * tab + search filter state (prototype's `tab` / `search` useState). No data
 * fetching, no permission logic (both resolved server-side).
 *
 * Prototype parity:
 *   - status tabs (all / in_progress / paused / ready→planned / completed / draft)
 *     with per-tab counts                                       → wo-list.jsx:8-40
 *   - search box (WO number / product / item code)             → wo-list.jsx:42-50
 *   - dense table: WO number (mono) + allergen badge, item/product, line, status
 *     badge, planned, progress bar, output, schedule           → wo-list.jsx:52-101
 *   - rows link to the WO detail (`/production/wos/<id>`)      → wo-list.jsx:72 onOpenWo
 *
 * Deviations: the prototype's "draft" / "ready" tabs map to this screen's
 * `planned` materialized state (Production has no DRAFT — release happens in
 * 04-PLANNING); the "+ Release WO" control is never rendered (red-line). The
 * per-row Start/Pause/Resume action buttons are deferred to a follow-up lane and
 * rendered DISABLED with an explanatory title so nothing looks broken.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { WoListStatus, WorkOrderListItem } from '../../_actions/list-work-orders';
import { WoRowActions } from './modals/wo-row-actions';
import type {
  WoActionPermissions,
  WoModalLabels,
  WoReasonCategory,
  WoState,
} from './modals/types';

const STATUS_VARIANT: Record<WoListStatus, BadgeVariant> = {
  planned: 'muted',
  in_progress: 'info',
  paused: 'warning',
  completed: 'success',
  closed: 'secondary',
  cancelled: 'danger',
};

/** Tab order mirrors the prototype: all first, then the live operational states. */
const TAB_ORDER: Array<'all' | WoListStatus> = [
  'all',
  'in_progress',
  'paused',
  'planned',
  'completed',
  'closed',
  'cancelled',
];

export type WoListLabels = {
  title: string;
  countLine: string;
  searchPlaceholder: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  allergenBadge: string;
  deferredActionTitle: string;
  pauseAction: string;
  resumeAction: string;
  startAction: string;
  viewAction: string;
  tab: Record<'all' | WoListStatus, string>;
  status: Record<WoListStatus, string>;
  col: {
    wo: string;
    product: string;
    line: string;
    status: string;
    planned: string;
    progress: string;
    output: string;
    schedule: string;
    actions: string;
  };
};

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-sky-500' : 'bg-amber-500';
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"
    >
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Server-resolved per-row action context (RBAC + reference lists + signer). */
export type WoListActions = {
  locale: string;
  permissions: WoActionPermissions;
  downtimeCategories: WoReasonCategory[];
  modalLabels: WoModalLabels;
};

// Formatters live IN this client module — passing them as props from the RSC
// page crashed live with the Next16 "Functions cannot be passed to Client
// Components" error (vitest can't catch it; wave-P1 live verify did).
const QTY_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function fmtQty(n: number): string {
  return QTY_FMT.format(Math.round(n));
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
function detailHref(id: string): string {
  return `/production/wos/${id}`;
}

export function WoListScreen({
  rows,
  statusCounts,
  labels,
  actions,
}: {
  rows: WorkOrderListItem[];
  statusCounts: Record<WoListStatus, number>;
  labels: WoListLabels;
  /** Null when the action-context read failed/forbade — rows show no actions. */
  actions: WoListActions | null;
}) {
  const [tab, setTab] = useState<'all' | WoListStatus>('all');
  const [search, setSearch] = useState('');

  const tabCount = (k: 'all' | WoListStatus): number =>
    k === 'all'
      ? rows.length
      : statusCounts[k] ?? rows.filter((r) => r.status === k).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tab === 'all' || r.status === tab) &&
        (q === '' ||
          r.woNumber.toLowerCase().includes(q) ||
          r.productId.toLowerCase().includes(q)),
    );
  }, [rows, tab, search]);

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="wo-list-count-line" className="text-xs text-slate-500">
        {labels.countLine}
      </p>

      {/* Status tabs */}
      <div role="tablist" aria-label={labels.col.status} className="flex flex-wrap gap-1 border-b border-slate-200">
        {TAB_ORDER.map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`wo-tab-${k}`}
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
          data-testid="wo-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <span className="ml-auto text-xs text-slate-500" data-testid="wo-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      {/* Table / empty states */}
      <Card
        data-testid="wo-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="wo-list-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p data-testid="wo-list-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.title}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.col.wo}</TableHead>
                <TableHead scope="col">{labels.col.product}</TableHead>
                <TableHead scope="col">{labels.col.line}</TableHead>
                <TableHead scope="col">{labels.col.status}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.planned}</TableHead>
                <TableHead scope="col">{labels.col.progress}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.output}</TableHead>
                <TableHead scope="col">{labels.col.schedule}</TableHead>
                <TableHead scope="col">{labels.col.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id} data-testid={`wo-row-${r.id}`}>
                  <TableCell className="font-mono text-sm font-semibold text-slate-900">
                    <Link
                      href={detailHref(r.id)}
                      data-testid={`wo-link-${r.id}`}
                      className="inline-flex items-center gap-2 hover:underline"
                    >
                      {r.woNumber}
                      {r.allergenGate ? (
                        <Badge
                          variant="warning"
                          data-testid={`wo-allergen-${r.id}`}
                          className="text-[10px]"
                        >
                          {labels.allergenBadge}
                        </Badge>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{r.productId.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {r.lineId ? r.lineId.slice(0, 8) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{labels.status[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {fmtQty(r.plannedQty)} {r.uom}
                  </TableCell>
                  <TableCell>
                    {r.progressPct === null ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-[11px] tabular-nums text-slate-500">
                          {r.progressPct}%
                        </span>
                        <ProgressBar pct={r.progressPct} label={`${labels.col.progress} ${r.progressPct}%`} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {r.outputKg === null ? '—' : `${fmtQty(r.outputKg)} ${r.uom}`}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-500">
                    <div>{fmtDate(r.scheduledStart)}</div>
                    <div>{fmtDate(r.scheduledEnd)}</div>
                  </TableCell>
                  <TableCell>
                    {actions ? (
                      <WoRowActions
                        locale={actions.locale}
                        woId={r.id}
                        status={r.status as WoState}
                        lineId={r.lineId}
                        permissions={actions.permissions}
                        rowLabels={{
                          start: labels.startAction,
                          pause: labels.pauseAction,
                          resume: labels.resumeAction,
                        }}
                        modalLabels={actions.modalLabels}
                        downtimeCategories={actions.downtimeCategories}
                      />
                    ) : (
                      <RowAction status={r.status} labels={labels} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/**
 * Per-row lifecycle action — DEFERRED to a follow-up lane that wires the action
 * modals. Rendered DISABLED with an explanatory title so the row never looks
 * broken / clickable. Mirrors the prototype's per-status control (wo-list.jsx:89-95).
 */
function RowAction({ status, labels }: { status: WoListStatus; labels: WoListLabels }) {
  const map: Partial<Record<WoListStatus, string>> = {
    in_progress: labels.pauseAction,
    paused: labels.resumeAction,
    planned: labels.startAction,
    completed: labels.viewAction,
  };
  const label = map[status];
  if (!label) return <span className="text-xs text-slate-300">—</span>;
  return (
    <button
      type="button"
      disabled
      title={labels.deferredActionTitle}
      data-testid={`wo-action-${status}`}
      className="cursor-not-allowed rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400"
    >
      {label}
    </button>
  );
}
