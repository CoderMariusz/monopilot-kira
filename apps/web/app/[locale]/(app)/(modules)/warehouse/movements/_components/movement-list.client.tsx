'use client';

/**
 * WH-006 — Stock movements list (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   movement-screens.jsx:3-200 (WhMovementList):
 *     move-type tabs all/receipts/consume/transfers/adjustments with counts → movement-screens.jsx:9-16,45-50
 *     search box (SM# / LP#)                                                → movement-screens.jsx:53
 *     dense flat table (move #, type chip, LP, qty+uom, from→to, date,
 *       reason)                                                            → movement-screens.jsx:138-156
 *     empty state                                                          → movement-screens.jsx:78-87
 *
 * Presentational only: receives already-loaded, org-scoped rows + resolved labels
 * and owns ONLY the tab + search state. The "transfers" tab groups transfer AND
 * putaway (parity movement-screens.jsx:13,22). No data fetching, no permission
 * logic.
 *
 * DEVIATIONS (red-lines): the prototype's "Manager approvals" tab + amber banner,
 * grouped/flat toggle + CompactActivity grouping, the side-panel detail, "New
 * movement"/Export buttons and the per-row product/reference/user columns are out
 * of scope. The action surfaces move #, LP, type, from/to location codes, qty+uom,
 * date and reason — those are the parity target.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import { downloadCsv, toCsv } from '../../../../../../../lib/shared/download';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';
import type { StockMoveListItem } from '../../_actions/shared';

export type MovementTab = 'all' | 'receipts' | 'consume' | 'transfers' | 'adjustments';

export const MOVEMENT_TABS: MovementTab[] = ['all', 'receipts', 'consume', 'transfers', 'adjustments'];

/** Move-type → badge tone (parity MoveType chip). */
const TYPE_VARIANT: Record<string, BadgeVariant> = {
  receipt: 'success',
  production: 'success',
  putaway: 'info',
  transfer: 'info',
  consume_to_wo: 'info',
  adjustment: 'warning',
  quarantine: 'danger',
  return: 'secondary',
};

export type MovementListLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  none: string;
  tab: Record<MovementTab, string>;
  moveType: Record<string, string>;
  /** Origin-ledger indicator (unified ledger — stock_move vs lp_state). */
  source: Record<StockMoveListItem['source'], string>;
  col: {
    move: string;
    lp: string;
    type: string;
    from: string;
    to: string;
    qty: string;
    date: string;
    reason: string;
  };
  pagination: ListPaginationLabels;
};

function matchesTab(row: StockMoveListItem, tab: MovementTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'receipts':
      // PO receipts AND production outputs are both inbound LP-genesis events.
      return row.moveType === 'receipt' || row.moveType === 'production';
    case 'consume':
      return row.moveType === 'consume_to_wo';
    case 'transfers':
      return row.moveType === 'transfer' || row.moveType === 'putaway';
    case 'adjustments':
      return row.moveType === 'adjustment' || row.moveType === 'quarantine' || row.moveType === 'return';
  }
}

function CsvExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path
        d="M10 3v8m0 0 3-3m-3 3L7 8m-3 5.5V15a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function MovementListClient({
  rows,
  pagination,
  labels,
  locale,
}: {
  rows: StockMoveListItem[];
  pagination: PaginatedResult<StockMoveListItem>;
  labels: MovementListLabels;
  locale: string;
}) {
  const [tab, setTab] = useState<MovementTab>('all');
  const [search, setSearch] = useState('');

  const dash = labels.none;
  const tabCount = (k: MovementTab): number =>
    k === 'all' ? rows.length : rows.filter((r) => matchesTab(r, k)).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesTab(r, tab) &&
        (q === '' ||
          r.moveNumber.toLowerCase().includes(q) ||
          (r.lpNumber ?? '').toLowerCase().includes(q)),
    );
  }, [rows, tab, search]);

  function handleExportCsv() {
    const header = [
      labels.col.move,
      labels.col.lp,
      labels.col.type,
      labels.col.from,
      labels.col.to,
      labels.col.qty,
      labels.col.date,
      labels.col.reason,
    ];
    const csvRows = visible.map((r) => [
      r.moveNumber,
      r.lpNumber ?? dash,
      `${labels.moveType[r.moveType] ?? r.moveType} (${labels.source[r.source]})`,
      r.fromLocationCode ?? dash,
      r.toLocationCode ?? dash,
      `${r.quantity}${r.uom ? ` ${r.uom}` : ''}`,
      r.moveDate ? r.moveDate.slice(0, 10) : dash,
      r.reasonText ?? dash,
    ]);
    downloadCsv(toCsv(header, csvRows), `warehouse-movements-${tab}.csv`);
  }

  const shown = pagination.offset + rows.length;
  const previousHref =
    pagination.page > 1 ? `/${locale}/warehouse/movements?page=${pagination.page - 1}` : null;
  const nextHref = pagination.hasMore
    ? `/${locale}/warehouse/movements?page=${pagination.page + 1}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Move-type tabs with counts (parity movement-screens.jsx:45-50). */}
      <div role="tablist" aria-label={labels.col.type} className="flex flex-wrap gap-1 border-b border-slate-200">
        {MOVEMENT_TABS.map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`movement-tab-${k}`}
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

      {/* Search + visible-row count (parity movement-screens.jsx:53). */}
      <Card className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="movement-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <CsvExportIcon />
          Export CSV
        </button>
        <span className="text-xs text-slate-500" data-testid="movement-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      <Card
        data-testid="movement-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p data-testid="movement-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p data-testid="movement-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.col.move}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.col.move}</TableHead>
                <TableHead scope="col">{labels.col.lp}</TableHead>
                <TableHead scope="col">{labels.col.type}</TableHead>
                <TableHead scope="col">{labels.col.from}</TableHead>
                <TableHead scope="col">{labels.col.to}</TableHead>
                <TableHead scope="col" className="text-right">{labels.col.qty}</TableHead>
                <TableHead scope="col">{labels.col.date}</TableHead>
                <TableHead scope="col">{labels.col.reason}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id} data-testid={`movement-row-${r.id}`}>
                  <TableCell className="font-mono text-[11px] font-semibold text-slate-700">
                    {r.moveNumber}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    {r.lpId && r.lpNumber ? (
                      <Link
                        href={`/${locale}/warehouse/license-plates/${r.lpId}`}
                        data-testid={`movement-lp-link-${r.id}`}
                        className="hover:underline"
                      >
                        {r.lpNumber}
                      </Link>
                    ) : (
                      // Never leak a raw LP UUID into the table (review rule).
                      <span className="text-slate-400">{dash}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge variant={TYPE_VARIANT[r.moveType] ?? 'muted'} data-testid={`movement-type-${r.id}`} className="text-[10px]">
                        {labels.moveType[r.moveType] ?? r.moveType}
                      </Badge>
                      <span
                        data-testid={`movement-source-${r.id}`}
                        title={labels.source[r.source]}
                        className="rounded-sm bg-slate-100 px-1 text-[9px] font-medium uppercase tracking-wide text-slate-500"
                      >
                        {labels.source[r.source]}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-600">{r.fromLocationCode ?? dash}</TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-600">{r.toLocationCode ?? dash}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.quantity}{r.uom ? ` ${r.uom}` : ''}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {r.moveDate ? r.moveDate.slice(0, 10) : dash}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {r.reasonText ? (
                      <Badge variant="muted" className="text-[10px]">{r.reasonText}</Badge>
                    ) : (
                      <span className="text-slate-400">{dash}</span>
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
          previousHref={previousHref}
          nextHref={nextHref}
          labels={labels.pagination}
          testId="movement-pagination"
        />
      </Card>
    </div>
  );
}
