'use client';

/**
 * Lane A1 — 03-technical Materials list table (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:304-352
 *   (`MaterialsListScreen`, TEC-003) — pills filter + dense design table (mono
 *   codes, type badge, UoM, cost/UoM, updated, status). The prototype's
 *   packaging type is N/A in our item master (rm + intermediate only); the pills
 *   reflect the real item_type domain. Search is added for parity with the
 *   Products list density. Pure presentation over the server-loaded RM/intermediate
 *   rows — no mocks, no mutation here.
 */

import React from 'react';
import { useParams } from 'next/navigation';

import { type ItemListItem, type ItemStatus, type ItemType } from '../../items/_actions/shared';

const STATUS_TONE: Record<ItemStatus, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  deprecated: 'badge-amber',
  blocked: 'badge-red',
};
const STATUS_GLYPH: Record<ItemStatus, string> = { draft: '○', active: '●', deprecated: '⚠', blocked: '⚠' };
// Prototype other-screens.jsx:307 `typeTag` — RM=blue, packaging=amber.
// (intermediate kept gray as shipped; the prototype's violet is a deferred
// cosmetic deviation — not in scope to regress the already-live screen.)
const TYPE_TONE: Record<string, string> = { rm: 'badge-blue', intermediate: 'badge-gray', packaging: 'badge-amber' };

function formatCost(costPerKg: string | null): string {
  if (costPerKg === null) return '—';
  const n = Number(costPerKg);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}
function formatUpdated(updatedAt: string): string {
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export type MaterialsTableLabels = {
  tabAll: string;
  searchPlaceholder: string;
  searchAria: string;
  colCode: string;
  colName: string;
  colType: string;
  colUom: string;
  colCost: string;
  colUpdated: string;
  colStatus: string;
  noMatchTitle: string;
  noMatchBody: string;
  countSummary: string; // "{shown} of {total} materials"
  typeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
};

export function MaterialsTableClient({
  items,
  typeTabs,
  labels,
}: {
  items: ItemListItem[];
  typeTabs: Array<{ key: 'all' | ItemType; label: string }>;
  labels: MaterialsTableLabels;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const [tab, setTab] = React.useState<'all' | ItemType>('all');
  const [query, setQuery] = React.useState('');

  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const it of items) counts[it.itemType] = (counts[it.itemType] ?? 0) + 1;
    return counts;
  }, [items]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (tab !== 'all' && it.itemType !== tab) return false;
      if (q && !`${it.itemCode} ${it.name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, tab, query]);

  return (
    <div className="space-y-3">
      <div className="tabs-counted" role="tablist" aria-label={labels.colType}>
        {typeTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tabs-counted-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            <span className="tabs-counted-pill">{typeCounts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="form-input max-w-xs"
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchAria}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">{labels.noMatchTitle}</div>
            <div className="empty-state-body">{labels.noMatchBody}</div>
          </div>
        ) : (
          <table aria-label="Materials">
            <thead>
              <tr>
                <th scope="col">{labels.colCode}</th>
                <th scope="col">{labels.colName}</th>
                <th scope="col">{labels.colType}</th>
                <th scope="col">{labels.colUom}</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  {labels.colCost}
                </th>
                <th scope="col">{labels.colUpdated}</th>
                <th scope="col">{labels.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="mono">
                    <a
                      href={`/${locale}/technical/items/${encodeURIComponent(item.itemCode)}`}
                      className="underline-offset-4 hover:underline"
                      style={{ color: 'var(--blue)' }}
                    >
                      {item.itemCode}
                    </a>
                  </td>
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td>
                    <span className={`badge ${TYPE_TONE[item.itemType] ?? 'badge-gray'}`}>
                      {labels.typeLabels[item.itemType] ?? item.itemType}
                    </span>
                  </td>
                  <td className="mono">{item.uomBase}</td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                    {formatCost(item.costPerKg)}
                  </td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>
                    {formatUpdated(item.updatedAt)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_TONE[item.status]}`}>
                      {STATUS_GLYPH[item.status]} {labels.statusLabels[item.status] ?? item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="helper">
        {labels.countSummary
          .replace('{shown}', String(filtered.length))
          .replace('{total}', String(items.length))}
      </p>
    </div>
  );
}
