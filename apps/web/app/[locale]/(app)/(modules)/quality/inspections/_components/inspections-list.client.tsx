'use client';

/**
 * QA-005 — Incoming Inspections list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   inspection-screens.jsx:3-97 (QaIncomingList):
 *     status tabs All/Pending/In progress/Completed/Cancelled with counts
 *                                                       → inspection-screens.jsx:37-48
 *     search box (inspection # / reference)             → inspection-screens.jsx:50-51,62
 *     "Create manual inspection" opens the create modal → inspection-screens.jsx:26
 *     dense inspections table (inspection # mono, GRN/
 *       reference, product, status badge, assigned,
 *       scheduled/created)                              → inspection-screens.jsx:65-94
 *     row → detail (onOpenInsp)                         → inspection-screens.jsx:75
 *
 * Presentational + owns ONLY the client tab/search state (the prototype's
 * `status` / `search` useState) plus the create-modal open state. No data fetching,
 * no permission logic — both resolved server-side; the create action is passed in
 * as a prop (imported from _actions, never authored here).
 *
 * DEVIATIONS (red-lines, documented per UI-PROTOTYPE-PARITY-POLICY.md):
 *   - The prototype's "Assigned to" inspector <select>, priority <select>, urgency
 *     column + overdue alert banner and per-row Assign/Start/View action buttons
 *     (inspection-screens.jsx:14,30-35,52-59,79-89) are DEFERRED — the backend
 *     contract exposes status + assignedTo + dueDate only; the live secondary filter
 *     is the status tab (mapped to the backend status union) + free-text search.
 *     The whole row is the navigation affordance (no fake derived urgency/priority).
 *   - The prototype's "Export" button (inspection-screens.jsx:25) is OUT OF SCOPE.
 *   - Tabs map to the backend status union (pending/in_progress/passed/failed/
 *     on_hold/cancelled); "assigned" collapses into pending per the contract.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { InspectionCreateModal, type InspectionCreateLabels } from './inspection-create-modal.client';
import type {
  CreateInspectionAction,
  InspectionListRow,
  InspectionStatus,
  SearchInspectionLpsAction,
  ResolveInspectionGrnAction,
  ResolveInspectionWoOutputAction,
  SearchInspectionAssigneesAction,
} from './inspection-contracts';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';

export type InspectionStatusTab =
  | 'all'
  | 'pending'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'on_hold'
  | 'cancelled';

export const INSPECTION_STATUS_TABS: InspectionStatusTab[] = [
  'all',
  'pending',
  'in_progress',
  'passed',
  'failed',
  'on_hold',
  'cancelled',
];

export type InspectionListFilters = {
  status: string;
  search: string;
};

function listQuery(filters: InspectionListFilters): Record<string, string | undefined> {
  return {
    status: filters.status || undefined,
    q: filters.search || undefined,
  };
}

function hasActiveFilters(filters: InspectionListFilters): boolean {
  return Boolean(filters.status || filters.search);
}

const STATUS_VARIANT: Record<InspectionStatus, BadgeVariant> = {
  pending: 'muted',
  in_progress: 'info',
  passed: 'success',
  failed: 'danger',
  on_hold: 'warning',
  cancelled: 'muted',
};

export type InspectionsListLabels = {
  createInspection: string;
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  noProduct: string;
  unassigned: string;
  tab: Record<InspectionStatusTab, string>;
  status: Record<InspectionStatus, string>;
  columns: {
    inspectionNumber: string;
    reference: string;
    product: string;
    status: string;
    assigned: string;
    due: string;
    created: string;
  };
  pagination: ListPaginationLabels;
};

function dateOnly(value?: string | null): string {
  return value ? value.slice(0, 10) : '—';
}

/** Display name for the action's person object ({id,email,name} | null). */
function personLabel(p?: InspectionListRow['assignedTo']): string | null {
  if (!p) return null;
  return p.name ?? p.email ?? p.id;
}

function productLabel(row: InspectionListRow, fallback: string): string {
  if (row.productCode && row.productName) return `${row.productCode} · ${row.productName}`;
  return row.productName ?? row.productCode ?? fallback;
}

function passRate(total: number, passed: number): string {
  if (total === 0) return '0%';
  return `${Math.round((passed / total) * 100)}%`;
}

export function InspectionsListClient({
  rows,
  pagination,
  filters,
  labels,
  createLabels,
  locale,
  createInspectionAction,
  searchLpsAction,
  resolveGrnAction,
  resolveWoOutputAction,
  searchAssigneesAction,
}: {
  rows: InspectionListRow[];
  pagination: PaginatedResult<InspectionListRow>;
  filters: InspectionListFilters;
  labels: InspectionsListLabels;
  createLabels: InspectionCreateLabels;
  locale: string;
  createInspectionAction: CreateInspectionAction;
  searchLpsAction: SearchInspectionLpsAction;
  resolveGrnAction: ResolveInspectionGrnAction;
  resolveWoOutputAction: ResolveInspectionWoOutputAction;
  searchAssigneesAction: SearchInspectionAssigneesAction;
}) {
  const router = useRouter();
  const basePath = `/${locale}/quality/inspections`;
  const activeTab: InspectionStatusTab = (filters.status as InspectionStatusTab) || 'all';
  const pageHref = (page: number) => buildListPageHref(basePath, listQuery(filters), page);
  const shown = pagination.offset + rows.length;
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const totalInspections = pagination.total;
  const passedInspections = rows.filter((r) => r.status === 'passed').length;

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

  function navigate(next: Partial<InspectionListFilters>) {
    router.push(buildListPageHref(basePath, listQuery({ ...filters, ...next }), 1));
  }

  const tabCount = (k: InspectionStatusTab): number => (k === activeTab ? pagination.total : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Header action — opens the create modal (parity inspection-screens.jsx:26). */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-testid="inspection-create-open"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + {labels.createInspection}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Inspection summary">
        {[
          { label: 'Total Inspections', value: String(totalInspections), testId: 'inspections-summary-total' },
          { label: 'Passed', value: String(passedInspections), testId: 'inspections-summary-passed' },
          { label: 'Pass Rate', value: passRate(totalInspections, passedInspections), testId: 'inspections-summary-pass-rate' },
        ].map((tile) => (
          <Card
            key={tile.testId}
            data-testid={tile.testId}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="text-xs font-medium uppercase text-slate-500">{tile.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{tile.value}</div>
          </Card>
        ))}
      </div>

      {/* Status tabs with counts (parity inspection-screens.jsx:37-48). */}
      <div
        role="tablist"
        aria-label={labels.columns.status}
        className="flex flex-wrap gap-1 border-b border-slate-200"
      >
        {INSPECTION_STATUS_TABS.map((k) => {
          const on = activeTab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`inspection-tab-${k}`}
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

      {/* Search + visible-row count (parity inspection-screens.jsx:50-62). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="inspections-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <span className="ml-auto text-xs text-slate-500" data-testid="inspections-list-rows">
          {labels.rowsLabel.replace('{count}', String(pagination.total))}
        </span>
      </Card>

      {/* Table / empty states (parity inspection-screens.jsx:65-94). */}
      <Card
        data-testid="inspections-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p
            data-testid="inspections-list-empty"
            data-state="empty"
            className="px-4 py-10 text-center text-sm text-slate-500"
          >
            {hasActiveFilters(filters) ? labels.emptyFiltered : labels.emptyAll}
          </p>
        ) : (
          <Table aria-label={labels.columns.inspectionNumber}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.inspectionNumber}</TableHead>
                <TableHead scope="col">{labels.columns.reference}</TableHead>
                <TableHead scope="col">{labels.columns.product}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.assigned}</TableHead>
                <TableHead scope="col">{labels.columns.due}</TableHead>
                <TableHead scope="col">{labels.columns.created}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={`inspection-row-${r.id}`}
                  style={
                    r.status === 'cancelled' || r.status === 'passed' ? { opacity: 0.7 } : undefined
                  }
                >
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    <Link
                      href={`/${locale}/quality/inspections/${r.id}`}
                      data-testid={`inspection-link-${r.id}`}
                      className="hover:underline"
                    >
                      {r.inspectionNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-sky-700">
                    {r.referenceDisplay ?? r.referenceId ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">
                    {productLabel(r, labels.noProduct)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[r.status] ?? 'muted'}
                      data-testid={`inspection-status-${r.id}`}
                    >
                      {labels.status[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">
                    {personLabel(r.assignedTo) ?? (
                      <span className="text-slate-400">{labels.unassigned}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{dateOnly(r.dueDate)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{dateOnly(r.createdAt)}</TableCell>
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
          testId="inspections-list-pagination"
        />
      </Card>

      <InspectionCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={createLabels}
        createInspectionAction={createInspectionAction}
        searchLpsAction={searchLpsAction}
        resolveGrnAction={resolveGrnAction}
        resolveWoOutputAction={resolveWoOutputAction}
        searchAssigneesAction={searchAssigneesAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
