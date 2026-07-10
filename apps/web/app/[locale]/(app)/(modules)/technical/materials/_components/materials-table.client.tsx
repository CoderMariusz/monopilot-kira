'use client';

/**
 * Lane A1 — 03-technical Materials list table (client island).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { type ItemListItem, type ItemStatus, type ItemType } from '../../items/_actions/shared';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';

const STATUS_TONE: Record<ItemStatus, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  deprecated: 'badge-amber',
  blocked: 'badge-red',
};
const STATUS_GLYPH: Record<ItemStatus, string> = { draft: '○', active: '●', deprecated: '⚠', blocked: '⚠' };
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
  countSummary: string;
  pagination: ListPaginationLabels;
  typeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
};

export function MaterialsTableClient({
  locale,
  items,
  pagination,
  typeCounts,
  filters,
  typeTabs,
  labels,
}: {
  locale: string;
  items: ItemListItem[];
  pagination: PaginatedResult<ItemListItem>;
  typeCounts: Record<ItemType, number> & { all: number };
  filters: { search: string; type: string };
  typeTabs: Array<{ key: 'all' | ItemType; label: string }>;
  labels: MaterialsTableLabels;
}) {
  const router = useRouter();
  const basePath = `/${locale}/technical/materials`;
  const activeTab: 'all' | ItemType = filters.type ? (filters.type as ItemType) : 'all';
  const pageHref = (page: number) =>
    buildListPageHref(
      basePath,
      {
        type: activeTab === 'all' ? undefined : activeTab,
        q: filters.search || undefined,
      },
      page,
    );
  const shown = pagination.offset + items.length;
  const [searchDraft, setSearchDraft] = React.useState(filters.search);

  React.useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => {
      router.push(
        buildListPageHref(
          basePath,
          {
            type: activeTab === 'all' ? undefined : activeTab,
            q: searchDraft || undefined,
          },
          1,
        ),
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeTab, basePath, filters.search, router, searchDraft]);

  function navigateType(next: 'all' | ItemType) {
    router.push(
      buildListPageHref(
        basePath,
        {
          type: next === 'all' ? undefined : next,
          q: filters.search || undefined,
        },
        1,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="tabs-counted" role="tablist" aria-label={labels.colType}>
        {typeTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`tabs-counted-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => navigateType(t.key)}
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
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.currentTarget.value)}
        />
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">{labels.noMatchTitle}</div>
            <div className="empty-state-body">{labels.noMatchBody}</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{labels.colCode}</th>
                <th>{labels.colName}</th>
                <th>{labels.colType}</th>
                <th>{labels.colUom}</th>
                <th>{labels.colCost}</th>
                <th>{labels.colUpdated}</th>
                <th>{labels.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="mono">
                    <a
                      href={`/${locale}/technical/items/${encodeURIComponent(it.itemCode)}`}
                      className="text-blue-600 underline-offset-4 hover:underline"
                    >
                      {it.itemCode}
                    </a>
                  </td>
                  <td style={{ fontWeight: 500 }}>{it.name}</td>
                  <td>
                    <span className={`badge ${TYPE_TONE[it.itemType] ?? 'badge-gray'}`}>
                      {labels.typeLabels[it.itemType] ?? it.itemType}
                    </span>
                  </td>
                  <td className="mono">{it.uomBase}</td>
                  <td className="mono tabular-nums">{formatCost(it.costPerKg)}</td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>
                    {formatUpdated(it.updatedAt)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_TONE[it.status]}`}>
                      {STATUS_GLYPH[it.status]} {labels.statusLabels[it.status] ?? it.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ListPaginationFooter
          shown={shown}
          total={pagination.total}
          previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
          nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
          labels={labels.pagination}
          testId="materials-list-pagination"
        />
      </div>

      <p className="helper">
        {labels.countSummary
          .replace('{shown}', String(shown))
          .replace('{total}', String(pagination.total))}
      </p>
    </div>
  );
}
