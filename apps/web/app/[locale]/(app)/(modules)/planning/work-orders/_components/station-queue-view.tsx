'use client';

/**
 * P2-PLANNING — per-station (production line) work queue.
 *
 * Prototype parity: reuses the dense-table + status-badge + card chrome established
 * by wo-list-view.tsx / wo-detail-view.tsx (rounded-xl border-slate-200 tables, xs
 * uppercase tracking-wide slate-500 headers, border-t slate-100 rows, font-mono
 * tabular-nums numerics, @monopilot/ui Badge, WoStatusBadge). No new palette.
 *
 * A production line, opening its work, sees ONLY its own stage's WOs across chains:
 * demand qty, the upstream WIP input it needs + how much is already produced (real
 * produced_quantity on the upstream WO), the output target, and the line's
 * throughput_per_hour for that product×process so the station knows its rate.
 *
 * Availability caveat: the only stock signal here is upstream WIP produced_quantity
 * (real). Raw-material stock-on-hand is NOT surfaced — see the owner note.
 */

import React from 'react';
import Link from 'next/link';

import { Badge } from '@monopilot/ui/Badge';

import { WoStatusBadge } from './wo-status-badge';
import type { GetStationQueueResult, StationWorkOrder } from '../_actions/chain-preview';

export type StationLineOption = { id: string; code: string; name: string };

export type StationQueueLabels = {
  title: string;
  subtitle: string;
  linePicker: string;
  pickPrompt: string;
  empty: string;
  error: string;
  columns: {
    wo: string;
    product: string;
    demand: string;
    input: string;
    output: string;
    rate: string;
    status: string;
  };
  status: Record<string, string>;
  noInput: string;
  perHour: string;
  availableOf: string; // "{produced} / {required}"
};

const DEFAULT_LABELS: StationQueueLabels = {
  title: 'Station work queue',
  subtitle: 'Work orders scheduled on this production line, across every chain',
  linePicker: 'Production line',
  pickPrompt: 'Pick a production line to see its queue.',
  empty: 'No open work orders on this line.',
  error: 'Could not load the station queue.',
  columns: {
    wo: 'WO',
    product: 'Product',
    demand: 'Demand',
    input: 'Input needed',
    output: 'Output target',
    rate: 'Rate',
    status: 'Status',
  },
  status: {},
  noInput: '—',
  perHour: '/h',
  availableOf: '{produced} / {required}',
};

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function InputCell({ wo, labels }: { wo: StationWorkOrder; labels: StationQueueLabels }) {
  if (wo.inputs.length === 0) return <span className="text-slate-400">{labels.noInput}</span>;
  return (
    <div className="flex flex-col gap-1">
      {wo.inputs.map((input) => {
        const produced = input.producedQty == null ? 0 : Number(input.producedQty);
        const required = input.requiredQty == null ? null : Number(input.requiredQty);
        const short = required != null && produced < required;
        return (
          <div key={input.upstreamWoNumber} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-mono text-slate-700">{input.itemCode}</span>
            <span className={`font-mono tabular-nums ${short ? 'text-amber-700' : 'text-emerald-700'}`}>
              {labels.availableOf
                .replace('{produced}', input.producedQty ?? '0')
                .replace('{required}', input.requiredQty ?? '?')}{' '}
              {input.uom}
            </span>
            <Badge variant={short ? 'warning' : 'success'}>{input.upstreamWoNumber}</Badge>
          </div>
        );
      })}
    </div>
  );
}

function RateCell({ wo, labels }: { wo: StationWorkOrder; labels: StationQueueLabels }) {
  const withRate = wo.processes.filter((p) => p.throughputPerHour != null);
  if (withRate.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {withRate.map((p, i) => (
        <span key={`${p.name}-${i}`} className="font-mono text-xs tabular-nums text-slate-600">
          {fmtNum(p.throughputPerHour as number)} {p.throughputUom ?? ''}
          {labels.perHour}
        </span>
      ))}
    </div>
  );
}

export function StationQueueView({
  locale,
  lines,
  selectedLineId,
  queue,
  labels: override,
}: {
  locale: string;
  lines: StationLineOption[];
  selectedLineId: string | null;
  queue: GetStationQueueResult | null;
  labels?: Partial<StationQueueLabels>;
}) {
  const labels = { ...DEFAULT_LABELS, ...override, columns: { ...DEFAULT_LABELS.columns, ...override?.columns } };
  const basePath = `/${locale}/planning/work-orders/station`;
  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="station-queue-view"
      data-prototype-source="prototypes/design/Monopilot Design System/planning/wo-list.jsx:161-262"
    >
      {/* Line picker — links (server re-fetch per line, same idiom as the archive tab). */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={labels.linePicker}>
        <span className="text-xs uppercase tracking-wide text-slate-400">{labels.linePicker}</span>
        {lines.map((line) => (
          <Link
            key={line.id}
            href={`${basePath}?lineId=${line.id}`}
            prefetch={false}
            role="tab"
            aria-selected={line.id === selectedLineId}
            data-testid={`station-line-${line.id}`}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              line.id === selectedLineId ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className="font-mono">{line.code}</span> {line.name}
          </Link>
        ))}
      </div>

      {!selectedLineId || !queue ? (
        <div role="note" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          {labels.pickPrompt}
        </div>
      ) : !queue.ok ? (
        <div role="alert" data-testid="station-queue-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {labels.error}
        </div>
      ) : queue.workOrders.length === 0 ? (
        <div role="status" data-testid="station-queue-empty" className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
          {labels.empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="station-queue-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.wo}</th>
                <th className="px-3 py-2">{labels.columns.product}</th>
                <th className="px-3 py-2 text-right">{labels.columns.demand}</th>
                <th className="px-3 py-2">{labels.columns.input}</th>
                <th className="px-3 py-2 text-right">{labels.columns.output}</th>
                <th className="px-3 py-2">{labels.columns.rate}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {queue.workOrders.map((wo) => (
                <tr key={wo.id} data-testid={`station-wo-${wo.id}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link
                      href={`/${locale}/planning/work-orders/${wo.id}`}
                      prefetch={false}
                      className="font-mono font-semibold text-blue-700 hover:underline"
                    >
                      {wo.woNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-slate-600">{wo.itemCode ?? '—'}</span>
                    {wo.itemName ? <span className="ml-2 text-xs text-slate-500">{wo.itemName}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {wo.demandQty} {wo.uom}
                  </td>
                  <td className="px-3 py-2">
                    <InputCell wo={wo} labels={labels} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-800">
                    {wo.demandQty} {wo.uom}
                  </td>
                  <td className="px-3 py-2">
                    <RateCell wo={wo} labels={labels} />
                  </td>
                  <td className="px-3 py-2">
                    <WoStatusBadge status={wo.status} label={statusLabel(wo.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
