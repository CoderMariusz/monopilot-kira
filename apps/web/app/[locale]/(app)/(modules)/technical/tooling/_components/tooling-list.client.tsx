'use client';

/**
 * 03-technical · TEC-087 Tooling / Equipment Setup List (T-053) — client island.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:314-352
 *   (`tooling_screen`, list-with-actions) — PageHeader + filter pills + a table
 *   (Code / Name / Type / ... / Updated / Status). Translated to shadcn
 *   primitives (Badge / Table / Button / Input). The "Type" column maps to the
 *   production line resource kind per the prototype index translation note
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
 * populated list + the client-side search interaction (no CLS, no
 * client-trusted mutation).
 */

import React from 'react';
import Link from 'next/link';

import type { ToolingSetupRow } from '../_actions/shared';

export type ToolingListLabels = {
  searchPlaceholder: string;
  createCta: string;
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
  typeLine: string;
  setupUnit: string;
};

const STATUS_TONE: Record<string, string> = {
  draft: 'badge-gray',
  approved: 'badge-blue',
  active: 'badge-green',
  superseded: 'badge-amber',
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
  const [query, setQuery] = React.useState('');

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return setups.filter((s) => {
      if (!q) return true;
      return (
        s.opCode.toLowerCase().includes(q) ||
        s.opName.toLowerCase().includes(q) ||
        (s.resourceCode ?? '').toLowerCase().includes(q) ||
        (s.resourceName ?? '').toLowerCase().includes(q) ||
        s.itemCode.toLowerCase().includes(q)
      );
    });
  }, [setups, query]);

  return (
    <div data-prototype-label="tooling_screen" data-testid="tooling-list" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="tooling-search" className="sr-only">
            {labels.searchPlaceholder}
          </label>
          <input
            id="tooling-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchPlaceholder}
            className="form-input"
            style={{ width: 224 }}
            data-testid="tooling-search"
          />
          {canWrite ? (
            <Link href={routingsHref} className="btn btn-primary" data-testid="tooling-create-cta">
              {labels.createCta}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table aria-label="Tooling and equipment setups">
          <thead>
            <tr>
              <th scope="col">{labels.colCode}</th>
              <th scope="col">{labels.colName}</th>
              <th scope="col">{labels.colType}</th>
              <th scope="col">{labels.colResource}</th>
              <th scope="col">{labels.colItem}</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {labels.colSetup}
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {labels.colCostPerHour}
              </th>
              <th scope="col">{labels.colUpdated}</th>
              <th scope="col">{labels.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((s) => (
                <tr key={s.id} data-testid="tooling-row">
                  <td className="mono">{s.opCode}</td>
                  <td style={{ fontWeight: 500 }}>{s.opName}</td>
                  <td>
                    {s.resourceKind === 'line' ? (
                      <span className="badge badge-gray">{labels.typeLine}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {s.resourceCode ? (
                      <span>
                        <span className="mono">{s.resourceCode}</span>
                        {s.resourceName ? <span className="muted"> · {s.resourceName}</span> : null}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="mono">{s.itemCode}</td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                    {s.setupTimeMin} {labels.setupUnit}
                  </td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                    {formatCostPerHour(s.costPerHour)}
                  </td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>
                    {formatUpdated(s.updatedAt)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_TONE[s.routingStatus] ?? 'badge-gray'}`}>{s.routingStatus}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
                  {labels.noMatches}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
