'use client';

/**
 * Wave-shipping — Sales Orders list + create flow (client view).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/shipping/so-screens.jsx:1-185 (ShSOList):
 *     page head + "＋ Create SO" primary       → so-screens.jsx:42-52
 *     status tabs with counts                   → so-screens.jsx:12-21,54-58
 *     search + customer filter bar              → so-screens.jsx:60-70
 *     dense table (SO# / customer / status /    → so-screens.jsx:92-168
 *       target ship / lines / total) + row View
 *     "X of Y" footer                           → so-screens.jsx:172-182
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's 8 tabs (all/draft/confirmed/allocated/picking/packing/shipped/
 *     held) are mapped to the REAL sales_orders.status enum (so-actions.ts:
 *     draft / confirmed / allocated / partially_picked / picked / partially_packed /
 *     packed / manifested / shipped / partially_delivered / delivered / cancelled).
 *     The prototype's synthetic "held"/"picking"/"packing" buckets and the bulk
 *     toolbar / GHA "needs attention" grouping / carrier+date filters / pagination /
 *     CSV export are dropped: none have a backing column/action in listSalesOrders.
 *   - Customer filter loads from the REAL customers master (listSoCustomers), NOT the
 *     prototype's hardcoded SH_CUSTOMERS list (so-screens.jsx:62).
 *   - The prototype Picked / Holds / allocation-bar / customer-PO columns are
 *     dropped (no backing data in the listSalesOrders row); we render only honest
 *     real columns.
 *
 * Data comes from the reviewed actions (listSalesOrders feeds `salesOrders`;
 * createSalesOrder passed as a seam). RBAC is enforced server-side inside the
 * actions; this view never trusts a client permission flag.
 *
 * UI states: loading (Suspense fallback in page.tsx), empty-with-CTA (EmptyState),
 * error + permission-denied (page renders the banner/denied panel instead of this
 * view), optimistic (create pending in the modal). NO raw UUIDs are ever rendered.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { SoStatusBadge } from './so-status-badge';
import { CreateSoModal, type CreateCustomerResult, type CreateSoLabels, type CreateSoResult } from './create-so-modal';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../(npd)/fa/actions/search-items-types';
import type { SoCustomerOption } from '../_actions/so-form-data';
import { downloadCsv, toCsv } from '../../../../../../lib/shared/download';
import { buildListPageHref } from '../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../lib/shared/pagination';

export type SoRow = {
  id: string;
  soNumber: string;
  customerName: string | null;
  customerCode: string | null;
  status: string;
  lineCount: number;
  total: string;
  expectedShipDate: string | null;
  createdAt: string;
};

const TAB_ORDER = [
  'all',
  'draft',
  'confirmed',
  'allocated',
  'picked',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type SoListFilters = {
  status: string;
  search: string;
  customerCode: string;
};

function listQuery(filters: SoListFilters, extra?: { new?: string }): Record<string, string | undefined> {
  return {
    status: filters.status || undefined,
    q: filters.search || undefined,
    customer: filters.customerCode || undefined,
    new: extra?.new,
  };
}

function hasActiveFilters(filters: SoListFilters): boolean {
  return Boolean(filters.status || filters.search || filters.customerCode);
}

export type SoListLabels = {
  createSo: string;
  searchPlaceholder: string;
  rowsCount: string;
  customerFilterLabel: string;
  allCustomers: string;
  clearFilters: string;
  tabsAll: string;
  status: Record<string, string>;
  columns: {
    so: string;
    customer: string;
    status: string;
    expected: string;
    lines: string;
    total: string;
    actions: string;
  };
  view: string;
  empty: {
    title: string;
    body: string;
    clear: string;
  };
  create: CreateSoLabels;
  pagination: ListPaginationLabels;
};

export type SoListViewProps = {
  locale: string;
  salesOrders: SoRow[];
  pagination: PaginatedResult<SoRow>;
  filters: SoListFilters;
  customers: SoCustomerOption[];
  labels: SoListLabels;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  searchSoItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  createCustomerAction?: (input: { name: string; category: 'retail'; isActive: true }) => Promise<CreateCustomerResult>;
  createSalesOrderAction: (input: {
    customer_id: string;
    requested_date?: string;
    notes?: string;
    lines: Array<{ item_id: string; qty: string; uom: string; unit_price_gbp?: string }>;
  }) => Promise<CreateSoResult>;
  resolveSoLinePricesAction: (input: {
    customer_id: string;
    lines: Array<{ item_id: string }>;
  }) => Promise<Array<{ item_id: string; unitPriceGbp: string; foreignCustomerPrice?: { unit_price: string; currency: string } }>>;
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

/**
 * The sales-order money model is GBP-denominated at the schema level: the backing
 * columns are literally `sales_orders.total_amount_gbp`, `sales_order_lines.line_total_gbp`
 * and `sales_order_lines.unit_price_gbp` (211-shipping-schema-foundation.sql). There is
 * no per-org / per-SO currency column to switch on, so the displayed unit MUST match the
 * stored unit — GBP. This constant ties the formatter to that schema fact instead of
 * being a free-floating magic literal. (A multi-currency model would need a schema
 * `currency_code` column + a backfill migration — out of scope here.)
 */
const SO_CURRENCY = 'GBP';

/** Money string from the action's decimal `total` (GBP — see SO_CURRENCY). A genuine
 *  0 total (no line prices) formats as £0.00, which is honest, not a placeholder. */
function money(value: string, locale: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: SO_CURRENCY }).format(n);
}

function customerText(name: string | null, code: string | null): string {
  if (name && code) return `${name} (${code})`;
  return name ?? code ?? '—';
}

export function SoListView({
  locale,
  salesOrders,
  pagination,
  filters,
  customers,
  labels,
  autoOpenCreate = false,
  searchSoItemsAction,
  createCustomerAction = async () => ({ ok: false, error: 'forbidden' }),
  createSalesOrderAction,
  resolveSoLinePricesAction,
}: SoListViewProps) {
  const router = useRouter();
  const basePath = `/${locale}/shipping`;
  const activeTab: TabKey = (filters.status as TabKey) || 'all';
  const pageHref = (page: number) => buildListPageHref(basePath, listQuery(filters), page);
  const shown = pagination.offset + salesOrders.length;
  const [searchDraft, setSearchDraft] = React.useState(filters.search);
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);
  const [exportError, setExportError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => {
      router.push(buildListPageHref(basePath, listQuery({ ...filters, search: searchDraft }), 1));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [basePath, filters, router, searchDraft]);

  function navigate(next: Partial<SoListFilters>) {
    router.push(buildListPageHref(basePath, listQuery({ ...filters, ...next }), 1));
  }

  function tabCount(key: TabKey): number {
    if (key === activeTab) return pagination.total;
    return 0;
  }

  function statusLabel(status: string): string {
    return labels.status[status.toLowerCase()] ?? status;
  }
  function tabLabel(key: TabKey): string {
    return key === 'all' ? labels.tabsAll : labels.status[key] ?? key;
  }

  function clearAll() {
    setSearchDraft('');
    router.push(autoOpenCreate ? `${basePath}?new=1` : basePath);
  }

  function exportCsv() {
    setExportError(null);
    try {
      const headers = [
        labels.columns.so,
        labels.columns.customer,
        labels.columns.status,
        labels.columns.expected,
        labels.columns.lines,
        labels.columns.total,
        labels.columns.actions,
      ];
      const rows = salesOrders.map((so) => [
        so.soNumber,
        customerText(so.customerName, so.customerCode),
        statusLabel(so.status),
        fmtDate(so.expectedShipDate, locale),
        so.lineCount,
        money(so.total, locale),
        labels.view,
      ]);
      downloadCsv(toCsv(headers, rows), 'sales-orders.csv');
    } catch (error) {
      console.error('Failed to export sales orders CSV', error);
      setExportError('CSV export failed.');
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="so-list-view">
      {/* Header action */}
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={searchDraft}
          data-testid="so-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearchDraft(e.target.value)}
          className="w-72"
        />
        <div className="flex items-center gap-2">
          <Button type="button" data-testid="so-list-export-csv" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button type="button" className="btn--primary" data-testid="so-list-create" onClick={() => setCreateOpen(true)}>
            + {labels.createSo}
          </Button>
        </div>
      </div>
      {exportError ? (
        <p className="text-xs text-red-700" role="alert" data-testid="so-list-export-error">
          {exportError}
        </p>
      ) : null}

      {/* Status tabs — server-side filter via URL searchParams. */}
      <div role="tablist" aria-label={labels.tabsAll} data-testid="so-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            data-testid={`so-list-tab-${key}`}
            onClick={() => navigate({ status: key === 'all' ? '' : key })}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              activeTab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {tabLabel(key)}
            {tabCount(key) > 0 ? (
              <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">
                {tabCount(key)}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            value={filters.customerCode}
            onValueChange={(value) => navigate({ customerCode: value })}
            aria-label={labels.customerFilterLabel}
            options={[
              { value: '', label: labels.allCustomers },
              ...customers.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
            ]}
          />
        </div>
        <button type="button" className="text-xs text-blue-700 hover:underline" data-testid="so-list-clear" onClick={clearAll}>
          {labels.clearFilters}
        </button>
        <span className="ml-auto text-xs text-slate-500" data-testid="so-list-rows-count">
          {labels.rowsCount.replace('{n}', String(pagination.total))}
        </span>
      </div>

      {/* Table / empty */}
      {salesOrders.length === 0 ? (
        <EmptyState
          icon="📦"
          title={labels.empty.title}
          body={hasActiveFilters(filters) ? labels.empty.clear : labels.empty.body}
          action={{ label: labels.empty.clear, onClick: clearAll }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="so-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.so}</th>
                <th className="px-3 py-2">{labels.columns.customer}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2">{labels.columns.expected}</th>
                <th className="px-3 py-2 text-right">{labels.columns.lines}</th>
                <th className="px-3 py-2 text-right">{labels.columns.total}</th>
                <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {salesOrders.map((so) => (
                <tr key={so.id} data-testid={`so-row-${so.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/${locale}/shipping/${so.id}`}
                      prefetch={false}
                      className="font-mono font-semibold text-blue-700 hover:underline"
                      data-testid={`so-link-${so.id}`}
                    >
                      {so.soNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{so.customerName ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-500">{so.customerCode ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <SoStatusBadge status={so.status} label={statusLabel(so.status)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtDate(so.expectedShipDate, locale)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{so.lineCount}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{money(so.total, locale)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/${locale}/shipping/${so.id}`}
                      prefetch={false}
                      className="text-xs text-blue-700 hover:underline"
                      data-testid={`so-view-${so.id}`}
                    >
                      {labels.view}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListPaginationFooter
            shown={shown}
            total={pagination.total}
            previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
            nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
            labels={labels.pagination}
            testId="so-list-pagination"
          />
        </div>
      )}

      <CreateSoModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        customers={customers}
        searchSoItemsAction={searchSoItemsAction}
        createCustomerAction={createCustomerAction}
        createSalesOrderAction={createSalesOrderAction}
        resolveSoLinePricesAction={resolveSoLinePricesAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
