'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import type { PickListDetail } from '../_actions/pick-actions-types';

export type PickViewLabels = {
  title: string;
  pickList: string;
  salesOrder: string;
  status: string;
  lines: {
    title: string;
    seq: string;
    item: string;
    licensePlate: string;
    qtyToPick: string;
    qtyPicked: string;
    status: string;
    pick: string;
    pending: string;
    empty: string;
  };
  lineStatus: Record<string, string>;
  errors: Record<string, string>;
};

export type PickLineResult = { ok: true } | { ok: false; error: string };

export function PickView({
  pickList,
  labels,
  canPick,
  pickLineAction,
}: {
  pickList: PickListDetail;
  labels: PickViewLabels;
  canPick: boolean;
  pickLineAction: (lineId: string, quantityPicked: string) => Promise<PickLineResult>;
}) {
  const router = useRouter();
  const [pendingLineId, setPendingLineId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onPickLine(lineId: string, quantityToPick: string) {
    if (pendingLineId) return;
    setPendingLineId(lineId);
    setError(null);
    try {
      const result = await pickLineAction(lineId, quantityToPick);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPendingLineId(null);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPendingLineId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="pick-view">
      <div className="rounded-xl border border-slate-200 p-4" data-testid="pick-summary">
        <div className="mb-3 text-sm font-semibold text-slate-700">{labels.title}</div>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{labels.pickList}</dt>
            <dd className="font-mono text-slate-800">{pickList.pickListNumber}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{labels.salesOrder}</dt>
            <dd className="font-mono text-slate-800">{pickList.salesOrderNumber}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{labels.status}</dt>
            <dd className="text-slate-800">{pickList.status}</dd>
          </div>
        </dl>
      </div>

      {error ? (
        <div role="alert" data-testid="pick-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          {labels.lines.title}
        </div>
        {pickList.lines.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">{labels.lines.empty}</div>
        ) : (
          <table className="w-full text-sm" data-testid="pick-lines-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.lines.seq}</th>
                <th className="px-3 py-2">{labels.lines.item}</th>
                <th className="px-3 py-2">{labels.lines.licensePlate}</th>
                <th className="px-3 py-2 text-right">{labels.lines.qtyToPick}</th>
                <th className="px-3 py-2 text-right">{labels.lines.qtyPicked}</th>
                <th className="px-3 py-2">{labels.lines.status}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pickList.lines.map((line) => {
                const isPending = pendingLineId === line.id;
                const canPickLine = canPick && line.status === 'pending';
                return (
                  <tr key={line.id} data-testid={`pick-line-${line.id}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{line.lineNo ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{line.itemName ?? '—'}</div>
                      <div className="font-mono text-xs text-slate-500">{line.itemCode ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{line.licensePlateCode ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.quantityToPick}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.quantityPicked}</td>
                    <td className="px-3 py-2">{labels.lineStatus[line.status] ?? line.status}</td>
                    <td className="px-3 py-2 text-right">
                      {canPickLine ? (
                        <Button
                          type="button"
                          className="btn--secondary btn-sm"
                          data-testid={`pick-line-action-${line.id}`}
                          disabled={isPending}
                          aria-busy={isPending}
                          onClick={() => void onPickLine(line.id, line.quantityToPick)}
                        >
                          {isPending ? labels.lines.pending : labels.lines.pick}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
