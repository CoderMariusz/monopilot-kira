'use client';

/**
 * QA-009 — NCR list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   ncr-screens.jsx:1-184 (QaNcrList):
 *     "+ Create NCR" header action → modal              → ncr-screens.jsx:47
 *     search box (NCR # / title)                        → ncr-screens.jsx:69
 *     severity filter pills (all/critical/major/minor)  → ncr-screens.jsx:74-78
 *     status + type filters                             → ncr-screens.jsx:70-73,79-84
 *     §3.3 GHA attention partition (overdue + critical-
 *       open + escalated auto-expanded on top; "Other
 *       NCRs" collapsed group below)                     → ncr-screens.jsx:22-25,117-177
 *     dense table (NCR # mono link, type chip, severity
 *       badge, title, product, linked-hold link, status,
 *       created, response-due w/ overdue highlight)      → ncr-screens.jsx:108-177
 *     empty / empty-filtered states                      → ncr-screens.jsx:100-106
 *
 * Presentational + owns ONLY the client filter state (status / severity / type /
 * search), the calm-group expand toggle, and the create-modal open state. No data
 * fetching, no permission logic — both resolved server-side; the create action is
 * passed in as a prop (imported from _actions, never authored here).
 *
 * DEVIATIONS (red-lines, RED-LINED in the task): the prototype's summary KPI strip
 * (ncr-screens.jsx:51-57), the kanban pipeline strip (ncr-screens.jsx:59-66) and
 * bulk multi-select + Assign/Export toolbar (ncr-screens.jsx:90-97,111,130-134)
 * are DEFERRED. The status filter is a shadcn Select (NO raw <select>); the
 * prototype's "Detected / days-ago / Assigned-to / Source" columns collapse to the
 * backend's created / response-due / product / linked-hold to avoid faked data.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';
import { NcrCreateModal, type NcrCreateLabels } from './ncr-create-modal.client';
import {
  NCR_FILTER_STATUSES,
  NCR_SEVERITIES,
  NCR_TYPES,
  type CreateNcrAction,
  type NcrListRow,
  type NcrSeverity,
  type NcrStatus,
  type NcrType,
} from './ncr-contracts';

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: 'danger',
  major: 'warning',
  minor: 'info',
};
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  open: 'warning',
  investigating: 'info',
  awaiting_capa: 'info',
  reopened: 'warning',
  closed: 'success',
  cancelled: 'muted',
};

export type NcrListLabels = {
  createNcr: string;
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  statusLabel: string;
  statusAll: string;
  severityLabel: string;
  severityAll: string;
  typeLabel: string;
  typeAll: string;
  clear: string;
  noTitle: string;
  unassigned: string;
  emptyAll: string;
  emptyFiltered: string;
  overdueTag: string;
  attention: { heading: string; meta: string };
  calm: { heading: string; metaCollapsed: string; metaExpanded: string };
  columns: {
    ncrNumber: string;
    title: string;
    severity: string;
    type: string;
    status: string;
    product: string;
    linkedHold: string;
    created: string;
    responseDue: string;
  };
  severityValues: Record<string, string>;
  statusValues: Record<string, string>;
  typeValues: Record<string, string>;
  createLabels: NcrCreateLabels;
  pagination: ListPaginationLabels;
};

const TERMINAL_STATUSES = new Set<NcrStatus>(['closed', 'cancelled']);
type NcrAnalyticsRow = NcrListRow & {
  rootCauseCategory?: string | null;
  closedAt?: string | null;
};

/**
 * §3.3 GHA attention partition: overdue OR (critical AND non-terminal). Mirrors
 * ncr-screens.jsx:23 — the row warrants top-of-list attention. The prototype's
 * third term (`escalated`) is dropped: the backend list row does not surface an
 * escalation flag, and `overdue` is derived honestly by the page (responseDueAt).
 */
export function isAttention(row: NcrListRow): boolean {
  return Boolean(
    row.overdue || (row.severity === 'critical' && !TERMINAL_STATUSES.has(row.status)),
  );
}

export function NcrListClient({
  rows,
  pagination,
  labels,
  locale,
  createNcrAction,
}: {
  rows: NcrListRow[];
  pagination: PaginatedResult<NcrListRow>;
  labels: NcrListLabels;
  locale: string;
  createNcrAction: CreateNcrAction;
}) {
  const router = useRouter();
  const pageHref = (page: number) =>
    page > 1 ? `/${locale}/quality/ncrs?page=${page}` : `/${locale}/quality/ncrs`;
  const shown = pagination.offset + rows.length;
  const [status, setStatus] = useState<NcrStatus | 'all'>('all');
  const [severity, setSeverity] = useState<NcrSeverity | 'all'>('all');
  const [ncrType, setNcrType] = useState<NcrType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [calmExpanded, setCalmExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (severity === 'all' || r.severity === severity) &&
        (ncrType === 'all' || r.ncrType === ncrType) &&
        (createdFrom === '' || r.createdAt.slice(0, 10) >= createdFrom) &&
        (createdTo === '' || r.createdAt.slice(0, 10) <= createdTo) &&
        (q === '' ||
          r.ncrNumber.toLowerCase().includes(q) ||
          (r.title ?? '').toLowerCase().includes(q)),
    );
  }, [rows, status, severity, ncrType, createdFrom, createdTo, search]);

  // Partition: attention rows (auto-expanded on top) vs calm rows (collapsed).
  const attentionRows = useMemo(() => visible.filter(isAttention), [visible]);
  const calmRows = useMemo(() => visible.filter((r) => !isAttention(r)), [visible]);
  const analyticsRows = visible as NcrAnalyticsRow[];
  const hasRootCauseCategory = (rows as NcrAnalyticsRow[]).some((r) => 'rootCauseCategory' in r);

  const rootCauseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!hasRootCauseCategory) return [];

    for (const row of analyticsRows) {
      const category = row.rootCauseCategory?.trim();
      if (!category) continue;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    return Array.from(counts, ([category, count]) => ({ category, count })).sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
    );
  }, [analyticsRows, hasRootCauseCategory]);

  const averageClosureDays = useMemo(() => {
    const closedDurations = analyticsRows
      .filter((row) => row.status === 'closed' && row.closedAt)
      .map((row) => {
        const created = Date.parse(row.createdAt);
        const closed = Date.parse(row.closedAt ?? '');
        if (!Number.isFinite(created) || !Number.isFinite(closed) || closed < created) return null;
        return Math.floor((closed - created) / 86_400_000);
      })
      .filter((days): days is number => days !== null);

    if (closedDurations.length === 0) return null;
    return Math.round(closedDurations.reduce((sum, days) => sum + days, 0) / closedDurations.length);
  }, [analyticsRows]);
  const maxRootCauseCount = rootCauseCounts[0]?.count ?? 0;

  function clearFilters() {
    setStatus('all');
    setSeverity('all');
    setNcrType('all');
    setSearch('');
    setCreatedFrom('');
    setCreatedTo('');
  }

  function exportCsv() {
    const csv = toCsv(
      [
        'NCR #',
        'Type',
        'Severity',
        'Title',
        'Product',
        'Linked hold',
        'Status',
        'Created',
        'Response due',
      ],
      visible.map((r) => [
        r.ncrNumber,
        labels.typeValues[r.ncrType] ?? r.ncrType,
        labels.severityValues[r.severity] ?? r.severity,
        r.title,
        r.productCode ?? '',
        r.linkedHoldNumber ?? r.linkedHoldId ?? '',
        labels.statusValues[r.status] ?? r.status,
        r.createdAt.slice(0, 10),
        r.responseDueAt ? r.responseDueAt.slice(0, 16).replace('T', ' ') : '',
      ]),
    );
    downloadCsv(csv, `ncrs-${isoDateStamp()}.csv`);
  }

  function renderRow(r: NcrListRow, attention: boolean) {
    const overdue = Boolean(r.overdue);
    return (
      <TableRow key={r.id} data-testid={`ncr-row-${r.id}`} data-attention={attention ? 'true' : 'false'}>
        <TableCell className="font-mono text-sm font-semibold text-sky-700">
          <Link
            href={`/${locale}/quality/ncrs/${r.id}`}
            data-testid={`ncr-link-${r.id}`}
            className="hover:underline"
          >
            {r.ncrNumber}
          </Link>
        </TableCell>
        <TableCell>
          <Badge variant="muted" data-testid={`ncr-type-${r.id}`} className="text-[10px]">
            {labels.typeValues[r.ncrType] ?? r.ncrType}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={SEVERITY_VARIANT[r.severity] ?? 'muted'} data-testid={`ncr-severity-${r.id}`}>
            {labels.severityValues[r.severity] ?? r.severity}
          </Badge>
        </TableCell>
        <TableCell className="max-w-xs truncate text-xs text-slate-700" title={r.title ?? undefined}>
          {r.title ?? <span className="text-slate-400">{labels.noTitle}</span>}
        </TableCell>
        <TableCell className="font-mono text-[11px] text-slate-600">{r.productCode ?? '—'}</TableCell>
        <TableCell>
          {r.linkedHoldId ? (
            <Link
              href={`/${locale}/quality/holds/${r.linkedHoldId}`}
              data-testid={`ncr-hold-link-${r.id}`}
              className="font-mono text-[11px] text-sky-700 hover:underline"
            >
              {r.linkedHoldNumber ?? r.linkedHoldId}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`ncr-status-${r.id}`}>
            {labels.statusValues[r.status] ?? r.status}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-xs text-slate-600">{r.createdAt.slice(0, 10)}</TableCell>
        <TableCell
          data-testid={`ncr-due-${r.id}`}
          data-overdue={overdue ? 'true' : 'false'}
          className={[
            'font-mono text-xs',
            overdue ? 'rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700' : 'text-slate-600',
          ].join(' ')}
        >
          {r.responseDueAt ? r.responseDueAt.slice(0, 16).replace('T', ' ') : '—'}
          {overdue && <span className="sr-only"> {labels.overdueTag}</span>}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header action — opens the create modal (parity ncr-screens.jsx:47). */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-testid="ncr-export-csv"
          onClick={exportCsv}
          className="mr-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Export CSV
        </button>
        <button
          type="button"
          data-testid="ncr-create-open"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + {labels.createNcr}
        </button>
      </div>

      {/* Filter bar (parity ncr-screens.jsx:68-88). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="ncr-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />

        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          Created from
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            aria-label="Created from"
            data-testid="ncr-created-from"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-700 focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          Created to
          <input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            aria-label="Created to"
            data-testid="ncr-created-to"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-700 focus:border-slate-400 focus:outline-none"
          />
        </label>

        {/* Status filter — shadcn Select (NO raw <select>). */}
        <div data-testid="ncr-filter-status" className="min-w-[150px]">
          <Select
            aria-label={labels.statusLabel}
            value={status}
            onValueChange={(v) => setStatus(v as NcrStatus | 'all')}
            options={[
              { value: 'all', label: labels.statusAll },
              ...NCR_FILTER_STATUSES.map((s) => ({ value: s, label: labels.statusValues[s] })),
            ]}
          />
        </div>

        {/* Severity pills (parity ncr-screens.jsx:74-78). */}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={labels.severityLabel}>
          <button
            type="button"
            data-testid="ncr-severity-all"
            aria-pressed={severity === 'all'}
            onClick={() => setSeverity('all')}
            className={[
              'rounded-full border px-2.5 py-1 text-xs transition',
              severity === 'all'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 text-slate-600 hover:border-slate-400',
            ].join(' ')}
          >
            {labels.severityAll}
          </button>
          {NCR_SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`ncr-severity-${s}`}
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
              className={[
                'rounded-full border px-2.5 py-1 text-xs capitalize transition',
                severity === s
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400',
              ].join(' ')}
            >
              {labels.severityValues[s]}
            </button>
          ))}
        </div>

        {/* Type filter — shadcn Select (NO raw <select>). */}
        <div data-testid="ncr-filter-type" className="min-w-[160px]">
          <Select
            aria-label={labels.typeLabel}
            value={ncrType}
            onValueChange={(v) => setNcrType(v as NcrType | 'all')}
            options={[
              { value: 'all', label: labels.typeAll },
              ...NCR_TYPES.map((ty) => ({ value: ty, label: labels.typeValues[ty] })),
            ]}
          />
        </div>

        <button
          type="button"
          data-testid="ncr-filter-clear"
          onClick={clearFilters}
          className="text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          {labels.clear}
        </button>
        <span className="ml-auto text-xs text-slate-500" data-testid="ncr-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      <Card className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          {hasRootCauseCategory && (
            <section aria-labelledby="ncr-root-cause-heading" className="min-w-0">
              <h2 id="ncr-root-cause-heading" className="mb-3 text-sm font-semibold text-slate-900">
                NCRs by Root Cause
              </h2>
              <div className="space-y-2">
                {rootCauseCounts.map(({ category, count }) => (
                  <div
                    key={category}
                    className="grid items-center gap-2 text-xs text-slate-600 sm:grid-cols-[minmax(8rem,1fr)_2rem_minmax(6rem,20rem)]"
                  >
                    <span className="truncate" title={category}>
                      {category}
                    </span>
                    <span className="text-right font-mono text-slate-900">{count}</span>
                    <div className="h-2 max-w-xs rounded bg-slate-100">
                      <div
                        className="h-2 rounded bg-blue-500"
                        style={{ width: `${maxRootCauseCount > 0 ? (count / maxRootCauseCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section
            aria-label="Avg Closure Time"
            className="rounded border border-slate-200 p-4 text-sm md:ml-auto md:w-[220px]"
          >
            <div className="text-xs font-medium text-slate-500">Avg Closure Time</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {averageClosureDays === null ? '—' : averageClosureDays} days
            </div>
          </section>
        </div>
      </Card>

      {/* Table / empty states (parity ncr-screens.jsx:99-181). */}
      <Card
        data-testid="ncr-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="ncr-list-empty" data-state="empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p data-testid="ncr-list-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.columns.ncrNumber}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.ncrNumber}</TableHead>
                <TableHead scope="col">{labels.columns.type}</TableHead>
                <TableHead scope="col">{labels.columns.severity}</TableHead>
                <TableHead scope="col">{labels.columns.title}</TableHead>
                <TableHead scope="col">{labels.columns.product}</TableHead>
                <TableHead scope="col">{labels.columns.linkedHold}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.created}</TableHead>
                <TableHead scope="col">{labels.columns.responseDue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* §3.3 GHA — attention rows (overdue / critical-open / escalated)
                  auto-expanded on top (parity ncr-screens.jsx:117-147). */}
              {attentionRows.length > 0 && (
                <TableRow data-testid="ncr-group-attention" className="bg-red-50/40">
                  <TableCell colSpan={9} className="text-xs font-semibold text-red-800">
                    ▾ {labels.attention.heading}
                    <span className="ml-2 font-normal text-slate-500">
                      {labels.attention.meta.replace('{count}', String(attentionRows.length))}
                    </span>
                  </TableCell>
                </TableRow>
              )}
              {attentionRows.map((r) => renderRow(r, true))}

              {/* Calm group — default-collapsed (parity ncr-screens.jsx:148-177). */}
              {calmRows.length > 0 && (
                <TableRow data-testid="ncr-group-calm">
                  <TableCell colSpan={9} className="p-0">
                    <button
                      type="button"
                      data-testid="ncr-group-calm-toggle"
                      aria-expanded={calmExpanded}
                      onClick={() => setCalmExpanded((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <span aria-hidden>{calmExpanded ? '▾' : '▸'}</span>
                      {labels.calm.heading}
                      <span className="font-normal text-slate-500">
                        {(calmExpanded ? labels.calm.metaExpanded : labels.calm.metaCollapsed).replace(
                          '{count}',
                          String(calmRows.length),
                        )}
                      </span>
                    </button>
                  </TableCell>
                </TableRow>
              )}
              {calmExpanded && calmRows.map((r) => renderRow(r, false))}
            </TableBody>
          </Table>
        )}
        <ListPaginationFooter
          shown={shown}
          total={pagination.total}
          previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
          nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
          labels={labels.pagination}
          testId="ncr-list-pagination"
        />
      </Card>

      <NcrCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.createLabels}
        createNcrAction={createNcrAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
