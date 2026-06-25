'use client';

/**
 * WH-012 — Inventory browser (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:3-155 (inventory_browser_page):
 *     pivot pills By product / By location / By batch → other-screens.jsx:24-28
 *     product rows (code+name, on-hand with pickable subfigure, LPs,
 *       earliest expiry)                              → other-screens.jsx:43-99
 *     location pivot rows                             → other-screens.jsx:102-123
 *     batch pivot rows                                → other-screens.jsx:125-150
 *
 * The three pivots are fed by three already-loaded, org-scoped row sets
 * (getInventoryByProduct / ByLocation / ByBatch). The client owns ONLY the pivot
 * tab + the client-side search filter (the prototype's `view` useState). No data
 * fetching, no permission logic.
 *
 * DEVIATIONS (red-lines): the prototype's value/GBP column + 🔒 manager-gate, the
 * expandable per-product LP sub-table, item-type / strategy / utilisation columns
 * and the extra filter selects are out of scope. The action surfaces total
 * on-hand qty, pickable qty, LP count and earliest expiry per pivot — those are
 * the parity target.
 * No raw <select>: the pivot is a pill group; search is a text input.
 */

import { useMemo, useState } from 'react';

import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { downloadCsv, toCsv } from '../../../../../../../lib/shared/download';
import type {
  InventoryByBatchRow,
  InventoryByLocationRow,
  InventoryByProductRow,
} from '../../_actions/shared';

export type InventoryPivot = 'product' | 'location' | 'batch';

export const INVENTORY_PIVOTS: InventoryPivot[] = ['product', 'location', 'batch'];

export type InventoryBrowserLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  rowsLabel: string;
  emptyAll: string;
  emptyFiltered: string;
  none: string;
  pickable: string;
  pivots: Record<InventoryPivot, string>;
  product: { item: string; total: string; lps: string; earliestExpiry: string };
  location: { location: string; warehouse: string; total: string; lps: string };
  batch: { batch: string; item: string; total: string; lps: string; earliestExpiry: string };
};

function formatQty(qty: string, uom?: string | null): string {
  return uom ? `${qty} ${uom}` : qty;
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

export function InventoryBrowserClient({
  byProduct,
  byLocation,
  byBatch,
  labels,
}: {
  byProduct: InventoryByProductRow[];
  byLocation: InventoryByLocationRow[];
  byBatch: InventoryByBatchRow[];
  labels: InventoryBrowserLabels;
}) {
  const [pivot, setPivot] = useState<InventoryPivot>('product');
  const [search, setSearch] = useState('');

  const dash = labels.none;
  const q = search.trim().toLowerCase();

  const counts: Record<InventoryPivot, number> = {
    product: byProduct.length,
    location: byLocation.length,
    batch: byBatch.length,
  };

  const visibleProduct = useMemo(
    () =>
      byProduct.filter(
        (r) =>
          q === '' ||
          (r.itemCode ?? '').toLowerCase().includes(q) ||
          (r.itemName ?? '').toLowerCase().includes(q),
      ),
    [byProduct, q],
  );
  const visibleLocation = useMemo(
    () =>
      byLocation.filter(
        (r) =>
          q === '' ||
          (r.locationCode ?? '').toLowerCase().includes(q) ||
          (r.warehouseCode ?? '').toLowerCase().includes(q),
      ),
    [byLocation, q],
  );
  const visibleBatch = useMemo(
    () =>
      byBatch.filter(
        (r) =>
          q === '' ||
          (r.batchNumber ?? '').toLowerCase().includes(q) ||
          (r.itemCode ?? '').toLowerCase().includes(q),
      ),
    [byBatch, q],
  );

  const rawCount = counts[pivot];
  const visibleCount =
    pivot === 'product'
      ? visibleProduct.length
      : pivot === 'location'
        ? visibleLocation.length
        : visibleBatch.length;

  function handleExportCsv() {
    if (pivot === 'product') {
      const header = [
        labels.product.item,
        labels.product.total,
        labels.product.lps,
        labels.product.earliestExpiry,
      ];
      const rows = visibleProduct.map((r) => [
        [r.itemName ?? dash, r.itemCode ?? ''].filter(Boolean).join(' '),
        `${formatQty(r.totalQty, r.uom)} (${formatQty(r.pickableQty, r.uom)} ${labels.pickable})`,
        r.lpCount,
        r.earliestExpiryDate ? r.earliestExpiryDate.slice(0, 10) : dash,
      ]);
      downloadCsv(toCsv(header, rows), 'warehouse-inventory-product.csv');
      return;
    }

    if (pivot === 'location') {
      const header = [labels.location.location, labels.location.warehouse, labels.location.total, labels.location.lps];
      const rows = visibleLocation.map((r) => [
        r.locationCode ?? dash,
        r.warehouseCode ?? dash,
        `${r.totalQty} (${r.pickableQty} ${labels.pickable})`,
        r.lpCount,
      ]);
      downloadCsv(toCsv(header, rows), 'warehouse-inventory-location.csv');
      return;
    }

    const header = [
      labels.batch.batch,
      labels.batch.item,
      labels.batch.total,
      labels.batch.lps,
      labels.batch.earliestExpiry,
    ];
    const rows = visibleBatch.map((r) => [
      r.batchNumber ?? dash,
      r.itemCode ?? dash,
      `${r.totalQty} (${r.pickableQty} ${labels.pickable})`,
      r.lpCount,
      r.earliestExpiryDate ? r.earliestExpiryDate.slice(0, 10) : dash,
    ]);
    downloadCsv(toCsv(header, rows), 'warehouse-inventory-batch.csv');
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pivot pills (parity other-screens.jsx:24-28). */}
      <div role="tablist" aria-label={labels.searchLabel} className="flex flex-wrap gap-1.5">
        {INVENTORY_PIVOTS.map((k) => {
          const on = pivot === k;
          return (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={on}
              data-testid={`inventory-pivot-${k}`}
              onClick={() => setPivot(k)}
              className={[
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                on
                  ? 'border-slate-900 bg-slate-900 font-medium text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              ].join(' ')}
            >
              {labels.pivots[k]}
              <span
                className={[
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {counts[k]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + visible-row count. */}
      <Card className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="inventory-search"
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
        <span className="text-xs text-slate-500" data-testid="inventory-rows">
          {labels.rowsLabel.replace('{count}', String(visibleCount))}
        </span>
      </Card>

      <Card
        data-testid="inventory-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rawCount === 0 ? (
          <p data-testid="inventory-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyAll}
          </p>
        ) : visibleCount === 0 ? (
          <p data-testid="inventory-empty-filtered" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyFiltered}
          </p>
        ) : pivot === 'product' ? (
          <Table aria-label={labels.pivots.product}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.product.item}</TableHead>
                <TableHead scope="col" className="text-right">{labels.product.total}</TableHead>
                <TableHead scope="col" className="text-right">{labels.product.lps}</TableHead>
                <TableHead scope="col">{labels.product.earliestExpiry}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProduct.map((r) => (
                <TableRow key={r.productId} data-testid={`inventory-product-${r.productId}`}>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-900">{r.itemName ?? dash}</span>
                      {r.itemCode ? (
                        <span className="font-mono text-[11px] text-slate-500">{r.itemCode}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="block font-mono text-sm text-slate-900">{formatQty(r.totalQty, r.uom)}</span>
                    <span className="block font-mono text-[11px] text-slate-500">
                      {formatQty(r.pickableQty, r.uom)} {labels.pickable}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{r.lpCount}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {r.earliestExpiryDate ? r.earliestExpiryDate.slice(0, 10) : dash}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : pivot === 'location' ? (
          <Table aria-label={labels.pivots.location}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.location.location}</TableHead>
                <TableHead scope="col">{labels.location.warehouse}</TableHead>
                <TableHead scope="col" className="text-right">{labels.location.total}</TableHead>
                <TableHead scope="col" className="text-right">{labels.location.lps}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLocation.map((r, i) => (
                <TableRow key={r.locationId ?? `loc-${i}`} data-testid={`inventory-location-${r.locationId ?? i}`}>
                  <TableCell className="font-mono text-xs text-slate-700">{r.locationCode ?? dash}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{r.warehouseCode ?? dash}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="block font-mono text-sm text-slate-900">{r.totalQty}</span>
                    <span className="block font-mono text-[11px] text-slate-500">
                      {r.pickableQty} {labels.pickable}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{r.lpCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table aria-label={labels.pivots.batch}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.batch.batch}</TableHead>
                <TableHead scope="col">{labels.batch.item}</TableHead>
                <TableHead scope="col" className="text-right">{labels.batch.total}</TableHead>
                <TableHead scope="col" className="text-right">{labels.batch.lps}</TableHead>
                <TableHead scope="col">{labels.batch.earliestExpiry}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleBatch.map((r, i) => (
                <TableRow key={`${r.productId}-${r.batchNumber ?? i}`} data-testid={`inventory-batch-${r.productId}-${i}`}>
                  <TableCell className="font-mono text-[11px] font-semibold text-slate-700">
                    {r.batchNumber ?? dash}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-600">{r.itemCode ?? dash}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="block font-mono text-sm text-slate-900">{r.totalQty}</span>
                    <span className="block font-mono text-[11px] text-slate-500">
                      {r.pickableQty} {labels.pickable}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{r.lpCount}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {r.earliestExpiryDate ? r.earliestExpiryDate.slice(0, 10) : dash}
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
