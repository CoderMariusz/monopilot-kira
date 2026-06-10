'use client';

/**
 * P2-PLANNING — Supplier master list (client view).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:29-152 (plan_supplier_list):
 *     page head + "＋ New supplier" primary       → suppliers.jsx:66-70
 *     KPI strip (active / lead time)              → suppliers.jsx:73-78
 *     status tabs with counts                     → suppliers.jsx:38-43,80
 *     search filter bar + rows count              → suppliers.jsx:82-90
 *     dense table (code / name / currency /       → suppliers.jsx:101-134
 *       lead time / status) + per-row View
 *     empty-state                                 → suppliers.jsx:93-99
 *     "Showing N of M" footer                     → suppliers.jsx:138-142
 *
 * Deviations (documented for parity evidence):
 *   - Tabs are the REAL status enum (active/inactive/blocked/all), not the
 *     prototype's active/inactive/D365-drift buckets. The D365 sync badge column +
 *     country / payment-terms / open-POs / D365-state filter selects + "Pull from
 *     D365" / "Export" header buttons are dropped: NONE have a backing column in
 *     the reviewed listSuppliers action (suppliers table = code/name/contact jsonb/
 *     currency/lead_time_days/status/notes). We render only real columns + an
 *     honest "Contact" cell from the contact jsonb (email when present).
 *   - The YTD-spend / D365-drift KPI cards have no data source → replaced with
 *     inactive + blocked counts the action can actually compute.
 *
 * Data comes from the reviewed listSuppliers action (feeds `suppliers`);
 * createSupplier passed as a seam. RBAC for create is enforced server-side inside
 * createSupplier — this view never trusts a client permission flag.
 *
 * UI states: loading (Suspense fallback in page.tsx), empty (EmptyState), error
 * (the page renders an error banner instead of this view), optimistic (create
 * pending in the modal).
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { SupplierStatusBadge } from './supplier-status-badge';
import { CreateSupplierModal, type CreateSupplierLabels } from './create-supplier-modal';
import { contactField, type Supplier, type CreateSupplierResult, type SupplierStatus } from './supplier-types';

const TAB_ORDER = ['all', 'active', 'inactive', 'blocked'] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type SupplierListLabels = {
  newSupplier: string;
  searchPlaceholder: string;
  rowsCount: string;
  showing: string;
  tabs: Record<TabKey, string>;
  status: Record<SupplierStatus, string>;
  columns: {
    code: string;
    name: string;
    contact: string;
    currency: string;
    leadTime: string;
    status: string;
    actions: string;
  };
  view: string;
  days: string;
  empty: {
    title: string;
    body: string;
    clear: string;
  };
  kpis: {
    active: string;
    activeSub: string;
    inactive: string;
    inactiveSub: string;
    blocked: string;
    blockedSub: string;
    avgLeadTime: string;
    avgLeadTimeSub: string;
  };
  create: CreateSupplierLabels;
};

export type SupplierListViewProps = {
  locale: string;
  suppliers: Supplier[];
  labels: SupplierListLabels;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  createSupplierAction: (input: {
    code: string;
    name: string;
    currency: string;
    leadTimeDays: number;
    status: SupplierStatus;
    contact?: Record<string, unknown>;
    notes?: string;
  }) => Promise<CreateSupplierResult>;
};

export function SupplierListView({
  locale,
  suppliers,
  labels,
  autoOpenCreate = false,
  createSupplierAction,
}: SupplierListViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>('active');
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);

  const counts = React.useMemo(() => {
    const c: Record<TabKey, number> = { all: suppliers.length, active: 0, inactive: 0, blocked: 0 };
    for (const s of suppliers) {
      const k = s.status.toLowerCase() as TabKey;
      if (k in c && k !== 'all') c[k] += 1;
    }
    return c;
  }, [suppliers]);

  const avgLeadTime = React.useMemo(() => {
    const active = suppliers.filter((s) => s.status.toLowerCase() === 'active');
    if (active.length === 0) return '0.0';
    const total = active.reduce((a, s) => a + s.leadTimeDays, 0);
    return (total / active.length).toFixed(1);
  }, [suppliers]);

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (tab !== 'all' && s.status.toLowerCase() !== tab) return false;
      if (!term) return true;
      return (
        s.code.toLowerCase().includes(term) ||
        s.name.toLowerCase().includes(term) ||
        (contactField(s.contact, 'email') ?? '').toLowerCase().includes(term)
      );
    });
  }, [suppliers, tab, search]);

  function statusLabel(status: string): string {
    return labels.status[status.toLowerCase() as SupplierStatus] ?? status;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="supplier-list-view">
      {/* KPI strip (parity: suppliers.jsx:73-78) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="supplier-kpi-strip">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{labels.kpis.active}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{counts.active}</div>
          <div className="text-xs text-slate-400">{labels.kpis.activeSub}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{labels.kpis.inactive}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{counts.inactive}</div>
          <div className="text-xs text-slate-400">{labels.kpis.inactiveSub}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{labels.kpis.blocked}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{counts.blocked}</div>
          <div className="text-xs text-slate-400">{labels.kpis.blockedSub}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{labels.kpis.avgLeadTime}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {avgLeadTime}
            <span className="text-sm text-slate-400">{labels.days}</span>
          </div>
          <div className="text-xs text-slate-400">{labels.kpis.avgLeadTimeSub}</div>
        </div>
      </div>

      {/* Search + create (parity: suppliers.jsx:66-70,82-83) */}
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={search}
          data-testid="supplier-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Button type="button" className="btn--primary" data-testid="supplier-list-create" onClick={() => setCreateOpen(true)}>
          + {labels.newSupplier}
        </Button>
      </div>

      {/* Status tabs (parity: suppliers.jsx:38-43,80) */}
      <div role="tablist" aria-label={labels.tabs.all} data-testid="supplier-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`supplier-list-tab-${key}`}
            onClick={() => setTab(key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {labels.tabs[key]}
            <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">{counts[key]}</span>
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-500" data-testid="supplier-list-rows-count">
          {labels.rowsCount.replace('{n}', String(visible.length))}
        </span>
      </div>

      {/* Table / empty (parity: suppliers.jsx:92-136) */}
      {visible.length === 0 ? (
        <EmptyState
          icon="◫"
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
          <table className="w-full text-sm" data-testid="supplier-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.code}</th>
                <th className="px-3 py-2">{labels.columns.name}</th>
                <th className="px-3 py-2">{labels.columns.contact}</th>
                <th className="px-3 py-2">{labels.columns.currency}</th>
                <th className="px-3 py-2 text-right">{labels.columns.leadTime}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const email = contactField(s.contact, 'email');
                return (
                  <tr key={s.id} data-testid={`supplier-row-${s.id}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/${locale}/planning/suppliers/${s.id}`}
                        prefetch={false}
                        className="font-mono font-semibold text-blue-700 hover:underline"
                        data-testid={`supplier-link-${s.id}`}
                      >
                        {s.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">
                      {email ? (
                        <span className="text-xs text-slate-600">{email}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{s.currency}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {s.leadTimeDays}
                      {labels.days}
                    </td>
                    <td className="px-3 py-2">
                      <SupplierStatusBadge status={s.status} label={statusLabel(s.status)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/${locale}/planning/suppliers/${s.id}`}
                        prefetch={false}
                        className="btn btn--ghost btn-sm"
                        data-testid={`supplier-view-${s.id}`}
                      >
                        {labels.view}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer (parity: suppliers.jsx:138-142) */}
      <div className="flex items-center text-xs text-slate-500" data-testid="supplier-list-footer">
        <span>{labels.showing.replace('{n}', String(visible.length)).replace('{total}', String(suppliers.length))}</span>
      </div>

      <CreateSupplierModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        createSupplierAction={createSupplierAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
