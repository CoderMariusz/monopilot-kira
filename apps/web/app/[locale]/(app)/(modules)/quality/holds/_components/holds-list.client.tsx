'use client';

/**
 * QA-002 — Quality holds list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   holds-screens.jsx:1-161 (QaHoldsList):
 *     status tabs Active/Released/All with counts        → holds-screens.jsx:57-71
 *     search box (hold # / reference)                    → holds-screens.jsx:74
 *     reference-type filter pills (all/LP/Batch/WO/PO/GRN) → holds-screens.jsx:83-87
 *     "Create Hold" action opens the create modal        → holds-screens.jsx:45,153
 *     dense holds table (hold # mono link, ref type chip,
 *       reference, reason, priority badge, status badge,
 *       created, est. release)                           → holds-screens.jsx:104-147
 *     empty state                                        → holds-screens.jsx:148-155
 *
 * Presentational + owns ONLY client tab/search/ref-type state (the prototype's
 * `tab` / `search` / `refType` useState) plus the create-modal open state.
 * No data fetching, no permission logic — both resolved server-side; the create
 * action is passed in as a prop (imported from _actions, never authored here).
 *
 * DEVIATIONS (red-lines, documented per UI-PROTOTYPE-PARITY-POLICY.md):
 *   - Bulk multi-select + "Release selected" / "Export selected" toolbar
 *     (holds-screens.jsx:93-101,108,129) is DEFERRED — single-row create/release
 *     is the parity target for this slice.
 *   - The KPI summary strip + priority/reason-category filters + "Export CSV"
 *     (holds-screens.jsx:49-55,75-82,44) are OUT OF SCOPE for this read surface;
 *     the prototype's status filter collapses to the backend's Active/Released/All
 *     (listHolds status union), and reference-type is the live secondary filter.
 *   - "Days held" derived column is replaced by the backend's "Created" timestamp
 *     (no fake derived age). No raw <select>: the ref-type filter is shadcn pills.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
import { HoldCreateModal, type HoldCreateLabels } from './hold-create-modal.client';
import { HOLD_REF_TYPES } from './hold-types';
import type { HoldRefType } from './hold-types';
import type { createHold } from '../../_actions/hold-actions';
import type {
  resolveLpByNumber,
  searchLps,
  resolveWoByNumber,
  resolveGrnByNumber,
} from '../../_actions/lookup-actions';

export { HOLD_REF_TYPES } from './hold-types';
export type { HoldRefType } from './hold-types';

export type HoldStatusTab = 'active' | 'released' | 'all';
export const HOLD_STATUS_TABS: HoldStatusTab[] = ['active', 'released', 'all'];

/** Subset of HoldListRow the list renders (server-resolved, never recomputed). */
export type HoldRow = {
  id: string;
  holdNumber: string;
  referenceType: HoldRefType;
  referenceId: string;
  referenceDisplay: string;
  reasonLabel: string | null;
  reasonText: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  createdAt: string;
  estimatedReleaseAt: string | null;
  releasedAt: string | null;
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'muted',
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'warning',
  investigating: 'info',
  escalated: 'danger',
  quarantined: 'warning',
  released: 'success',
};

const ACTIVE_STATUSES = new Set(['open', 'investigating', 'escalated', 'quarantined']);

export type HoldsListLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  refTypeLabel: string;
  refTypeAll: string;
  createHold: string;
  noReason: string;
  emptyAll: string;
  emptyFiltered: string;
  tab: Record<HoldStatusTab, string>;
  refType: Record<HoldRefType, string>;
  priority: Record<string, string>;
  status: Record<string, string>;
  columns: {
    holdNumber: string;
    refType: string;
    reference: string;
    reason: string;
    priority: string;
    status: string;
    created: string;
    estRelease: string;
  };
};

function matchesTab(row: HoldRow, tab: HoldStatusTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'released') return row.status === 'released';
  return ACTIVE_STATUSES.has(row.status); // active
}

function reasonText(row: HoldRow, noReason: string): string {
  return row.reasonLabel ?? row.reasonText ?? noReason;
}

function exportHoldsCsv(rows: HoldRow[]): void {
  downloadCsv(
    toCsv(
      ['hold_number', 'status', 'reference_type', 'priority', 'created_at', 'released_at'],
      rows.map((row) => [
        row.holdNumber,
        row.status,
        row.referenceType,
        row.priority,
        row.createdAt,
        row.releasedAt,
      ]),
    ),
    `quality-holds-${isoDateStamp()}.csv`,
  );
}

export function HoldsListClient({
  rows,
  labels,
  createLabels,
  locale,
  createHoldAction,
  resolveLpAction,
  searchLpsAction,
  resolveWoAction,
  resolveGrnAction,
}: {
  rows: HoldRow[];
  labels: HoldsListLabels;
  createLabels: HoldCreateLabels;
  locale: string;
  createHoldAction: typeof createHold;
  resolveLpAction: typeof resolveLpByNumber;
  searchLpsAction: typeof searchLps;
  resolveWoAction: typeof resolveWoByNumber;
  resolveGrnAction: typeof resolveGrnByNumber;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<HoldStatusTab>('active');
  const [search, setSearch] = useState('');
  const [refType, setRefType] = useState<HoldRefType | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const tabCount = (k: HoldStatusTab): number => rows.filter((r) => matchesTab(r, k)).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesTab(r, tab) &&
        (refType === 'all' || r.referenceType === refType) &&
        (q === '' ||
          r.holdNumber.toLowerCase().includes(q) ||
          r.referenceDisplay.toLowerCase().includes(q) ||
          (reasonText(r, '') || '').toLowerCase().includes(q)),
    );
  }, [rows, tab, search, refType]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header action — opens the create modal (parity holds-screens.jsx:45). */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          data-testid="holds-export-csv"
          onClick={() => exportHoldsCsv(rows)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Export CSV
        </button>
        <button
          type="button"
          data-testid="holds-create-open"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + {labels.createHold}
        </button>
      </div>

      {/* Status tabs with counts (parity holds-screens.jsx:57-71). */}
      <div role="tablist" aria-label={labels.columns.status} className="flex flex-wrap gap-1 border-b border-slate-200">
        {HOLD_STATUS_TABS.map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`hold-tab-${k}`}
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

      {/* Search + ref-type pills + visible-row count (parity holds-screens.jsx:73-91). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="holds-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={labels.refTypeLabel}>
          <button
            type="button"
            data-testid="hold-reftype-all"
            aria-pressed={refType === 'all'}
            onClick={() => setRefType('all')}
            className={[
              'rounded-full border px-2.5 py-1 text-xs transition',
              refType === 'all'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 text-slate-600 hover:border-slate-400',
            ].join(' ')}
          >
            {labels.refTypeAll}
          </button>
          {HOLD_REF_TYPES.map((rt) => (
            <button
              key={rt}
              type="button"
              data-testid={`hold-reftype-${rt}`}
              aria-pressed={refType === rt}
              onClick={() => setRefType(rt)}
              className={[
                'rounded-full border px-2.5 py-1 text-xs transition',
                refType === rt
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400',
              ].join(' ')}
            >
              {labels.refType[rt]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500" data-testid="holds-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      {/* Table / empty states (parity holds-screens.jsx:104-155). */}
      <Card
        data-testid="holds-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="holds-list-empty" data-state="empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p data-testid="holds-list-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.columns.holdNumber}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.holdNumber}</TableHead>
                <TableHead scope="col">{labels.columns.refType}</TableHead>
                <TableHead scope="col">{labels.columns.reference}</TableHead>
                <TableHead scope="col">{labels.columns.reason}</TableHead>
                <TableHead scope="col">{labels.columns.priority}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.created}</TableHead>
                <TableHead scope="col">{labels.columns.estRelease}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={`hold-row-${r.id}`}
                  style={r.status === 'released' ? { opacity: 0.6 } : undefined}
                >
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    <Link
                      href={`/${locale}/quality/holds/${r.id}`}
                      data-testid={`hold-link-${r.id}`}
                      className="hover:underline"
                    >
                      {r.holdNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted" data-testid={`hold-reftype-badge-${r.id}`} className="text-[10px]">
                      {labels.refType[r.referenceType]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-sky-700">{r.referenceDisplay}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-slate-700" title={reasonText(r, labels.noReason)}>
                    {reasonText(r, labels.noReason)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={PRIORITY_VARIANT[r.priority] ?? 'muted'} data-testid={`hold-priority-${r.id}`}>
                      {labels.priority[r.priority] ?? r.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`hold-status-${r.id}`}>
                      {labels.status[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{r.createdAt.slice(0, 10)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {r.estimatedReleaseAt ? r.estimatedReleaseAt.slice(0, 10) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <HoldCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={createLabels}
        createHoldAction={createHoldAction}
        resolveLpAction={resolveLpAction}
        searchLpsAction={searchLpsAction}
        resolveWoAction={resolveWoAction}
        resolveGrnAction={resolveGrnAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
