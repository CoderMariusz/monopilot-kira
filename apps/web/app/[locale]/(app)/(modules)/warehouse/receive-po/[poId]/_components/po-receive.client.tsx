'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { DesktopReceiveInput, DesktopReceiveResult, PoReceiveDetail, PoReceiveLine } from '../../../_actions/receive-po-line.types';

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ReceiveLocationOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
};

export type PoReceiveLabels = {
  linesTitle: string;
  emptyLines: string;
  col: {
    line: string;
    item: string;
    ordered: string;
    received: string;
    outstanding: string;
    status: string;
    action: string;
  };
  status: Record<string, string>;
  form: {
    qty: string;
    qtyHelp: string;
    batch: string;
    batchPlaceholder: string;
    bestBefore: string;
    location: string;
    locationPlaceholder: string;
    receive: string;
    receiving: string;
    overConfirm: string;
    success: string;
    overNote: string;
    qcNote: string;
  };
  errors: Record<string, string>;
};

function outstandingQty(ordered: string, received: string): string {
  const rem = Number(ordered) - Number(received);
  if (!(rem > 0)) return '0';
  return String(Number(rem.toFixed(3)));
}

function lineReceiptStatus(ordered: string, received: string): 'open' | 'partial' | 'full' | 'over' {
  const o = Number(ordered);
  const r = Number(received);
  if (!(r > 0)) return 'open';
  if (r > o) return 'over';
  if (r >= o) return 'full';
  return 'partial';
}

export function PoReceiveClient({
  po,
  labels,
  locations,
  receivePoLineAction,
}: {
  po: PoReceiveDetail;
  labels: PoReceiveLabels;
  locations: ReceiveLocationOption[];
  receivePoLineAction: (input: DesktopReceiveInput) => Promise<DesktopReceiveResult>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [bestBefore, setBestBefore] = useState('');
  const [locationId, setLocationId] = useState('');
  const [overConfirm, setOverConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const openLines = useMemo(
    () => po.lines.filter((line: PoReceiveLine) => lineReceiptStatus(line.orderedQty, line.receivedQty) !== 'full'),
    [po.lines],
  );

  const locationOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: labels.form.locationPlaceholder },
      ...locations.map((l) => ({
        value: l.id,
        label: l.warehouseCode || l.warehouseName ? `${l.warehouseCode ?? l.warehouseName} · ${l.code}` : l.code,
      })),
    ],
    [locations, labels.form.locationPlaceholder],
  );

  const activeLine = po.lines.find((l) => l.id === activeLineId) ?? null;

  function openLine(lineId: string) {
    const line = po.lines.find((l) => l.id === lineId);
    if (!line) return;
    setActiveLineId(lineId);
    setQty(outstandingQty(line.orderedQty, line.receivedQty));
    setBatch('');
    setBestBefore('');
    setLocationId('');
    setOverConfirm(false);
    setFormError(null);
    setSuccess(null);
  }

  const wouldOverReceive =
    activeLine != null && Number(qty || '0') > Number(outstandingQty(activeLine.orderedQty, activeLine.receivedQty));

  async function submitLine(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLine) return;
    setFormError(null);
    setSuccess(null);

    const trimmedQty = qty.trim();
    if (!QTY_PATTERN.test(trimmedQty) || Number(trimmedQty) <= 0) {
      setFormError(labels.errors.qtyRequired);
      return;
    }
    const trimmedBest = bestBefore.trim();
    if (trimmedBest && !DATE_PATTERN.test(trimmedBest)) {
      setFormError(labels.errors.invalid_qty);
      return;
    }
    if (wouldOverReceive && !overConfirm) {
      setFormError(labels.errors.over_receive_confirm_required);
      return;
    }

    setPending(true);
    try {
      const result = await receivePoLineAction({
        poLineId: activeLine.id,
        qty: trimmedQty,
        batchNumber: batch.trim() ? batch.trim() : null,
        bestBefore: trimmedBest ? trimmedBest : null,
        toLocationId: locationId ? locationId : null,
        confirmOverReceive: overConfirm,
      });

      if (!result.ok) {
        setFormError(labels.errors[result.error] ?? labels.errors.error);
        setPending(false);
        return;
      }

      const parts = [
        labels.form.success
          .replace('{grn}', result.grnNumber)
          .replace('{lp}', result.lpNumber)
          .replace('{qty}', result.qty)
          .replace('{uom}', result.uom),
      ];
      if (result.overReceived) parts.push(labels.form.overNote);
      if (result.qcInspectionRequired) parts.push(labels.form.qcNote);
      setSuccess(parts.join(' '));
      startTransition(() => router.refresh());
    } catch {
      setFormError(labels.errors.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="warehouse-po-receive">
      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {labels.linesTitle.replace('{count}', String(openLines.length))}
          </h2>
        </div>
        {openLines.length === 0 ? (
          <p data-testid="po-receive-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.emptyLines}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.col.line}</TableHead>
                <TableHead>{labels.col.item}</TableHead>
                <TableHead className="text-right">{labels.col.ordered}</TableHead>
                <TableHead className="text-right">{labels.col.received}</TableHead>
                <TableHead className="text-right">{labels.col.outstanding}</TableHead>
                <TableHead>{labels.col.status}</TableHead>
                <TableHead className="text-right">{labels.col.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((line) => {
                const outstanding = outstandingQty(line.orderedQty, line.receivedQty);
                const status = lineReceiptStatus(line.orderedQty, line.receivedQty);
                return (
                  <TableRow key={line.id} data-testid={`po-receive-line-${line.id}`}>
                    <TableCell className="font-mono text-xs">{line.lineNo}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-sm text-sky-700">{line.itemCode ?? '—'}</span>
                        <span className="text-sm text-slate-800">{line.itemName ?? '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {line.orderedQty} {line.uom}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {line.receivedQty} {line.uom}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-slate-700">
                      {outstanding} {line.uom}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={status === 'over' ? 'danger' : status === 'full' ? 'success' : status === 'partial' ? 'warning' : 'muted'}
                        data-testid={`po-receive-status-${line.id}`}
                      >
                        {labels.status[status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {status === 'full' ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <Button
                          type="button"
                          data-testid={`po-receive-open-${line.id}`}
                          onClick={() => openLine(line.id)}
                        >
                          {labels.form.receive}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {activeLine ? (
        <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="po-receive-form-card">
          <form onSubmit={submitLine} className="flex flex-col gap-4" data-testid="po-receive-form">
            <p className="text-sm text-slate-700">
              <span className="font-mono font-semibold text-sky-700">{activeLine.itemCode ?? '—'}</span>{' '}
              {activeLine.itemName ?? '—'}
            </p>

            {formError ? (
              <div role="alert" data-testid="po-receive-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            ) : null}
            {success ? (
              <div role="status" data-testid="po-receive-success" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            {!success ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">{labels.form.qty}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={qty}
                    data-testid="po-receive-qty"
                    onChange={(e) => setQty(e.target.value)}
                    aria-label={labels.form.qty}
                  />
                  <span className="text-xs text-slate-500">
                    {labels.form.qtyHelp
                      .replace('{ordered}', `${activeLine.orderedQty} ${activeLine.uom}`)
                      .replace('{received}', `${activeLine.receivedQty} ${activeLine.uom}`)
                      .replace('{outstanding}', `${outstandingQty(activeLine.orderedQty, activeLine.receivedQty)} ${activeLine.uom}`)}
                  </span>
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">{labels.form.batch}</span>
                    <Input
                      type="text"
                      value={batch}
                      data-testid="po-receive-batch"
                      placeholder={labels.form.batchPlaceholder}
                      onChange={(e) => setBatch(e.target.value)}
                      aria-label={labels.form.batch}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">{labels.form.bestBefore}</span>
                    <Input
                      type="date"
                      value={bestBefore}
                      data-testid="po-receive-best-before"
                      onChange={(e) => setBestBefore(e.target.value)}
                      aria-label={labels.form.bestBefore}
                    />
                  </label>
                </div>

                {locations.length > 0 ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">{labels.form.location}</span>
                    <Select
                      value={locationId}
                      onValueChange={setLocationId}
                      options={locationOptions}
                      placeholder={labels.form.locationPlaceholder}
                      aria-label={labels.form.location}
                    />
                  </label>
                ) : null}

                {wouldOverReceive ? (
                  <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <input
                      type="checkbox"
                      checked={overConfirm}
                      data-testid="po-receive-over-confirm"
                      onChange={(e) => setOverConfirm(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{labels.form.overConfirm}</span>
                  </label>
                ) : null}

                <div className="flex justify-end">
                  <Button type="submit" data-testid="po-receive-submit" disabled={pending} aria-busy={pending}>
                    {pending ? labels.form.receiving : labels.form.receive}
                  </Button>
                </div>
              </>
            ) : null}
          </form>
        </Card>
      ) : null}
    </div>
  );
}
