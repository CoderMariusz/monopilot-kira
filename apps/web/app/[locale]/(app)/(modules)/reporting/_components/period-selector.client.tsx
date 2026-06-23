'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@monopilot/ui/Select';

import type { ReportingLineOption, ReportingPeriod } from '../shared';

export type PeriodSelectorLabels = {
  today: string;
  week: string;
  month: string;
  last7d: string;
  last30d: string;
  custom: string;
  line: string;
  search: string;
};

export type PeriodSelectorProps = {
  period: ReportingPeriod;
  fromDate: string;
  toDate: string;
  lineId?: string;
  orderQuery?: string;
  lines: ReportingLineOption[];
  labels: PeriodSelectorLabels;
};

const PERIOD_BUTTONS: Array<{ value: ReportingPeriod; labelKey: keyof PeriodSelectorLabels }> = [
  { value: 'today', labelKey: 'today' },
  { value: 'week', labelKey: 'week' },
  { value: 'month', labelKey: 'month' },
  { value: '7d', labelKey: 'last7d' },
  { value: '30d', labelKey: 'last30d' },
  { value: 'custom', labelKey: 'custom' },
];

function lineOptionLabel(line: ReportingLineOption): string {
  return `${line.code} - ${line.name}`;
}

export function PeriodSelector({
  period,
  fromDate,
  toDate,
  lineId,
  orderQuery,
  lines,
  labels,
}: PeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = React.useState(orderQuery ?? '');

  React.useEffect(() => {
    setQueryDraft(orderQuery ?? '');
  }, [orderQuery]);

  const pushParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const setPeriod = (nextPeriod: ReportingPeriod) => {
    pushParams({
      period: nextPeriod === '7d' ? null : nextPeriod,
      from: nextPeriod === 'custom' ? fromDate : null,
      to: nextPeriod === 'custom' ? toDate : null,
    });
  };

  const lineOptions = React.useMemo(
    () => [
      { value: 'all', label: `All ${labels.line.toLowerCase()}` },
      ...lines.map((line) => ({ value: line.id, label: lineOptionLabel(line) })),
    ],
    [labels.line, lines],
  );

  return (
    <section
      aria-label="Reporting filters"
      data-testid="reporting-period-selector"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Reporting period">
          {PERIOD_BUTTONS.map((item) => {
            const active = period === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => setPeriod(item.value)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {labels[item.labelKey]}
              </button>
            );
          })}
        </div>

        {period === 'custom' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(event) => pushParams({ period: 'custom', from: event.currentTarget.value })}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
              <input
                type="date"
                value={toDate}
                onChange={(event) => pushParams({ period: 'custom', to: event.currentTarget.value })}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_minmax(260px,1fr)]">
          <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>{labels.line}</span>
            <Select
              value={lineId ?? 'all'}
              options={lineOptions}
              onValueChange={(value) => pushParams({ line: value === 'all' ? null : value })}
              aria-label={labels.line}
            />
          </div>

          <form
            className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
            onSubmit={(event) => {
              event.preventDefault();
              pushParams({ q: queryDraft.trim() || null });
            }}
          >
            <span>{labels.search}</span>
            <div className="flex gap-2">
              <input
                type="search"
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.currentTarget.value)}
                placeholder={labels.search}
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-medium text-white"
              >
                {labels.search}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
