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

import { useMemo, useState } from 'react';
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
};

function matchesTab(row: InspectionListRow, tab: InspectionStatusTab): boolean {
  if (tab === 'all') return true;
  return row.status === tab;
}

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

export function InspectionsListClient({
  rows,
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
  const [tab, setTab] = useState<InspectionStatusTab>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const tabCount = (k: InspectionStatusTab): number => rows.filter((r) => matchesTab(r, k)).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesTab(r, tab) &&
        (q === '' ||
          r.inspectionNumber.toLowerCase().includes(q) ||
          (r.referenceDisplay ?? '').toLowerCase().includes(q) ||
          (r.productCode ?? '').toLowerCase().includes(q) ||
          (r.productName ?? '').toLowerCase().includes(q)),
    );
  }, [rows, tab, search]);

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

      {/* Status tabs with counts (parity inspection-screens.jsx:37-48). */}
      <div
        role="tablist"
        aria-label={labels.columns.status}
        className="flex flex-wrap gap-1 border-b border-slate-200"
      >
        {INSPECTION_STATUS_TABS.map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`inspection-tab-${k}`}
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

      {/* Search + visible-row count (parity inspection-screens.jsx:50-62). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="inspections-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <span className="ml-auto text-xs text-slate-500" data-testid="inspections-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
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
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p
            data-testid="inspections-list-empty-filtered"
            className="px-4 py-10 text-center text-sm text-slate-500"
          >
            {labels.emptyFiltered}
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
              {visible.map((r) => (
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
