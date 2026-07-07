'use client';

/**
 * WH-010 — GRN list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   grn-screens.jsx:3-90 (WhGRNList):
 *     status tabs all/draft/completed/cancelled with counts → grn-screens.jsx:7-12,36-41
 *     search box (GRN# / supplier)                          → grn-screens.jsx:44
 *     source-type filter select                             → grn-screens.jsx:45
 *     dense GRN table (GRN mono link, source chip, supplier,
 *       receipt date, warehouse, status badge, items count) → grn-screens.jsx:67-86
 *     empty state                                           → grn-screens.jsx:55-64
 *
 * Presentational only: receives already-loaded, org-scoped rows + resolved i18n
 * labels from the RSC page and owns ONLY the client-side tab / search / source
 * filter state (the prototype's `tab` / `search` useState + the source <select>).
 * No data fetching, no permission logic (both resolved server-side).
 *
 * DEVIATIONS (red-lines): the prototype's extra warehouse / date-range / supplier
 * filters, the KPI count-line, "Export CSV" and the "Receive from PO/TO" modals
 * are OUT OF SCOPE for this read surface — the 4 status tabs + search + the
 * source-type filter + the dense table are the parity target. No raw <select>:
 * the source filter is a shadcn Select.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { GrnListItem } from '../../_actions/shared';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';

export type GrnListTab = 'all' | 'draft' | 'completed' | 'cancelled';

export const GRN_LIST_TABS: GrnListTab[] = ['all', 'draft', 'completed', 'cancelled'];

export type GrnListFilters = {
  status: string;
  search: string;
  sourceType: string;
};

function listQuery(filters: GrnListFilters): Record<string, string | undefined> {
  return {
    status: filters.status || undefined,
    q: filters.search || undefined,
    source: filters.sourceType || undefined,
  };
}

function hasActiveFilters(filters: GrnListFilters): boolean {
  return Boolean(filters.status || filters.search || filters.sourceType);
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'warning',
  completed: 'success',
  cancelled: 'muted',
  in_progress: 'info',
};

export type GrnListLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  sourceFilterLabel: string;
  sourceAll: string;
  emptyAll: string;
  emptyFiltered: string;
  tab: Record<GrnListTab, string>;
  status: Record<string, string>;
  col: {
    grn: string;
    source: string;
    supplier: string;
    warehouse: string;
    receiptDate: string;
    status: string;
    items: string;
  };
  pagination: ListPaginationLabels;
};

export function GrnListClient({
  rows,
  pagination,
  filters,
  sourceTypes,
  labels,
  locale,
}: {
  rows: GrnListItem[];
  pagination: PaginatedResult<GrnListItem>;
  filters: GrnListFilters;
  /** distinct source_type values present in the data, for the filter select. */
  sourceTypes: string[];
  labels: GrnListLabels;
  locale: string;
}) {
  const router = useRouter();
  const basePath = `/${locale}/warehouse/grns`;
  const activeTab: GrnListTab = (filters.status as GrnListTab) || 'all';
  const pageHref = (page: number) => buildListPageHref(basePath, listQuery(filters), page);
  const shown = pagination.offset + rows.length;
  const [searchDraft, setSearchDraft] = useState(filters.search);

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

  function navigate(next: Partial<GrnListFilters>) {
    router.push(buildListPageHref(basePath, listQuery({ ...filters, ...next }), 1));
  }

  const tabCount = (k: GrnListTab): number => (k === activeTab ? pagination.total : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Status tabs with counts (parity grn-screens.jsx:36-41). */}
      <div role="tablist" aria-label={labels.col.status} className="flex flex-wrap gap-1 border-b border-slate-200">
        {GRN_LIST_TABS.map((k) => {
          const on = activeTab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`grn-tab-${k}`}
              onClick={() => navigate({ status: k === 'all' ? '' : k })}
              className={[
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition',
                on
                  ? 'border-slate-900 font-semibold text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {labels.tab[k]}
              {tabCount(k) > 0 ? (
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">
                  {tabCount(k)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Search + source filter + visible-row count (parity grn-screens.jsx:43-53). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="grn-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <div className="w-44" data-testid="grn-source-filter">
          <Select
            aria-label={labels.sourceFilterLabel}
            value={filters.sourceType}
            onValueChange={(value) => navigate({ sourceType: value })}
            options={[
              { value: '', label: labels.sourceAll },
              ...sourceTypes.map((s) => ({ value: s, label: s.toUpperCase() })),
            ]}
          />
        </div>
        <span className="ml-auto text-xs text-slate-500" data-testid="grn-list-rows">
          {labels.rowsLabel.replace('{count}', String(pagination.total))}
        </span>
      </Card>

      {/* Table / empty states. */}
      <Card
        data-testid="grn-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="grn-list-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {hasActiveFilters(filters) ? labels.emptyFiltered : labels.emptyAll}
          </p>
        ) : (
          <Table aria-label={labels.col.grn}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.col.grn}</TableHead>
                <TableHead scope="col">{labels.col.source}</TableHead>
                <TableHead scope="col">{labels.col.supplier}</TableHead>
                <TableHead scope="col">{labels.col.warehouse}</TableHead>
                <TableHead scope="col">{labels.col.receiptDate}</TableHead>
                <TableHead scope="col">{labels.col.status}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.items}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`grn-row-${r.id}`}>
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    <Link
                      href={`/${locale}/warehouse/grns/${r.id}`}
                      data-testid={`grn-link-${r.id}`}
                      className="hover:underline"
                    >
                      {r.grnNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted" data-testid={`grn-source-${r.id}`} className="text-[10px]">
                      {r.sourceType.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{r.supplierName ?? '—'}</TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-600">
                    {r.warehouseCode ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {r.receiptDate ? r.receiptDate.slice(0, 10) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`grn-status-${r.id}`}>
                      {labels.status[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums" data-testid={`grn-items-${r.id}`}>
                    {r.itemCount}
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
          testId="grn-list-pagination"
        />
      </Card>
    </div>
  );
}
