'use client';

import { useMemo, useState } from 'react';

export type CostingRollupTableRow = {
  projectCode: string;
  name: string;
  totalCost: number;
  targetPrice: number;
  margin: number;
};

type SortKey = keyof CostingRollupTableRow;
type SortDir = 'asc' | 'desc';

type Column = {
  key: SortKey;
  label: string;
  align?: 'left' | 'right';
  format?: (value: CostingRollupTableRow[SortKey]) => string;
};

const COLUMNS: Column[] = [
  { key: 'projectCode', label: 'Project Code' },
  { key: 'name', label: 'Name' },
  { key: 'totalCost', label: 'Total Cost', align: 'right', format: formatMoney },
  { key: 'targetPrice', label: 'Target Price', align: 'right', format: formatMoney },
  { key: 'margin', label: 'Margin %', align: 'right', format: formatPercent },
];

export function RollupTable({ rows }: { rows: CostingRollupTableRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'projectCode', dir: 'asc' });

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const result = compareValues(a[sort.key], b[sort.key]);
      return sort.dir === 'asc' ? result : -result;
    });
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc',
    }));
  }

  if (rows.length === 0) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center"
        aria-label="Costing roll-up empty state"
      >
        <h2 className="text-sm font-semibold text-slate-900">No costing roll-up data yet</h2>
        <p className="mt-1 text-sm text-slate-500">
          Target scenario costing appears here once projects have computed costing breakdowns.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Costing roll-up">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase text-slate-600 ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`inline-flex items-center gap-1 rounded-sm text-xs font-semibold uppercase text-slate-600 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                        column.align === 'right' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{column.label}</span>
                      <span aria-hidden="true" className="text-[10px] leading-none text-slate-400">
                        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedRows.map((row) => (
              <tr key={row.projectCode} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-slate-900">
                  {row.projectCode}
                </td>
                <td className="min-w-56 px-4 py-3 text-slate-900">{row.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-slate-700">
                  {formatMoney(row.totalCost)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-slate-700">
                  {formatMoney(row.targetPrice)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-slate-900">
                  {formatPercent(row.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function formatMoney(value: string | number): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return numeric.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: string | number): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${numeric.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
