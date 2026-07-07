'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../lib/shared/list-pagination-footer';
import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../lib/shared/download';
import type { CompletedWoCostsSummary } from '../_actions/wo-cost-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

export type FinanceWoCostLabels = {
  title: string;
  subtitle: string;
  refresh: string;
  refreshing: string;
  permissionDenied: string;
  empty: string;
  error: string;
  loading: string;
  notAvailable: string;
  columns: {
    wo: string;
    product: string;
    outputKg: string;
    materials: string;
    labor: string;
    total: string;
    costPerKg: string;
  };
  breakdown: {
    title: string;
    item: string;
    qtyKg: string;
    costPerKg: string;
    cost: string;
    noLabor: string;
    setup: string;
    machine: string;
    waste: string;
  };
  pagination: ListPaginationLabels;
};

export type FinanceWoCostTableProps = {
  result:
    | { state: 'ready'; summary: CompletedWoCostsSummary }
    | { state: 'permission-denied' }
    | { state: 'error' }
    | { state: 'loading' };
  labels: FinanceWoCostLabels;
};

const PERIOD_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 365 days' },
];

const CONTROL_LABELS = {
  periodAriaLabel: 'WO cost period',
  exportCsv: 'Export CSV',
};

function money(value: string | null, fallback: string): string {
  return value == null ? fallback : value;
}

export function FinanceWoCostTable({ result, labels }: FinanceWoCostTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (result.state === 'loading') {
    return (
      <div data-testid="finance-loading" aria-busy="true" className="space-y-3">
        <div className="h-10 animate-pulse rounded bg-slate-100" />
        <div className="h-64 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (result.state === 'permission-denied') {
    return (
      <div role="note" data-testid="finance-denied" className="rounded border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        {labels.permissionDenied}
      </div>
    );
  }

  if (result.state === 'error') {
    return (
      <div role="alert" data-testid="finance-error" className="rounded border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }

  const rows = result.summary.rows;
  const pagination = result.summary.pagination;
  const currentWindow = String(result.summary.days);
  const shown = pagination.offset + rows.length;

  const pageHref = (page: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const setWindow = (nextValue: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextValue === '30') next.delete('days');
    else next.set('days', nextValue);
    next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleExportCsv = () => {
    try {
      const csv = toCsv(
        [
          'completedAt',
          'woId',
          'woNumber',
          'product',
          'outputKg',
          'materials',
          'materialsTotal',
          'labor',
          'downtimeCost',
          'machineCost',
          'setupCost',
          'wasteCost',
          'totalCost',
          'costPerKgOutput',
          'processResolution',
        ],
        rows.map((row) => [
          row.completedAt,
          row.woId,
          row.woNumber,
          JSON.stringify(row.product),
          row.outputKg,
          JSON.stringify(row.materials),
          row.materialsTotal,
          row.labor == null ? null : JSON.stringify(row.labor),
          row.downtimeCost,
          row.machineCost,
          row.setupCost,
          row.wasteCost,
          row.totalCost,
          row.costPerKgOutput,
          JSON.stringify(row.processResolution),
        ]),
      );
      downloadCsv(csv, `finance-wo-costs-${result.summary.days}d-${isoDateStamp()}.csv`);
    } catch (error) {
      console.error('[finance] export WO costs CSV failed', error);
    }
  };

  return (
    <section data-testid="finance-wo-costs" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{labels.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={currentWindow}
            onValueChange={setWindow}
            options={PERIOD_OPTIONS}
            className="min-w-40"
          >
            <SelectTrigger aria-label={CONTROL_LABELS.periodAriaLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            data-testid="finance-export-csv"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
            disabled={rows.length === 0}
            onClick={handleExportCsv}
          >
            {CONTROL_LABELS.exportCsv}
          </button>
          <button
            type="button"
            data-testid="finance-refresh"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
            disabled={isPending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {isPending ? labels.refreshing : labels.refresh}
          </button>
        </div>
      </div>

      {isPending ? (
        <div data-testid="finance-optimistic" className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {labels.refreshing}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div data-testid="finance-empty" className="rounded border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          {labels.empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{labels.columns.wo}</th>
                <th className="px-4 py-3">{labels.columns.product}</th>
                <th className="px-4 py-3 text-right">{labels.columns.outputKg}</th>
                <th className="px-4 py-3 text-right">{labels.columns.materials}</th>
                <th className="px-4 py-3 text-right">{labels.columns.labor}</th>
                <th className="px-4 py-3 text-right">{labels.columns.total}</th>
                <th className="px-4 py-3 text-right">{labels.columns.costPerKg}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.woId} className="align-top">
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer font-mono text-xs font-semibold text-slate-950">
                        {row.woNumber}
                      </summary>
                      <div data-testid={`finance-breakdown-${row.woId}`} className="mt-3 min-w-[28rem] rounded border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{labels.breakdown.title}</div>
                        {row.materials.length === 0 ? (
                          <div className="text-xs text-slate-500">{labels.empty}</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-left text-slate-500">
                              <tr>
                                <th className="py-1">{labels.breakdown.item}</th>
                                <th className="py-1 text-right">{labels.breakdown.qtyKg}</th>
                                <th className="py-1 text-right">{labels.breakdown.costPerKg}</th>
                                <th className="py-1 text-right">{labels.breakdown.cost}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.materials.map((material) => (
                                <tr key={`${row.woId}-${material.itemCode}`}>
                                  <td className="py-1 font-mono">{material.itemCode}</td>
                                  <td className="py-1 text-right font-mono">{material.qtyKg}</td>
                                  <td className="py-1 text-right font-mono">{material.costPerKg}</td>
                                  <td className="py-1 text-right font-mono">{material.cost}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <dt className="text-slate-500">{labels.breakdown.setup}</dt>
                            <dd className="font-mono text-slate-900">{row.setupCost}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">{labels.breakdown.machine}</dt>
                            <dd className="font-mono text-slate-900">{row.machineCost}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">{labels.breakdown.waste}</dt>
                            <dd className="font-mono text-slate-900">{row.wasteCost}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Downtime cost</dt>
                            <dd className="font-mono text-slate-900">{row.downtimeCost}</dd>
                          </div>
                        </dl>
                      </div>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.product.itemCode ?? row.product.name ?? labels.notAvailable}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.outputKg}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.materialsTotal}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.labor?.cost ?? labels.breakdown.noLabor}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{row.totalCost}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(row.costPerKgOutput, labels.notAvailable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListPaginationFooter
            shown={shown}
            total={pagination.total}
            previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
            nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
            labels={labels.pagination}
            testId="finance-wo-costs-pagination"
          />
        </div>
      )}
    </section>
  );
}
