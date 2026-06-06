'use client';

/**
 * Lane A — 03-technical Items Master list table (client island).
 *
 * Prototype parity (Products List, prototypes/design/Monopilot Design System/
 * technical/other-screens.jsx — MaterialsListScreen, TEC-003): TabsCounted by
 * item type, search + status/D365 filter pills, and the dense design-system
 * table (mono codes, 5-tone status/type badges, Allergens + BOMs columns).
 *
 * Pure presentation + client-side filtering over the server-loaded items — no
 * data mutation here. Per-row Edit/Deactivate/Allergens live in ItemRowActions.
 */

import React from 'react';

import { type ItemListItem, type ItemStatus, type ItemType } from '../_actions/shared';
import { type DeactivateLabels } from './deactivate-modal';
import { type ItemWizardLabels } from './item-create-wizard';
import { ItemRowActions, ITEM_TYPE_LABELS, STATUS_LABELS } from './items-manager.client';

const TYPE_TABS: Array<{ key: 'all' | ItemType; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'rm', label: 'Raw materials' },
  { key: 'ingredient', label: 'Ingredients' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'fg', label: 'Finished goods' },
  { key: 'co_product', label: 'Co-products' },
  { key: 'byproduct', label: 'By-products' },
];

const STATUS_FILTERS: Array<{ key: 'all' | ItemStatus; label: string }> = [
  { key: 'all', label: 'All status' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'deprecated', label: 'Deprecated' },
  { key: 'blocked', label: 'Blocked' },
];

const STATUS_TONE: Record<ItemStatus, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  deprecated: 'badge-amber',
  blocked: 'badge-red',
};
const STATUS_GLYPH: Record<ItemStatus, string> = { draft: '○', active: '●', deprecated: '⚠', blocked: '⚠' };
const TYPE_TONE: Record<ItemType, string> = {
  rm: 'badge-blue',
  ingredient: 'badge-blue',
  intermediate: 'badge-gray',
  fg: 'badge-green',
  co_product: 'badge-blue',
  byproduct: 'badge-gray',
};

const D365_FILTERS: Array<{ key: string; label: string; match: (s: string | null) => boolean }> = [
  { key: 'all', label: 'D365: all', match: () => true },
  { key: 'synced', label: 'Synced', match: (s) => s === 'synced' },
  { key: 'drift', label: 'Drift', match: (s) => s === 'drift' },
  { key: 'unsynced', label: 'Not synced', match: (s) => s === null || (s !== 'synced' && s !== 'drift') },
];

function formatCost(costPerKg: string | null): string {
  if (costPerKg === null) return '—';
  const n = Number(costPerKg);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

function formatUpdated(updatedAt: string): string {
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

const TYPE_TAB_TONE: Record<ItemType, string> = {
  rm: 'tone-info',
  ingredient: 'tone-info',
  intermediate: 'tone-neutral',
  fg: 'tone-ok',
  co_product: 'tone-info',
  byproduct: 'tone-neutral',
};
function tabTone(key: 'all' | ItemType): string {
  return key === 'all' ? '' : TYPE_TAB_TONE[key];
}

export function ItemsTableClient({
  items,
  canEdit,
  canDeactivate,
  editLabel,
  deactivateLabel,
  allergensLabel = 'Allergens',
  filterEmptyTitle = 'No items match your filters',
  filterEmptyBody = 'Adjust the type tab, status, or search to see more items.',
  wizardLabels,
  deactivateLabels,
}: {
  items: ItemListItem[];
  canEdit: boolean;
  canDeactivate: boolean;
  editLabel: string;
  deactivateLabel: string;
  allergensLabel?: string;
  filterEmptyTitle?: string;
  filterEmptyBody?: string;
  wizardLabels: ItemWizardLabels;
  deactivateLabels: DeactivateLabels;
}) {
  const [tab, setTab] = React.useState<'all' | ItemType>('all');
  const [status, setStatus] = React.useState<'all' | ItemStatus>('all');
  const [d365, setD365] = React.useState<string>('all');
  const [query, setQuery] = React.useState('');

  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const it of items) counts[it.itemType] = (counts[it.itemType] ?? 0) + 1;
    return counts;
  }, [items]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const d365Match = D365_FILTERS.find((f) => f.key === d365)?.match ?? (() => true);
    return items.filter((it) => {
      if (tab !== 'all' && it.itemType !== tab) return false;
      if (status !== 'all' && it.status !== status) return false;
      if (!d365Match(it.d365SyncStatus)) return false;
      if (q && !`${it.itemCode} ${it.name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, tab, status, d365, query]);

  return (
    <div className="space-y-3">
      {/* F1 — TabsCounted by item type */}
      <div className="tabs-counted" role="tablist" aria-label="Item type">
        {TYPE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tabs-counted-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            <span className={`tabs-counted-pill ${tabTone(t.key)}`}>{typeCounts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* F2 — search + status + D365 filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="form-input max-w-xs"
          placeholder="Search by code or name…"
          aria-label="Search items"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <div className="pills" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`pill${status === s.key ? ' on' : ''}`}
              aria-pressed={status === s.key}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="pills" role="group" aria-label="D365 filter">
          {D365_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`pill${d365 === f.key ? ' on' : ''}`}
              aria-pressed={d365 === f.key}
              onClick={() => setD365(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table card — design tokens, no shadow */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">{filterEmptyTitle}</div>
            <div className="empty-state-body">{filterEmptyBody}</div>
          </div>
        ) : (
          <table aria-label="Items master">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">UoM</th>
                <th scope="col">Cost / kg (zł)</th>
                <th scope="col">Allergens</th>
                <th scope="col">BOMs</th>
                <th scope="col">Updated</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="mono">
                    <a
                      href={`/technical/items/${encodeURIComponent(item.itemCode)}`}
                      className="text-blue-600 underline-offset-4 hover:underline"
                    >
                      {item.itemCode}
                    </a>
                  </td>
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td>
                    <span className={`badge ${TYPE_TONE[item.itemType]}`}>{ITEM_TYPE_LABELS[item.itemType]}</span>
                  </td>
                  <td className="mono">{item.uomBase}</td>
                  <td className="mono tabular-nums">{formatCost(item.costPerKg)}</td>
                  <td>
                    {item.allergens.length === 0 ? (
                      <span className="text-shell-muted">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {item.allergens.map((a) => (
                          <span key={a} className="badge badge-amber">
                            {a}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="mono tabular-nums">{item.bomCount > 0 ? item.bomCount : '—'}</td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>
                    {formatUpdated(item.updatedAt)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_TONE[item.status]}`}>
                      {STATUS_GLYPH[item.status]} {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ItemRowActions
                      item={item}
                      canEdit={canEdit}
                      canDeactivate={canDeactivate}
                      editLabel={editLabel}
                      deactivateLabel={deactivateLabel}
                      allergensLabel={allergensLabel}
                      wizardLabels={wizardLabels}
                      deactivateLabels={deactivateLabels}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="helper">
        {filtered.length} of {items.length} items
      </p>
    </div>
  );
}
