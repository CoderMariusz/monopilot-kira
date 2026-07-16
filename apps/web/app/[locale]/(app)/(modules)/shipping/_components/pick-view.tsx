'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import Input from '@monopilot/ui/Input';
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
    qtyLabel: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    reassignLabel: string;
    reassignPlaceholder: string;
    reassign: string;
    reassignPending: string;
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
  reassignPickLineAction,
}: {
  pickList: PickListDetail;
  labels: PickViewLabels;
  canPick: boolean;
  pickLineAction: (
    lineId: string,
    input: { quantityPicked: string; shortPickReason?: string },
  ) => Promise<PickLineResult>;
  reassignPickLineAction: (lineId: string, licensePlateId: string) => Promise<PickLineResult>;
}) {
  const router = useRouter();
  const [pendingLineId, setPendingLineId] = React.useState<string | null>(null);
  const [reassignLineId, setReassignLineId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [reassignCodes, setReassignCodes] = React.useState<Record<string, string>>({});

  async function onPickLine(lineId: string, quantityToPick: string) {
    if (pendingLineId) return;
    const quantityPicked = (quantities[lineId] ?? quantityToPick).trim();
    const shortPickReason = reasons[lineId]?.trim();
    setPendingLineId(lineId);
    setError(null);
    try {
      const result = await pickLineAction(lineId, {
        quantityPicked,
        ...(shortPickReason ? { shortPickReason } : {}),
      });
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

  async function onReassignLine(lineId: string) {
    if (reassignLineId) return;
    const licensePlateId = reassignCodes[lineId]?.trim();
    if (!licensePlateId) {
      setError(labels.errors.invalid_input);
      return;
    }
    setReassignLineId(lineId);
    setError(null);
    try {
      const result = await reassignPickLineAction(lineId, licensePlateId);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setReassignLineId(null);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setReassignLineId(null);
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
                const isReassignPending = reassignLineId === line.id;
                const canPickLine = canPick && line.status === 'pending' && !line.needsReassign;
                const canReassignLine = canPick && line.status === 'pending' && line.needsReassign;
                return (
                  <tr key={line.id} data-testid={`pick-line-${line.id}`} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{line.lineNo ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{line.itemName ?? '—'}</div>
                      <div className="font-mono text-xs text-slate-500">{line.itemCode ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{line.licensePlateCode ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.quantityToPick}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.quantityPicked}</td>
                    <td className="px-3 py-2">{labels.lineStatus[line.status] ?? line.status}</td>
                    <td className="px-3 py-2">
                      {canPickLine ? (
                        <div className="flex min-w-[220px] flex-col gap-2">
                          <Input
                            data-testid={`pick-line-qty-${line.id}`}
                            value={quantities[line.id] ?? line.quantityToPick}
                            disabled={isPending}
                            aria-label={labels.lines.qtyLabel}
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          />
                          <Input
                            data-testid={`pick-line-reason-${line.id}`}
                            value={reasons[line.id] ?? ''}
                            disabled={isPending}
                            placeholder={labels.lines.reasonPlaceholder}
                            aria-label={labels.lines.reasonLabel}
                            onChange={(e) => setReasons((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          />
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
                        </div>
                      ) : null}
                      {canReassignLine ? (
                        <div className="flex min-w-[220px] flex-col gap-2">
                          <Input
                            data-testid={`pick-line-reassign-${line.id}`}
                            value={reassignCodes[line.id] ?? ''}
                            disabled={isReassignPending}
                            placeholder={labels.lines.reassignPlaceholder}
                            aria-label={labels.lines.reassignLabel}
                            onChange={(e) => setReassignCodes((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          />
                          <Button
                            type="button"
                            className="btn--secondary btn-sm"
                            data-testid={`pick-line-reassign-action-${line.id}`}
                            disabled={isReassignPending}
                            aria-busy={isReassignPending}
                            onClick={() => void onReassignLine(line.id)}
                          >
                            {isReassignPending ? labels.lines.reassignPending : labels.lines.reassign}
                          </Button>
                        </div>
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
