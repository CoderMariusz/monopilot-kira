'use client';

/**
 * P2-PLANNING — Transfer Orders list + create flow (client view).
 *
 * Prototype parity: prototypes/planning/to-screens.jsx:3-99 (PlanTOList):
 *   page head + "＋ Create TO" primary       → to-screens.jsx:35-38
 *   status tabs with counts                  → to-screens.jsx:8-16,50-56
 *   search filter bar                        → to-screens.jsx:58-67
 *   dense table (TO / from / to / scheduled  → to-screens.jsx:69-96
 *     / status / lines) with row → detail
 *   empty-state                              → (added per UI-state policy)
 *
 * Deviations (parity evidence):
 *   - The prototype's KPI strip (Open / In-transit / Overdue / This-week), the
 *     from/to/priority/date filter selects, the "Export" button and the synthetic
 *     "overdue" / "this week" buckets are dropped: none are backed by the reviewed
 *     listTransferOrders action (no priority, no overdue flag, no week aggregate).
 *     We keep status tabs (All + draft/in_transit/received/cancelled — the real
 *     enum) with live counts + a search over the TO number.
 *   - Warehouse names are not on the TO row (from/to are soft uuid refs); we look
 *     them up from listTransferWarehouses passed by the RSC.
 *
 * Data comes from the reviewed actions (listTransferOrders feeds `transferOrders`;
 * createTransferOrder passed as a seam). RBAC for create is enforced server-side
 * inside the action; this view never trusts a client permission flag.
 *
 * UI states: loading (Suspense fallback in page.tsx), empty (EmptyState), error
 * (page renders an error banner instead of this view), optimistic (create pending
 * in the modal).
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Badge } from '@monopilot/ui/Badge';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { ToStatusBadge } from './to-status-badge';
import { CreateToModal, type CreateToLabels } from './create-to-modal';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import type { WarehouseOption, SearchTransferItemsInput } from '../_actions/to-form-data';

export type TransferOrderRow = {
  id: string;
  toNumber: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  status: string;
  scheduledDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateTransferOrderResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

const TAB_ORDER = ['all', 'draft', 'in_transit', 'received', 'cancelled'] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type ToListLabels = {
  createTo: string;
  searchPlaceholder: string;
  rowsCount: string;
  tabs: Record<TabKey, string>;
  status: Record<string, string>;
  columns: {
    to: string;
    from: string;
    to_wh: string;
    scheduled: string;
    status: string;
    lines: string;
    actions: string;
  };
  linesCount: string;
  empty: { title: string; body: string; clear: string };
  create: CreateToLabels;
};

export type ToListViewProps = {
  locale: string;
  transferOrders: TransferOrderRow[];
  /** Per-TO line count, keyed by TO id (the list action doesn't aggregate it). */
  lineCounts: Record<string, number>;
  warehouses: WarehouseOption[];
  labels: ToListLabels;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  searchTransferItemsAction: (input: SearchTransferItemsInput) => Promise<ItemPickerOption[]>;
  createTransferOrderAction: (input: {
    toNumber: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    scheduledDate?: string;
    notes?: string;
    lines: { itemId: string; qty: string; uom: string; lineNo: number }[];
  }) => Promise<CreateTransferOrderResult>;
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

export function ToListView({
  locale,
  transferOrders,
  lineCounts,
  warehouses,
  labels,
  autoOpenCreate = false,
  searchTransferItemsAction,
  createTransferOrderAction,
}: ToListViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>('all');
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);

  const warehouseNames = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const w of warehouses) map[w.id] = w.code;
    return map;
  }, [warehouses]);

  const counts = React.useMemo(() => {
    const c: Record<TabKey, number> = { all: transferOrders.length, draft: 0, in_transit: 0, received: 0, cancelled: 0 };
    for (const to of transferOrders) {
      const k = to.status.toLowerCase() as TabKey;
      if (k in c && k !== 'all') c[k] += 1;
    }
    return c;
  }, [transferOrders]);

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return transferOrders.filter((to) => {
      if (tab !== 'all' && to.status.toLowerCase() !== tab) return false;
      if (!term) return true;
      return to.toNumber.toLowerCase().includes(term);
    });
  }, [transferOrders, tab, search]);

  function statusLabel(status: string): string {
    return labels.status[status.toLowerCase()] ?? status;
  }
  function warehouseLabel(id: string | null): string {
    if (!id) return '—';
    return warehouseNames[id] ?? id.slice(0, 8);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="to-list-view">
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={search}
          data-testid="to-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Button type="button" className="btn--primary" data-testid="to-list-create" onClick={() => setCreateOpen(true)}>
          + {labels.createTo}
        </Button>
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label={labels.tabs.all} data-testid="to-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`to-list-tab-${key}`}
            onClick={() => setTab(key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {labels.tabs[key]}
            <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">
              {counts[key]}
            </span>
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-500" data-testid="to-list-rows-count">
          {labels.rowsCount.replace('{n}', String(visible.length))}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="🚚"
          title={labels.empty.title}
          body={labels.empty.body}
          action={{
            label: labels.empty.clear,
            onClick: () => {
              setSearch('');
              setTab('all');
            },
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="to-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.to}</th>
                <th className="px-3 py-2">{labels.columns.from}</th>
                <th className="px-3 py-2">{labels.columns.to_wh}</th>
                <th className="px-3 py-2">{labels.columns.scheduled}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2 text-right">{labels.columns.lines}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((to) => (
                <tr key={to.id} data-testid={`to-row-${to.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/${locale}/planning/transfer-orders/${to.id}`}
                      prefetch={false}
                      className="font-mono font-semibold text-blue-700 hover:underline"
                      data-testid={`to-link-${to.id}`}
                    >
                      {to.toNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{warehouseLabel(to.fromWarehouseId)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{warehouseLabel(to.toWarehouseId)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtDate(to.scheduledDate, locale)}</td>
                  <td className="px-3 py-2">
                    <ToStatusBadge status={to.status} label={statusLabel(to.status)} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <Badge variant="muted">{labels.linesCount.replace('{n}', String(lineCounts[to.id] ?? 0))}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateToModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        warehouses={warehouses}
        searchTransferItemsAction={searchTransferItemsAction}
        createTransferOrderAction={createTransferOrderAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
