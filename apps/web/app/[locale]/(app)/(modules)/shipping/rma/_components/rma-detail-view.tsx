'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import type { RmaDetail, RmaDisposition } from '../../_actions/rma-actions-types';

export type RmaDetailLabels = {
  backToList: string;
  summaryTitle: string;
  linesTitle: string;
  fields: {
    rma: string;
    customer: string;
    salesOrder: string;
    reason: string;
    status: string;
    disposition: string;
    totalValue: string;
    notes: string;
    created: string;
  };
  status: Record<string, string>;
  disposition: Record<RmaDisposition | 'none', string>;
  lineColumns: {
    product: string;
    expected: string;
    received: string;
    lot: string;
    notes: string;
  };
  actions: {
    approve: string;
    receive: string;
    processRestock: string;
    processScrap: string;
    processQualityHold: string;
    close: string;
    pending: string;
  };
  errors: Record<string, string>;
};

export function RmaDetailView({
  locale,
  rma,
  labels,
  approveRmaAction,
  receiveRmaAction,
  processRmaAction,
  closeRmaAction,
}: {
  locale: string;
  rma: RmaDetail;
  labels: RmaDetailLabels;
  approveRmaAction: (input: { rmaId: string }) => Promise<{ ok: boolean; error?: string }>;
  receiveRmaAction: (input: { rmaId: string; lines: Array<{ lineId: string; quantityReceived: string }> }) => Promise<{ ok: boolean; error?: string }>;
  processRmaAction: (input: { rmaId: string; disposition: RmaDisposition }) => Promise<{ ok: boolean; error?: string }>;
  closeRmaAction: (input: { rmaId: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [receivedQty, setReceivedQty] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(rma.lines.map((l) => [l.id, l.quantityReceived || l.quantityExpected])),
  );

  async function runAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(labels.errors[result.error ?? ''] ?? labels.errors.persistence_failed);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="rma-detail-view">
      <Link href={`/${locale}/shipping/rma`} className="text-xs text-slate-500 hover:text-slate-800">
        ← {labels.backToList}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-xl font-semibold text-slate-950">{rma.rmaNumber}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {rma.customerName} · {labels.status[rma.status]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rma.status === 'pending' ? (
            <Button type="button" className="btn--primary btn-sm" disabled={pending} data-testid="rma-approve" onClick={() => void runAction(() => approveRmaAction({ rmaId: rma.id }))}>
              {pending ? labels.actions.pending : labels.actions.approve}
            </Button>
          ) : null}
          {rma.status === 'approved' || rma.status === 'receiving' ? (
            <Button
              type="button"
              className="btn--primary btn-sm"
              disabled={pending}
              data-testid="rma-receive"
              onClick={() =>
                void runAction(() =>
                  receiveRmaAction({
                    rmaId: rma.id,
                    lines: rma.lines.map((l) => ({ lineId: l.id, quantityReceived: receivedQty[l.id] ?? l.quantityExpected })),
                  }),
                )
              }
            >
              {pending ? labels.actions.pending : labels.actions.receive}
            </Button>
          ) : null}
          {rma.status === 'received' ? (
            <>
              <Button type="button" className="btn--ghost btn-sm" disabled={pending} onClick={() => void runAction(() => processRmaAction({ rmaId: rma.id, disposition: 'restock' }))}>
                {labels.actions.processRestock}
              </Button>
              <Button type="button" className="btn--ghost btn-sm" disabled={pending} onClick={() => void runAction(() => processRmaAction({ rmaId: rma.id, disposition: 'scrap' }))}>
                {labels.actions.processScrap}
              </Button>
              <Button type="button" className="btn--ghost btn-sm" disabled={pending} onClick={() => void runAction(() => processRmaAction({ rmaId: rma.id, disposition: 'quality_hold' }))}>
                {labels.actions.processQualityHold}
              </Button>
            </>
          ) : null}
          {rma.status === 'processed' ? (
            <Button type="button" className="btn--primary btn-sm" disabled={pending} data-testid="rma-close" onClick={() => void runAction(() => closeRmaAction({ rmaId: rma.id }))}>
              {pending ? labels.actions.pending : labels.actions.close}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" data-testid="rma-detail-error">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">{labels.summaryTitle}</h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">{labels.fields.customer}</dt><dd>{rma.customerName}</dd></div>
          <div><dt className="text-slate-500">{labels.fields.salesOrder}</dt><dd className="font-mono">{rma.salesOrderNumber ?? '—'}</dd></div>
          <div><dt className="text-slate-500">{labels.fields.reason}</dt><dd>{rma.reasonLabel ?? rma.reasonCode}</dd></div>
          <div><dt className="text-slate-500">{labels.fields.disposition}</dt><dd>{rma.disposition ? labels.disposition[rma.disposition] : labels.disposition.none}</dd></div>
          <div><dt className="text-slate-500">{labels.fields.totalValue}</dt><dd>{rma.totalValueGbp ?? '—'}</dd></div>
          <div><dt className="text-slate-500">{labels.fields.created}</dt><dd>{new Date(rma.createdAt).toLocaleString()}</dd></div>
          {rma.notes ? <div className="sm:col-span-2"><dt className="text-slate-500">{labels.fields.notes}</dt><dd>{rma.notes}</dd></div> : null}
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{labels.linesTitle}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="rma-lines-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.lineColumns.product}</th>
                <th className="px-3 py-2 text-right">{labels.lineColumns.expected}</th>
                <th className="px-3 py-2 text-right">{labels.lineColumns.received}</th>
                <th className="px-3 py-2">{labels.lineColumns.lot}</th>
                <th className="px-3 py-2">{labels.lineColumns.notes}</th>
              </tr>
            </thead>
            <tbody>
              {rma.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium">{line.productName ?? line.productCode ?? line.productId}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{line.quantityExpected}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {rma.status === 'approved' || rma.status === 'receiving' ? (
                      <input
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                        value={receivedQty[line.id] ?? ''}
                        onChange={(e) => setReceivedQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        data-testid={`rma-received-qty-${line.id}`}
                      />
                    ) : (
                      line.quantityReceived
                    )}
                  </td>
                  <td className="px-3 py-2">{line.lotNumber ?? '—'}</td>
                  <td className="px-3 py-2">{line.reasonNotes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
