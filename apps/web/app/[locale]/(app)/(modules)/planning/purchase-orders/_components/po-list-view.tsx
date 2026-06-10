'use client';

/**
 * P2-PLANNING — Purchase Orders list + create flow (client view).
 *
 * Prototype parity: prototypes/planning/po-screens.jsx:1-139 (PlanPOList):
 *     page head + "＋ Create PO" primary       → po-screens.jsx:37-47
 *     status tabs with counts                   → po-screens.jsx:8-16,56-62
 *     search + supplier filter bar              → po-screens.jsx:64-71
 *     dense table (PO / supplier / expected /   → po-screens.jsx:85-126
 *       lines / status / total) + per-row View
 *     "X of Y" footer                           → po-screens.jsx:128-136
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's 7 tabs (all/draft/submitted/pending_approval/confirmed/
 *     receiving/closed) are mapped to the REAL PurchaseOrderStatusSchema enum
 *     (all + draft/sent/confirmed/partially_received/received/cancelled). The
 *     reviewed backend (mig 262) has no submitted/pending_approval/receiving/closed
 *     states, so those buckets are replaced 1:1 with the real ones rather than
 *     faked.
 *   - The KPI strip (Open/Pending/Overdue/This month, po-screens.jsx:49-54), the
 *     "£186 420" totals, the bulk-select toolbar (73-83), the D365-drift tag (103),
 *     the date filter, "Bulk import", and pagination are dropped: none have a
 *     backing column/action in listPurchaseOrders. We render only honest, real
 *     columns: PO number, supplier (code+name), expected delivery, line count,
 *     status, currency. Line count + currency stand in for the prototype's
 *     "Lines"/"Total" columns (no money rollup is persisted on the header).
 *   - Supplier filter loads from the REAL suppliers master (listPoSuppliers), NOT
 *     the prototype's hardcoded <option> list (po-screens.jsx:66).
 *
 * Data comes from the reviewed actions (listPurchaseOrders feeds `purchaseOrders`;
 * createPurchaseOrder passed as a seam). RBAC is enforced server-side inside the
 * actions; this view never trusts a client permission flag.
 *
 * UI states: loading (Suspense fallback in page.tsx), empty (EmptyState), error
 * (page renders an error banner instead of this view), optimistic (create pending
 * in the modal). Read is RLS-scoped so a denied user sees an empty org-scoped list.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { PoStatusBadge } from './po-status-badge';
import { CreatePoModal, type CreatePoLabels, type CreatePoResult } from './create-po-modal';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items';
import type { PoSupplierOption } from '../_actions/po-form-data';

export type PoRow = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  status: string;
  expectedDelivery: string | null;
  currency: string;
  notes: string | null;
  lineCount: number;
};

const TAB_ORDER = ['all', 'draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type PoListLabels = {
  createPo: string;
  searchPlaceholder: string;
  rowsCount: string;
  supplierFilterLabel: string;
  allSuppliers: string;
  clearFilters: string;
  tabsAll: string;
  status: Record<string, string>;
  columns: {
    po: string;
    supplier: string;
    expected: string;
    lines: string;
    status: string;
    currency: string;
    actions: string;
  };
  view: string;
  empty: {
    title: string;
    body: string;
    clear: string;
  };
  create: CreatePoLabels;
};

export type PoListViewProps = {
  locale: string;
  purchaseOrders: PoRow[];
  suppliers: PoSupplierOption[];
  labels: PoListLabels;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  searchPoItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  createPurchaseOrderAction: (input: {
    poNumber: string;
    supplierId: string;
    expectedDelivery?: string;
    currency: string;
    notes?: string;
    lines: Array<{ itemId: string; qty: string; uom: string; unitPrice: string; lineNo: number }>;
  }) => Promise<CreatePoResult>;
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

export function PoListView({
  locale,
  purchaseOrders,
  suppliers,
  labels,
  autoOpenCreate = false,
  searchPoItemsAction,
  createPurchaseOrderAction,
}: PoListViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>('all');
  const [search, setSearch] = React.useState('');
  const [supplierFilter, setSupplierFilter] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);

  const counts = React.useMemo(() => {
    const c: Record<TabKey, number> = {
      all: purchaseOrders.length,
      draft: 0,
      sent: 0,
      confirmed: 0,
      partially_received: 0,
      received: 0,
      cancelled: 0,
    };
    for (const po of purchaseOrders) {
      const k = po.status.toLowerCase() as TabKey;
      if (k in c && k !== 'all') c[k] += 1;
    }
    return c;
  }, [purchaseOrders]);

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (tab !== 'all' && po.status.toLowerCase() !== tab) return false;
      if (supplierFilter && po.supplierId !== supplierFilter) return false;
      if (!term) return true;
      return (
        po.poNumber.toLowerCase().includes(term) ||
        (po.supplierCode ?? '').toLowerCase().includes(term) ||
        (po.supplierName ?? '').toLowerCase().includes(term)
      );
    });
  }, [purchaseOrders, tab, search, supplierFilter]);

  function statusLabel(status: string): string {
    return labels.status[status.toLowerCase()] ?? status;
  }
  function tabLabel(key: TabKey): string {
    return key === 'all' ? labels.tabsAll : labels.status[key] ?? key;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="po-list-view">
      {/* Header action */}
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={search}
          data-testid="po-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Button type="button" className="btn--primary" data-testid="po-list-create" onClick={() => setCreateOpen(true)}>
          + {labels.createPo}
        </Button>
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label={labels.tabsAll} data-testid="po-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`po-list-tab-${key}`}
            onClick={() => setTab(key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {tabLabel(key)}
            <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            value={supplierFilter}
            onValueChange={setSupplierFilter}
            aria-label={labels.supplierFilterLabel}
            options={[
              { value: '', label: labels.allSuppliers },
              ...suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
            ]}
          />
        </div>
        <button
          type="button"
          className="text-xs text-blue-700 hover:underline"
          data-testid="po-list-clear"
          onClick={() => {
            setSearch('');
            setTab('all');
            setSupplierFilter('');
          }}
        >
          {labels.clearFilters}
        </button>
        <span className="ml-auto text-xs text-slate-500" data-testid="po-list-rows-count">
          {labels.rowsCount.replace('{n}', String(visible.length))}
        </span>
      </div>

      {/* Table / empty */}
      {visible.length === 0 ? (
        <EmptyState
          icon="📦"
          title={labels.empty.title}
          body={labels.empty.body}
          action={{
            label: labels.empty.clear,
            onClick: () => {
              setSearch('');
              setTab('all');
              setSupplierFilter('');
            },
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="po-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.po}</th>
                <th className="px-3 py-2">{labels.columns.supplier}</th>
                <th className="px-3 py-2">{labels.columns.expected}</th>
                <th className="px-3 py-2 text-right">{labels.columns.lines}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2">{labels.columns.currency}</th>
                <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((po) => (
                <tr key={po.id} data-testid={`po-row-${po.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/${locale}/planning/purchase-orders/${po.id}`}
                      prefetch={false}
                      className="font-mono font-semibold text-blue-700 hover:underline"
                      data-testid={`po-link-${po.id}`}
                    >
                      {po.poNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{po.supplierName ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-500">{po.supplierCode ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtDate(po.expectedDelivery, locale)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{po.lineCount}</td>
                  <td className="px-3 py-2">
                    <PoStatusBadge status={po.status} label={statusLabel(po.status)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{po.currency}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/${locale}/planning/purchase-orders/${po.id}`}
                      prefetch={false}
                      className="text-xs text-blue-700 hover:underline"
                      data-testid={`po-view-${po.id}`}
                    >
                      {labels.view}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreatePoModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        suppliers={suppliers}
        searchPoItemsAction={searchPoItemsAction}
        createPurchaseOrderAction={createPurchaseOrderAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
