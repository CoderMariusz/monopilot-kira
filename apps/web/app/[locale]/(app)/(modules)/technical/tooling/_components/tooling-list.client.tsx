'use client';

/**
 * 03-technical · TEC-087 Tooling / Equipment Setup List (T-053) — client island.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:314-352
 *   (`tooling_screen`, list-with-actions) — PageHeader + filter pills + a table
 *   (Code / Name / Type / ... / Updated / Status). Translated to shadcn
 *   primitives (Badge / Table / Button / Input). The "Type" column maps to the
 *   resource kind (machine / line) per the prototype index translation note
 *   ("Type badge → from enum"). The prototype's red "stock < min" reorder logic
 *   has no equivalent in routing-derived data, so Status maps to the owning
 *   routing's lifecycle (draft / approved / active / superseded) — a real derived
 *   field, never invented.
 *
 * Read-only surface (prototype index: interaction = read-only). The Create CTA is
 * a navigation to the routings authoring surface (where setups are actually
 * created as operations), gated on the real `technical.bom.create` permission —
 * the page passes `canWrite`. NUMERIC cost-per-hour is rendered verbatim.
 *
 * The five UI states (loading / empty / error / permission-denied / populated)
 * are handled by the owning Server Component page; this island renders the
 * populated list + the client-side filter/search interaction (no CLS, no
 * client-trusted mutation).
 */

import React from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { ToolingSetupRow } from '../_actions/shared';

export type ToolingListLabels = {
  searchPlaceholder: string;
  createCta: string;
  filterAll: string;
  filterMachine: string;
  filterLine: string;
  colCode: string;
  colName: string;
  colType: string;
  colResource: string;
  colItem: string;
  colSetup: string;
  colCostPerHour: string;
  colUpdated: string;
  colStatus: string;
  noMatches: string;
  typeMachine: string;
  typeLine: string;
  setupUnit: string;
};

type Filter = 'all' | 'machine' | 'line';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  approved: 'info',
  active: 'success',
  superseded: 'warning',
};

function formatCostPerHour(value: string | null): string {
  if (value === null) return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(4) : '—';
}

function formatUpdated(updatedAt: string): string {
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export function ToolingList({
  setups,
  canWrite,
  routingsHref,
  labels,
}: {
  setups: ToolingSetupRow[];
  canWrite: boolean;
  routingsHref: string;
  labels: ToolingListLabels;
}) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');

  const counts = React.useMemo(
    () => ({
      all: setups.length,
      machine: setups.filter((s) => s.resourceKind === 'machine').length,
      line: setups.filter((s) => s.resourceKind === 'line').length,
    }),
    [setups],
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return setups.filter((s) => {
      if (filter !== 'all' && s.resourceKind !== filter) return false;
      if (!q) return true;
      return (
        s.opCode.toLowerCase().includes(q) ||
        s.opName.toLowerCase().includes(q) ||
        (s.resourceCode ?? '').toLowerCase().includes(q) ||
        (s.resourceName ?? '').toLowerCase().includes(q) ||
        s.itemCode.toLowerCase().includes(q)
      );
    });
  }, [setups, filter, query]);

  const pills: Array<[Filter, string, number]> = [
    ['all', labels.filterAll, counts.all],
    ['machine', labels.filterMachine, counts.machine],
    ['line', labels.filterLine, counts.line],
  ];

  return (
    <div data-prototype-label="tooling_screen" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter tooling setups" className="flex flex-wrap gap-2">
          {pills.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              data-testid={`tooling-filter-${key}`}
              onClick={() => setFilter(key)}
              className={[
                'rounded-full border px-3 py-1 text-sm transition-colors',
                filter === key
                  ? 'border-blue-300 bg-blue-50 font-medium text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {label} <span className="ml-1 opacity-50">{count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="tooling-search" className="sr-only">
            {labels.searchPlaceholder}
          </label>
          <Input
            id="tooling-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className="w-56"
            data-testid="tooling-search"
          />
          {canWrite ? (
            <Link href={routingsHref} className="btn btn--default" data-testid="tooling-create-cta" data-variant="default">
              {labels.createCta}
            </Link>
          ) : null}
        </div>
      </div>

      <Card className="rounded-xl border bg-white shadow-sm">
        <CardContent className="p-0">
          <Table aria-label="Tooling and equipment setups">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colCode}</TableHead>
                <TableHead scope="col">{labels.colName}</TableHead>
                <TableHead scope="col">{labels.colType}</TableHead>
                <TableHead scope="col">{labels.colResource}</TableHead>
                <TableHead scope="col">{labels.colItem}</TableHead>
                <TableHead scope="col" className="text-right">
                  {labels.colSetup}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {labels.colCostPerHour}
                </TableHead>
                <TableHead scope="col">{labels.colUpdated}</TableHead>
                <TableHead scope="col">{labels.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((s) => (
                  <TableRow key={s.id} data-testid="tooling-row">
                    <TableCell className="font-mono text-sm">{s.opCode}</TableCell>
                    <TableCell className="font-medium">{s.opName}</TableCell>
                    <TableCell>
                      {s.resourceKind ? (
                        <Badge variant={s.resourceKind === 'machine' ? 'info' : 'secondary'}>
                          {s.resourceKind === 'machine' ? labels.typeMachine : labels.typeLine}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.resourceCode ? (
                        <span>
                          <span className="font-mono">{s.resourceCode}</span>
                          {s.resourceName ? <span className="text-muted-foreground"> · {s.resourceName}</span> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{s.itemCode}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {s.setupTimeMin} {labels.setupUnit}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCostPerHour(s.costPerHour)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{formatUpdated(s.updatedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.routingStatus] ?? 'muted'}>{s.routingStatus}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    {labels.noMatches}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
