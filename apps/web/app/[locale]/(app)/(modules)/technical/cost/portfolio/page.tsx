'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { listPortfolioCost } from './_actions/list-portfolio-cost';

type PortfolioCostResult = {
  fg_code: string;
  fg_name: string;
  total_recipe_cost: number | null;
  currency: string;
};

type SortKey = 'fg_code' | 'fg_name' | 'total_recipe_cost' | 'currency';

function sortRows(rows: PortfolioCostResult[], key: SortKey, direction: 'asc' | 'desc') {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const result = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return direction === 'asc' ? result : -result;
  });
}

export default function TechnicalPortfolioCostPage() {
  const [rows, setRows] = useState<PortfolioCostResult[]>([]);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('fg_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        setRows(await listPortfolioCost());
      } catch (err) {
        console.error('[technical/cost/portfolio] client_load_failed', err);
        setRows([]);
        setError(true);
      }
    });
  }, []);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDirection), [rows, sortDirection, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  }

  return (
    <main data-screen="technical-portfolio-cost" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        Technical / Cost / Portfolio
      </nav>

      <header>
        <h1 className="page-title">Portfolio cost roll-up</h1>
        <p className="helper mt-1 max-w-3xl">Read-only material cost roll-up for every FG in the current org.</p>
      </header>

      <section className="rounded border border-slate-200 bg-white p-4">
        {error ? (
          <div role="alert" className="alert alert-red" data-testid="portfolio-cost-error">
            <div className="alert-title">Could not load portfolio costs.</div>
          </div>
        ) : pending ? (
          <div aria-busy="true" data-testid="portfolio-cost-loading" className="h-56 animate-pulse rounded bg-slate-100" />
        ) : sorted.length === 0 ? (
          <div className="empty-state" data-testid="portfolio-cost-empty">
            <div className="empty-state-title">No FG items found</div>
            <div className="empty-state-body">There are no FG items in this org.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="portfolio-cost-table">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  {[
                    ['fg_code', 'FG code'],
                    ['fg_name', 'FG name'],
                    ['total_recipe_cost', 'Total recipe cost'],
                    ['currency', 'Currency'],
                  ].map(([key, label]) => (
                    <th key={key} className="px-3 py-2">
                      <button type="button" className="font-semibold" onClick={() => toggleSort(key as SortKey)}>
                        {label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.fg_code} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono">{row.fg_code}</td>
                    <td className="px-3 py-2">{row.fg_name || 'N/A'}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.total_recipe_cost == null ? '—' : row.total_recipe_cost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{row.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
