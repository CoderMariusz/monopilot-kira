'use client';

/**
 * P-L1 — `/production/wos` WO list screen (prototype wo-list.jsx:4-106).
 *
 * Presentational client component: receives already-loaded, org-scoped rows +
 * status counts + i18n labels from the server page. Filter state is URL-driven
 * (?q=, ?status=, ?page=) — search debounces into the query string; tabs and
 * pagination navigate via router.push.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
import { formatUtcIsoMinute } from '../../../../../../../lib/shared/format-utc-datetime';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';
import type { WoListStatus, WorkOrderListItem } from '../../_actions/list-work-orders';
import { WoRowActions } from './modals/wo-row-actions';
import type {
  WoActionPermissions,
  WoModalLabels,
  WoReasonCategory,
  WoShiftOption,
  WoLineOption,
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

export type WoListFilters = {
  status: string;
  search: string;
};

export type WoListLabels = {
  title: string;
  countLine: string;
  searchPlaceholder: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  allergenBadge: string;
  overProductionListBadge: string;
  deferredActionTitle: string;
  pauseAction: string;
  resumeAction: string;
  startAction: string;
  viewAction: string;
  tab: Record<'all' | WoListStatus, string>;
  status: Record<WoListStatus, string>;
  pagination: ListPaginationLabels;
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

function listQuery(filters: WoListFilters): Record<string, string | undefined> {
  return {
    status: filters.status || undefined,
    q: filters.search || undefined,
  };
}

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
  shifts: WoShiftOption[];
  lines: WoLineOption[];
  modalLabels: WoModalLabels;
};

const QTY_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function fmtQty(n: number): string {
  return QTY_FMT.format(Math.round(n));
}
function fmtDate(iso: string | null): string {
  return formatUtcIsoMinute(iso);
}
function detailHref(locale: string, id: string): string {
  return `/${locale}/production/wos/${id}`;
}

const WO_CSV_HEADERS = [
  'WO Number',
  'Product',
  'Status',
  'Qty',
  'Line',
  'Planned Start',
  'Planned End',
  'Over-Produced',
] as const;

function productCsvValue(row: WorkOrderListItem): string {
  if (row.productName && row.itemCode) return `${row.productName} (${row.itemCode})`;
  return row.productName ?? row.itemCode ?? '';
}

function lineCsvValue(row: WorkOrderListItem): string {
  return row.lineCode ?? (row.lineId ? row.lineId.slice(0, 8) : '');
}

export function WoListScreen({
  rows,
  statusCounts,
  pagination,
  filters,
  labels,
  locale = 'en',
  actions,
}: {
  rows: WorkOrderListItem[];
  statusCounts: Record<WoListStatus, number>;
  pagination: PaginatedResult<WorkOrderListItem>;
  filters: WoListFilters;
  labels: WoListLabels;
  locale?: string;
  /** Null when the action-context read failed/forbade — rows show no actions. */
  actions: WoListActions | null;
}) {
  const router = useRouter();
  const basePath = `/${locale}/production/wos`;
  const activeTab: 'all' | WoListStatus = (filters.status as WoListStatus) || 'all';
  const pageHref = (page: number) => buildListPageHref(basePath, listQuery(filters), page);
  const shown = pagination.offset + rows.length;
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [overProducedOnly, setOverProducedOnly] = useState(false);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => {
      router.push(buildListPageHref(basePath, listQuery({ ...filters, search: searchDraft }), 1));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [basePath, filters, router, searchDraft]);

  function navigate(next: Partial<WoListFilters>) {
    router.push(buildListPageHref(basePath, listQuery({ ...filters, ...next }), 1));
  }

  const tabCount = (k: 'all' | WoListStatus): number =>
    k === 'all'
      ? Object.values(statusCounts).reduce((sum, n) => sum + n, 0)
      : statusCounts[k] ?? 0;

  const visible = useMemo(() => {
    if (!overProducedOnly) return rows;
    return rows.filter((r) => r.overProductionFlagged);
  }, [rows, overProducedOnly]);

  function exportCsv() {
    const csvRows = visible.map((row) => [
      row.woNumber,
      productCsvValue(row),
      labels.status[row.status],
      `${fmtQty(row.plannedQty)} ${row.uom}`,
      lineCsvValue(row),
      fmtDate(row.scheduledStart),
      fmtDate(row.scheduledEnd),
      row.overProductionFlagged ? 'Yes' : 'No',
    ]);
    downloadCsv(toCsv(WO_CSV_HEADERS, csvRows), `production-wos-${isoDateStamp()}.csv`);
  }

  const hasActiveFilters = Boolean(filters.search || filters.status);

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="wo-list-count-line" className="text-xs text-slate-500">
        {labels.countLine.replace('{count}', String(pagination.total))}
      </p>

      <div role="tablist" aria-label={labels.col.status} className="flex flex-wrap gap-1 border-b border-slate-200">
        {TAB_ORDER.map((k) => {
          const on = activeTab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`wo-tab-${k}`}
              onClick={() => navigate({ status: k === 'all' ? '' : k })}
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

      <Card className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="text"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          data-testid="wo-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <span className="ml-auto text-xs text-slate-500" data-testid="wo-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
        <button
          type="button"
          data-testid="wo-list-export-csv"
          onClick={exportCsv}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Export CSV
        </button>
        <button
          type="button"
          aria-pressed={overProducedOnly}
          data-testid="wo-filter-over-produced"
          onClick={() => setOverProducedOnly((v) => !v)}
          className={[
            'rounded-full border px-2.5 py-1 text-xs font-medium transition',
            overProducedOnly
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
          ].join(' ')}
        >
          Over-produced
        </button>
      </Card>

      <Card
        data-testid="wo-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {pagination.total === 0 && !hasActiveFilters ? (
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
                <TableHead scope="col">Over-produced</TableHead>
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
                      href={detailHref(locale, r.id)}
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
                      {r.overProductionFlagged ? (
                        <Badge
                          variant="warning"
                          data-testid={`wo-over-production-${r.id}`}
                          className="text-[10px]"
                        >
                          {labels.overProductionListBadge}
                        </Badge>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {r.productName ? (
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-900">{r.productName}</span>
                        {r.itemCode ? (
                          <span className="font-mono text-[11px] text-slate-500">{r.itemCode}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-400" title={r.productId}>—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {r.lineCode ?? (r.lineId ? r.lineId.slice(0, 8) : '—')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{labels.status[r.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.overProductionFlagged ? (
                      <Badge
                        variant="warning"
                        data-testid={`wo-over-produced-column-${r.id}`}
                        className="text-[10px]"
                      >
                        Over-produced
                      </Badge>
                    ) : null}
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
                        shifts={actions.shifts}
                        lines={actions.lines}
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
        <ListPaginationFooter
          shown={shown}
          total={pagination.total}
          previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
          nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
          labels={labels.pagination}
          testId="wo-list-pagination"
        />
      </Card>
    </div>
  );
}

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
