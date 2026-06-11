'use client';

/**
 * WH-002 — License-plate list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   lp-screens.jsx:3-215 (lp_list_page):
 *     status tabs (all/available/reserved/blocked + QC-hold) with counts → lp-screens.jsx:9-76
 *     search box (LP# / item / batch)                                    → lp-screens.jsx:80
 *     dense LP table (LP mono link, item code+name, qty+uom, batch,
 *       expiry with coloring, location, status + QA badges)              → lp-screens.jsx:126-195
 *     empty state                                                        → lp-screens.jsx:116-125
 *
 * Presentational only: receives already-loaded, org-scoped rows + resolved i18n
 * labels from the RSC page and owns ONLY the client-side tab + search filter
 * state (prototype's `tab` / `search` useState). No data fetching, no permission
 * logic (both resolved server-side).
 *
 * DEVIATIONS (red-lines):
 *   - Multi-select + bulk-actions bar (lp-screens.jsx:30-38,102-114) are DEFERRED
 *     to a later lane — the checkbox column and bulk bar are intentionally NOT
 *     rendered in this pass (see the `deferredMultiSelect` note below).
 *   - The prototype's extra filter selects / KPI strip / pagination /
 *     "intermediate" tab / per-row split+print icons are out of scope for the
 *     first real surface; the 5 core tabs (all/available/reserved/blocked/
 *     qc_hold) + search + the dense table are the parity target.
 *
 * Today reference for expiry coloring mirrors the prototype's fixed "today" only
 * in spirit: we color against the real current date so live data stays honest.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { LicensePlateListItem } from '../../_actions/shared';

export type LpListTab = 'all' | 'available' | 'reserved' | 'blocked' | 'qc_hold';

export const LP_LIST_TABS: LpListTab[] = ['all', 'available', 'reserved', 'blocked', 'qc_hold'];

/** QA statuses that count as "on QC hold" (prototype: HOLD || PENDING). */
const QC_HOLD_QA = new Set(['HOLD', 'PENDING', 'QUARANTINED']);

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'info',
  blocked: 'danger',
  consumed: 'muted',
  shipped: 'secondary',
  merged: 'muted',
};

function qaVariant(qa: string): BadgeVariant {
  const up = qa.toUpperCase();
  if (up === 'PASSED' || up === 'RELEASED') return 'success';
  if (up === 'FAILED' || up === 'QUARANTINED') return 'danger';
  if (up === 'HOLD' || up === 'PENDING') return 'warning';
  return 'muted';
}

export type LpListLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  deferredMultiSelect: string;
  tab: Record<LpListTab, string>;
  status: Record<string, string>;
  col: {
    lp: string;
    item: string;
    qty: string;
    batch: string;
    expiry: string;
    status: string;
    qa: string;
    location: string;
  };
  expiry: { expired: string; soon: string };
};

function expiryDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const exp = new Date(iso).getTime();
  if (Number.isNaN(exp)) return null;
  return Math.floor((exp - now) / 86_400_000);
}

function matchesTab(row: LicensePlateListItem, tab: LpListTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'qc_hold':
      return QC_HOLD_QA.has(row.qaStatus.toUpperCase());
    default:
      return row.status === tab;
  }
}

/** Expiry cell with prototype coloring: expired (use_by) red, ≤7d red, ≤30d amber. */
function ExpiryCell({
  iso,
  days,
  labels,
}: {
  iso: string | null;
  days: number | null;
  labels: LpListLabels;
}) {
  if (!iso) return <span className="text-slate-400">—</span>;
  const date = iso.slice(0, 10);
  let cls = 'text-slate-600';
  let suffix: string | null = null;
  if (days !== null) {
    if (days < 0) {
      cls = 'text-red-700 font-medium';
      suffix = labels.expiry.expired.replace('{days}', String(Math.abs(days)));
    } else if (days <= 7) {
      cls = 'text-red-600 font-medium';
      suffix = labels.expiry.soon.replace('{days}', String(days));
    } else if (days <= 30) {
      cls = 'text-amber-700';
    }
  }
  return (
    <span className={`font-mono text-xs ${cls}`}>
      {date}
      {suffix ? <span className="ml-1 text-[10px]">· {suffix}</span> : null}
    </span>
  );
}

export function LpListClient({
  rows,
  labels,
  locale,
}: {
  rows: LicensePlateListItem[];
  labels: LpListLabels;
  locale: string;
}) {
  const [tab, setTab] = useState<LpListTab>('all');
  const [search, setSearch] = useState('');
  const now = useMemo(() => Date.now(), []);

  const tabCount = (k: LpListTab): number =>
    k === 'all' ? rows.length : rows.filter((r) => matchesTab(r, k)).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesTab(r, tab) &&
        (q === '' ||
          r.lpNumber.toLowerCase().includes(q) ||
          (r.itemCode ?? '').toLowerCase().includes(q) ||
          (r.itemName ?? '').toLowerCase().includes(q) ||
          (r.batchNumber ?? '').toLowerCase().includes(q)),
    );
  }, [rows, tab, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Status tabs with counts (parity lp-screens.jsx:70-76). */}
      <div role="tablist" aria-label={labels.col.status} className="flex flex-wrap gap-1 border-b border-slate-200">
        {LP_LIST_TABS.map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`lp-tab-${k}`}
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

      {/* Search + visible-row count (parity lp-screens.jsx:80,86). */}
      <Card className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="lp-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <span className="ml-auto text-xs text-slate-500" data-testid="lp-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      {/* RED-LINE: multi-select + bulk-actions bar (lp-screens.jsx:30-38,102-114)
          are DEFERRED to a later lane — no checkbox column / bulk bar in this pass. */}
      <p className="sr-only" data-testid="lp-list-bulk-deferred">
        {labels.deferredMultiSelect}
      </p>

      {/* Table / empty states. */}
      <Card
        data-testid="lp-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="lp-list-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p data-testid="lp-list-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.col.lp}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.col.lp}</TableHead>
                <TableHead scope="col">{labels.col.item}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.qty}</TableHead>
                <TableHead scope="col">{labels.col.batch}</TableHead>
                <TableHead scope="col">{labels.col.expiry}</TableHead>
                <TableHead scope="col">{labels.col.status}</TableHead>
                <TableHead scope="col">{labels.col.qa}</TableHead>
                <TableHead scope="col">{labels.col.location}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const days = expiryDays(r.expiryDate, now);
                return (
                  <TableRow key={r.id} data-testid={`lp-row-${r.id}`}>
                    <TableCell className="font-mono text-sm font-semibold text-sky-700">
                      <Link
                        href={`/${locale}/warehouse/license-plates/${r.id}`}
                        data-testid={`lp-link-${r.id}`}
                        className="hover:underline"
                      >
                        {r.lpNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-900">{r.itemName ?? '—'}</span>
                        {r.itemCode ? (
                          <span className="font-mono text-[11px] text-slate-500">{r.itemCode}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {/* UoM rendered from data, never free text. */}
                      {r.quantity} {r.uom}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">
                      {r.batchNumber ?? '—'}
                    </TableCell>
                    <TableCell>
                      <ExpiryCell iso={r.expiryDate} days={days} labels={labels} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`lp-status-${r.id}`}>
                        {labels.status[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={qaVariant(r.qaStatus)} data-testid={`lp-qa-${r.id}`} className="text-[10px]">
                        {r.qaStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">
                      {r.locationCode ?? '—'}
                      {r.warehouseCode ? (
                        <span className="text-slate-400"> · {r.warehouseCode}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
