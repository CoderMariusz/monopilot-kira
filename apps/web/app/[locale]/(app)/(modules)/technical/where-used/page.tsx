'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';

import Input from '@monopilot/ui/Input';

import { listWhereUsed } from './_actions/list-where-used';

type WhereUsedResult = {
  fg_code: string;
  fg_name: string;
  component_qty: number;
  component_uom: string;
};

type SortKey = 'fg_code' | 'fg_name' | 'component_qty' | 'component_uom';

function sortRows(rows: WhereUsedResult[], key: SortKey, direction: 'asc' | 'desc') {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const result = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return direction === 'asc' ? result : -result;
  });
}

export default function TechnicalWhereUsedPage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const [code, setCode] = useState(initialCode);
  const [rows, setRows] = useState<WhereUsedResult[]>([]);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('fg_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCode(initialCode);
    setError(false);
    if (!initialCode.trim()) {
      setRows([]);
      return;
    }
    startTransition(async () => {
      try {
        setRows(await listWhereUsed(initialCode));
      } catch (err) {
        console.error('[technical/where-used] client_load_failed', err);
        setRows([]);
        setError(true);
      }
    });
  }, [initialCode]);

  const filtered = useMemo(() => {
    const q = code.trim().toLowerCase();
    const base = q
      ? rows.filter((row) =>
          [row.fg_code, row.fg_name, row.component_uom].some((value) => value.toLowerCase().includes(q)),
        )
      : rows;
    return sortRows(base, sortKey, sortDirection);
  }, [code, rows, sortDirection, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  }

  return (
    <main data-screen="technical-where-used" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        Technical / Where used
      </nav>

      <header>
        <h1 className="page-title">Where used</h1>
        <p className="helper mt-1 max-w-3xl">Find every FG BOM that uses an ingredient or item code as a component.</p>
      </header>

      <section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4">
        <label className="flex max-w-md flex-col gap-1 text-sm font-medium">
          Ingredient or item code
          <Input
            type="search"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Filter loaded results"
          />
        </label>

        {!initialCode.trim() ? (
          <div className="empty-state" data-testid="where-used-empty-query">
            <div className="empty-state-title">Enter a code in the URL</div>
            <div className="empty-state-body">Use ?code=RM-1001 to load where-used results.</div>
          </div>
        ) : error ? (
          <div role="alert" className="alert alert-red" data-testid="where-used-error">
            <div className="alert-title">Could not load where-used results.</div>
          </div>
        ) : pending ? (
          <div aria-busy="true" data-testid="where-used-loading" className="h-44 animate-pulse rounded bg-slate-100" />
        ) : filtered.length === 0 ? (
          <div className="empty-state" data-testid="where-used-empty">
            <div className="empty-state-title">No FG usage found</div>
            <div className="empty-state-body">No loaded BOM uses this component code.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="where-used-table">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  {[
                    ['fg_code', 'FG code'],
                    ['fg_name', 'FG name'],
                    ['component_qty', 'Component quantity'],
                    ['component_uom', 'UoM'],
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
                {filtered.map((row) => (
                  <tr key={`${row.fg_code}-${row.component_uom}`} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono">{row.fg_code}</td>
                    <td className="px-3 py-2">{row.fg_name || 'N/A'}</td>
                    <td className="px-3 py-2 tabular-nums">{row.component_qty}</td>
                    <td className="px-3 py-2">{row.component_uom}</td>
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
