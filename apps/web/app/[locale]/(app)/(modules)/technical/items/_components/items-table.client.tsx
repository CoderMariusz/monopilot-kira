'use client';

/**
 * Lane A — 03-technical Items Master list table (client island).
 *
 * Prototype parity (Products List, prototypes/design/Monopilot Design System/
 * technical/other-screens.jsx — MaterialsListScreen, TEC-003): TabsCounted by
 * item type, search + status/D365 filter pills, and the dense design-system
 * table (mono codes, 5-tone status/type badges, Allergens + BOMs columns).
 *
 * Pure presentation over the server-loaded items — search, type, status, and D365
 * filters are URL-driven and applied in SQL. Per-row Edit/Deactivate/Allergens
 * live in ItemRowActions.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { type SelectOption } from '@monopilot/ui/Select';

import { type ItemListItem, type ItemStatus, type ItemType } from '../_actions/shared';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';
import { type DeactivateLabels } from './deactivate-modal';
import { type ItemWizardLabels } from './item-create-wizard';
import { type StatusTransitionLabels } from './item-transition-labels';
import { ItemRowActions } from './items-manager.client';

/**
 * Localized chrome for the items master list — type tabs, status/D365 filter
 * pills, table column headers, search placeholder and footer. Resolved
 * server-side by the page (technical.items.list.* / create.typeLabels.* /
 * create.statusLabels.*); English fallbacks keep the island self-sufficient
 * when labels are omitted (e.g. RTL tests).
 */
export type ItemsTableLabels = {
  /** rm/ingredient/…/packaging — singular badge labels (create.typeLabels.*). */
  typeLabels: Record<ItemType, string>;
  /** draft/active/deprecated/blocked — status badge labels (create.statusLabels.*). */
  statusLabels: Record<ItemStatus, string>;
  /** Type-tab labels (plural) keyed by 'all' + ItemType (list.tabs.*). */
  tabLabels: Partial<Record<'all' | ItemType, string>>;
  /** Status filter-pill labels keyed by 'all' + ItemStatus (list.statusFilters.*). */
  statusFilterLabels: Partial<Record<'all' | ItemStatus, string>>;
  /** D365 filter-pill labels keyed by all/synced/drift/unsynced (list.d365Filters.*). */
  d365FilterLabels: Partial<Record<'all' | 'synced' | 'drift' | 'unsynced', string>>;
  /** Column headers (list.columns.*). */
  columns: {
    code: string;
    name: string;
    type: string;
    uom: string;
    costPerKg: string;
    allergens: string;
    boms: string;
    updated: string;
    status: string;
    actions: string;
  };
  searchPlaceholder: string;
  /** Footer counter — carries {shown}/{total} placeholders (list.footer). */
  footer: string;
  pagination: ListPaginationLabels;
  /** Accessible labels sourced from the same technical.items namespace. */
  aria: {
    itemType: string;
    search: string;
    statusFilter: string;
    d365Filter: string;
    table: string;
  };
};

const TYPE_TAB_KEYS: Array<'all' | ItemType> = [
  'all',
  'rm',
  'ingredient',
  'intermediate',
  'fg',
  'co_product',
  'byproduct',
];

const STATUS_FILTER_KEYS: Array<'all' | ItemStatus> = ['all', 'active', 'draft', 'deprecated', 'blocked'];

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
  packaging: 'badge-gray',
};

const D365_FILTER_KEYS: Array<'all' | 'synced' | 'drift' | 'unsynced'> = ['all', 'synced', 'drift', 'unsynced'];

function listQuery(filters: { search: string; type: string; status: string; d365: string }) {
  return {
    type: filters.type || undefined,
    q: filters.search || undefined,
    status: filters.status && filters.status !== 'all' ? filters.status : undefined,
    d365: filters.d365 && filters.d365 !== 'all' ? filters.d365 : undefined,
  };
}

function formatCost(costPerKg: string | null): string {
  if (costPerKg === null) return '—';
  const n = Number(costPerKg);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

import { normalizePieceUom } from '../../../../../../../lib/uom/piece';

function formatUom(uomBase: string, uomLabels?: ItemWizardLabels['uomLabels']): string {
  const canonical = normalizePieceUom(uomBase) ?? uomBase;
  if (uomLabels && canonical in uomLabels) {
    return uomLabels[canonical as keyof typeof uomLabels];
  }
  return canonical;
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
  packaging: 'tone-neutral',
};
function tabTone(key: 'all' | ItemType): string {
  return key === 'all' ? '' : TYPE_TAB_TONE[key];
}

export function ItemsTableClient({
  locale,
  items,
  pagination,
  typeCounts,
  filters,
  canEdit,
  canDeactivate,
  editLabel,
  deactivateLabel,
  allergensLabel,
  filterEmptyTitle,
  filterEmptyBody,
  labels,
  wizardLabels,
  deactivateLabels,
  transitionLabels,
  supplierOptions = [],
  categoryOptions = [],
  supplierIdByCode = {},
  initialTab,
}: {
  locale: string;
  items: ItemListItem[];
  pagination: PaginatedResult<ItemListItem>;
  typeCounts: Record<ItemType, number> & { all: number };
  filters: { search: string; type: string; status: string; d365: string };
  canEdit: boolean;
  canDeactivate: boolean;
  editLabel: string;
  deactivateLabel: string;
  allergensLabel: string;
  filterEmptyTitle: string;
  filterEmptyBody: string;
  /** Localized type/status badge maps + table chrome (defaults to English). */
  labels: ItemsTableLabels;
  wizardLabels: ItemWizardLabels;
  deactivateLabels: DeactivateLabels;
  transitionLabels?: StatusTransitionLabels;
  /** A11 — org supplier list (CODE → "CODE — Name") for the per-row edit wizard supplier picker. */
  supplierOptions?: SelectOption[];
  categoryOptions?: SelectOption[];
  /** A11 — supplier CODE → UUID map so EDIT-mode save can call createItemSupplierSpec. */
  supplierIdByCode?: Record<string, string>;
  /** W2-T4 — pre-selected type tab (deep-link ?type=fg from the retired settings Products screen). */
  initialTab?: ItemType;
}) {
  const router = useRouter();
  const basePath = `/${locale}/technical/items`;
  const activeTab: 'all' | ItemType = filters.type ? (filters.type as ItemType) : 'all';
  const activeStatus: 'all' | ItemStatus = filters.status ? (filters.status as ItemStatus) : 'all';
  const activeD365: 'all' | 'synced' | 'drift' | 'unsynced' = filters.d365
    ? (filters.d365 as 'synced' | 'drift' | 'unsynced')
    : 'all';
  const pageHref = (page: number) => buildListPageHref(basePath, listQuery(filters), page);
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
          listQuery({ ...filters, search: searchDraft }),
          1,
        ),
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [basePath, filters, router, searchDraft]);

  function navigateType(next: 'all' | ItemType) {
    router.push(
      buildListPageHref(
        basePath,
        listQuery({ ...filters, type: next === 'all' ? '' : next }),
        1,
      ),
    );
  }

  function navigateStatus(next: 'all' | ItemStatus) {
    router.push(
      buildListPageHref(
        basePath,
        listQuery({ ...filters, status: next === 'all' ? '' : next }),
        1,
      ),
    );
  }

  function navigateD365(next: 'all' | 'synced' | 'drift' | 'unsynced') {
    router.push(
      buildListPageHref(
        basePath,
        listQuery({ ...filters, d365: next === 'all' ? '' : next }),
        1,
      ),
    );
  }

  const tabLabel = (key: 'all' | ItemType) => labels.tabLabels[key] ?? key;
  const statusFilterLabel = (key: 'all' | ItemStatus) => labels.statusFilterLabels[key] ?? key;
  const d365FilterLabel = (key: 'all' | 'synced' | 'drift' | 'unsynced') => labels.d365FilterLabels[key] ?? key;
  const typeLabel = (t: ItemType) => labels.typeLabels[t] ?? t;
  const statusLabel = (s: ItemStatus) => labels.statusLabels[s] ?? s;
  const col = labels.columns;
  const footerText = labels.footer
    .replace('{shown}', String(shown))
    .replace('{total}', String(pagination.total));

  return (
    <div className="space-y-3">
      {/* F1 — TabsCounted by item type */}
      <div className="tabs-counted" role="tablist" aria-label={labels.aria.itemType}>
        {TYPE_TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`tabs-counted-tab${activeTab === key ? ' active' : ''}`}
            onClick={() => navigateType(key)}
          >
            <span>{tabLabel(key)}</span>
            <span className={`tabs-counted-pill ${tabTone(key)}`}>{typeCounts[key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* F2 — search + status + D365 filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="form-input max-w-xs"
          placeholder={labels.searchPlaceholder}
          aria-label={labels.aria.search}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.currentTarget.value)}
        />
        <div className="pills" role="group" aria-label={labels.aria.statusFilter}>
          {STATUS_FILTER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`pill${activeStatus === key ? ' on' : ''}`}
              aria-pressed={activeStatus === key}
              onClick={() => navigateStatus(key)}
            >
              {statusFilterLabel(key)}
            </button>
          ))}
        </div>
        <div className="pills" role="group" aria-label={labels.aria.d365Filter}>
          {D365_FILTER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`pill${activeD365 === key ? ' on' : ''}`}
              aria-pressed={activeD365 === key}
              onClick={() => navigateD365(key)}
            >
              {d365FilterLabel(key)}
            </button>
          ))}
        </div>
      </div>

      {/* Table card — design tokens, no shadow */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">{filterEmptyTitle}</div>
            <div className="empty-state-body">{filterEmptyBody}</div>
          </div>
        ) : (
          <table aria-label={labels.aria.table}>
            <thead>
              <tr>
                <th scope="col">{col.code}</th>
                <th scope="col">{col.name}</th>
                <th scope="col">{col.type}</th>
                <th scope="col">{col.uom}</th>
                <th scope="col">{col.costPerKg}</th>
                <th scope="col">{col.allergens}</th>
                <th scope="col">{col.boms}</th>
                <th scope="col">{col.updated}</th>
                <th scope="col">{col.status}</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  {col.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
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
                    <span className={`badge ${TYPE_TONE[item.itemType]}`}>{typeLabel(item.itemType)}</span>
                  </td>
                  <td className="mono">{formatUom(item.uomBase, wizardLabels.uomLabels)}</td>
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
                      {STATUS_GLYPH[item.status]} {statusLabel(item.status)}
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
                      transitionLabels={transitionLabels}
                      supplierOptions={supplierOptions}
                      categoryOptions={categoryOptions}
                      supplierIdByCode={supplierIdByCode}
                    />
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
          testId="items-list-pagination"
        />
      </div>

      <p className="helper">{footerText}</p>
    </div>
  );
}
