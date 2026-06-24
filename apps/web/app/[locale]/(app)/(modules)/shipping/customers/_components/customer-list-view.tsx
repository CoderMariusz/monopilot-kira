'use client';

/**
 * Wave-shipping — Customer master list (client view).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/shipping/
 *   customer-screens.jsx:3-129 (ShCustomerList):
 *     page head + "＋ Create customer" primary      → customer-screens.jsx:38-41
 *     KPI strip (total / active / inactive)         → customer-screens.jsx:44-49
 *     status tabs with counts                       → customer-screens.jsx:51-55
 *     search filter bar + rows count                → customer-screens.jsx:57-65
 *     dense table (name / code / category /         → customer-screens.jsx:80-121
 *       credit limit / status) + per-row View
 *     empty-state                                   → (added; prototype has no empty)
 *
 * Deviations (documented for parity evidence):
 *   - Tabs are the REAL active/inactive enum (+ all), not the prototype's
 *     PL/UK regex buckets (no country column in the reviewed customers master).
 *   - Bulk-select + Import/Export CSV header buttons, the payment-terms /
 *     allergen-profile / open-orders / last-order columns and the credit-status
 *     filter selects are dropped: NONE have a backing column in the reviewed
 *     listCustomers action (customers = customer_code/name/email/phone/tax_id/
 *     category/credit_limit_gbp/is_active). We render only real columns.
 *   - The "new this month" KPI has no cheap source → replaced with inactive count.
 *
 * Data comes from the reviewed listCustomers action (feeds `customers`);
 * createCustomer passed as a seam. RBAC for create is enforced server-side inside
 * createCustomer — this view never trusts a client permission flag.
 *
 * UI states: loading (Suspense fallback in page.tsx), empty (EmptyState), error
 * (the page renders an error banner instead of this view), optimistic (create
 * pending in the modal).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { CustomerStatusBadge } from './customer-status-badge';
import { CreateCustomerModal, type CreateCustomerLabels } from './create-customer-modal';
import type { Customer, CustomerCategory, CreateCustomerInput, CreateCustomerResult } from './customer-types';

const TAB_ORDER = ['all', 'active', 'inactive'] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type CustomerListLabels = {
  newCustomer: string;
  searchPlaceholder: string;
  rowsCount: string;
  showing: string;
  tabs: Record<TabKey, string>;
  status: { active: string; inactive: string };
  category: Record<CustomerCategory, string>;
  columns: {
    name: string;
    code: string;
    category: string;
    creditLimit: string;
    email: string;
    status: string;
    actions: string;
  };
  view: string;
  noLimit: string;
  empty: {
    title: string;
    body: string;
    clear: string;
  };
  kpis: {
    total: string;
    totalSub: string;
    active: string;
    activeSub: string;
    inactive: string;
    inactiveSub: string;
    withCredit: string;
    withCreditSub: string;
  };
  create: CreateCustomerLabels;
};

export type CustomerListViewProps = {
  locale: string;
  customers: Customer[];
  labels: CustomerListLabels;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  createCustomerAction: (input: CreateCustomerInput) => Promise<CreateCustomerResult>;
};

export function CustomerListView({
  locale: _locale,
  customers,
  labels,
  autoOpenCreate = false,
  createCustomerAction,
}: CustomerListViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>('active');
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);

  const counts = React.useMemo(() => {
    const c: Record<TabKey, number> = { all: customers.length, active: 0, inactive: 0 };
    for (const cu of customers) {
      if (cu.isActive) c.active += 1;
      else c.inactive += 1;
    }
    return c;
  }, [customers]);

  const withCredit = React.useMemo(
    () => customers.filter((c) => c.creditLimitGbp != null && Number(c.creditLimitGbp) > 0).length,
    [customers],
  );

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (tab === 'active' && !c.isActive) return false;
      if (tab === 'inactive' && c.isActive) return false;
      if (!term) return true;
      return (
        c.code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        (c.email ?? '').toLowerCase().includes(term)
      );
    });
  }, [customers, tab, search]);

  function categoryLabel(category: string): string {
    return labels.category[category.toLowerCase() as CustomerCategory] ?? category;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="customer-list-view">
      {/* Search + create (parity: customer-screens.jsx:40,58) */}
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={search}
          data-testid="customer-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Button type="button" className="btn--primary" data-testid="customer-list-create" onClick={() => setCreateOpen(true)}>
          + {labels.newCustomer}
        </Button>
      </div>

      {/* KPI strip (parity: customer-screens.jsx:44-49) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="customer-kpi-strip">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{labels.kpis.total}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{counts.all}</div>
          <div className="text-xs text-slate-400">{labels.kpis.totalSub}</div>
        </div>
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
          <div className="text-xs uppercase tracking-wide text-slate-500">{labels.kpis.withCredit}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{withCredit}</div>
          <div className="text-xs text-slate-400">{labels.kpis.withCreditSub}</div>
        </div>
      </div>

      {/* Status tabs (parity: customer-screens.jsx:51-55) */}
      <div role="tablist" aria-label={labels.tabs.all} data-testid="customer-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`customer-list-tab-${key}`}
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
        <span className="ml-auto self-center text-xs text-slate-500" data-testid="customer-list-rows-count">
          {labels.rowsCount.replace('{n}', String(visible.length))}
        </span>
      </div>

      {/* Table / empty (parity: customer-screens.jsx:79-121) */}
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
          <table className="w-full text-sm" data-testid="customer-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.name}</th>
                <th className="px-3 py-2">{labels.columns.code}</th>
                <th className="px-3 py-2">{labels.columns.category}</th>
                <th className="px-3 py-2">{labels.columns.email}</th>
                <th className="px-3 py-2 text-right">{labels.columns.creditLimit}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} data-testid={`customer-row-${c.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-blue-700">{c.code}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{categoryLabel(c.category)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {c.email ? <span className="text-xs text-slate-600">{c.email}</span> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {c.creditLimitGbp != null && Number(c.creditLimitGbp) > 0 ? (
                      `£${Number(c.creditLimitGbp).toLocaleString()}`
                    ) : (
                      <span className="text-slate-400">{labels.noLimit}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <CustomerStatusBadge active={c.isActive} label={c.isActive ? labels.status.active : labels.status.inactive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer (parity: customer-screens.jsx:36 muted summary) */}
      <div className="flex items-center text-xs text-slate-500" data-testid="customer-list-footer">
        <span>{labels.showing.replace('{n}', String(visible.length)).replace('{total}', String(customers.length))}</span>
      </div>

      <CreateCustomerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        createCustomerAction={createCustomerAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
