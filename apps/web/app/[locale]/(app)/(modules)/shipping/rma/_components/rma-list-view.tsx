'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { CreateRmaModal } from './create-rma-modal';
import type { RmaListItem, RmaStatus } from '../../_actions/rma-actions-types';

export type RmaListLabels = {
  createRma: string;
  rowsCount: string;
  view: string;
  allStatuses: string;
  statusFilterLabel: string;
  empty: { title: string; body: string };
  status: Record<RmaStatus, string>;
  disposition: {
    none: string;
    restock: string;
    scrap: string;
    quality_hold: string;
  };
  columns: {
    rma: string;
    salesOrder: string;
    customer: string;
    reason: string;
    lines: string;
    status: string;
    created: string;
    disposition: string;
    actions: string;
  };
  create: {
    title: string;
    customerLabel: string;
    customerPlaceholder: string;
    salesOrderLabel: string;
    salesOrderPlaceholder: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    productLabel: string;
    productPlaceholder: string;
    qtyLabel: string;
    addLine: string;
    removeLine: string;
    submit: string;
    submitting: string;
    cancel: string;
    errors: Record<string, string>;
  };
};

const STATUS_TABS: Array<RmaStatus | ''> = ['', 'pending', 'approved', 'receiving', 'received', 'processed', 'closed'];

export function RmaListView({
  locale,
  rmas,
  statusFilter,
  labels,
  customers,
  reasonCodes,
  createRmaAction,
}: {
  locale: string;
  rmas: RmaListItem[];
  statusFilter: string;
  labels: RmaListLabels;
  customers: Array<{ id: string; code: string; name: string }>;
  reasonCodes: Array<{ code: string; label: string }>;
  createRmaAction: (input: unknown) => Promise<{ ok: boolean }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = React.useState(searchParams.get('new') === '1');

  function setStatus(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set('status', status);
    else params.delete('status');
    router.push(`/${locale}/shipping/rma?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="rma-list-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{labels.rowsCount.replace('{n}', String(rmas.length))}</p>
        <Button type="button" className="btn--primary btn-sm" data-testid="rma-create-open" onClick={() => setCreateOpen(true)}>
          + {labels.createRma}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={labels.statusFilterLabel}>
        {STATUS_TABS.map((status) => {
          const active = (statusFilter || '') === status;
          const count = status ? rmas.filter((r) => r.status === status).length : rmas.length;
          const label = status ? labels.status[status] : labels.allStatuses;
          return (
            <button
              key={status || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`rma-status-tab-${status || 'all'}`}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium',
                active ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
              onClick={() => setStatus(status)}
            >
              {label} <span className="ml-1 opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      {rmas.length === 0 ? (
        <EmptyState
          icon="↩"
          title={labels.empty.title}
          body={labels.empty.body}
          action={{ label: labels.createRma, onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="rma-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.rma}</th>
                <th className="px-3 py-2">{labels.columns.salesOrder}</th>
                <th className="px-3 py-2">{labels.columns.customer}</th>
                <th className="px-3 py-2">{labels.columns.reason}</th>
                <th className="px-3 py-2 text-right">{labels.columns.lines}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2">{labels.columns.created}</th>
                <th className="px-3 py-2">{labels.columns.disposition}</th>
                <th className="px-3 py-2">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rmas.map((rma) => (
                <tr key={rma.id} data-testid={`rma-row-${rma.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-mono font-semibold text-blue-700">{rma.rmaNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs">{rma.salesOrderNumber ?? '—'}</td>
                  <td className="px-3 py-2">{rma.customerName}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{rma.reasonLabel ?? rma.reasonCode}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{rma.lineCount}</td>
                  <td className="px-3 py-2">{labels.status[rma.status]}</td>
                  <td className="px-3 py-2 font-mono text-xs">{new Date(rma.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{rma.disposition ? labels.disposition[rma.disposition] : labels.disposition.none}</td>
                  <td className="px-3 py-2">
                    <Link href={`/${locale}/shipping/rma/${rma.id}`} className="text-sm text-blue-700 hover:underline" data-testid={`rma-view-${rma.id}`}>
                      {labels.view} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateRmaModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        customers={customers}
        reasonCodes={reasonCodes}
        createRmaAction={createRmaAction}
        onCreated={(id) => router.push(`/${locale}/shipping/rma/${id}`)}
      />
    </div>
  );
}
