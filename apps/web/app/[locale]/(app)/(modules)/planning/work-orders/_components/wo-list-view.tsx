'use client';

/**
 * P2-PLANNING — Work Orders list + create flow (client view).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   wo-list.jsx:4-279 (plan_wo_list):
 *     page head + "＋ Create WO" primary       → wo-list.jsx:84-96
 *     status tabs with counts                  → wo-list.jsx:23-31,106-113
 *     search filter bar                        → wo-list.jsx:116-136
 *     dense table (WO / product / status /     → wo-list.jsx:161-262
 *       qty / scheduled / line + BOM badge)
 *     per-row status action (Release on DRAFT) → wo-list.jsx:218-226
 *     empty-state                              → wo-list.jsx:152-159
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's "All"-tab status grouping + synthetic "overdue" bucket and
 *     the allergen / availability / progress / cascade columns are dropped: those
 *     columns have NO data source in listPlanningWorkOrders (the reviewed action).
 *     We render only real columns + an honest BOM badge from materialCount. Tabs
 *     stay (DRAFT/RELEASED/IN_PROGRESS/ON_HOLD/COMPLETED/All) with live counts.
 *   - Bulk-selection / Gantt / Cascade / Export header buttons are out of scope
 *     for this lane (no backing action); only Create WO is wired.
 *
 * Data comes from the reviewed actions (listPlanningWorkOrders feeds `workOrders`;
 * releaseWorkOrder / createWorkOrder passed as seams). RBAC is enforced server-side
 * inside those actions; this view never trusts a client permission flag.
 *
 * UI states: loading (handled by the Suspense fallback in page.tsx), empty
 * (EmptyState), error (the page renders an error banner instead of this view),
 * optimistic (release pending row → busy + disabled; create pending in the modal).
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Badge } from '@monopilot/ui/Badge';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { WoStatusBadge } from './wo-status-badge';
import { CreateWoModal, type CreateWoLabels } from './create-wo-modal';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';
import type { ListPlanningWorkOrdersResult, CreateWorkOrderResult, ReleaseWorkOrderResult, DeleteDraftWorkOrderResult, WoStatusCounts } from '../_actions/shared';
import type { FgProductOption, ProductionResources, SearchFgProductsInput } from '../_actions/wo-form-data';
import type { PreviewWorkOrderChainResult } from '../_actions/chain-preview';

type WoRow = Extract<ListPlanningWorkOrdersResult, { ok: true }>['workOrders'][number];

const TAB_ORDER = ['all', 'DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type WoListFilters = {
  status: string;
  search: string;
};

function listQuery(filters: WoListFilters, archived = false): Record<string, string | undefined> {
  return {
    status: filters.status || undefined,
    q: filters.search || undefined,
    archived: archived ? '1' : undefined,
  };
}

export type WoListLabels = {
  createWo: string;
  /** Bulk WO import (CSV) → /planning/work-orders/import (preview + confirm). */
  bulkImportLabel: string;
  searchPlaceholder: string;
  rowsCount: string;
  tabs: Record<TabKey, string>;
  status: Record<string, string>;
  columns: {
    wo: string;
    product: string;
    status: string;
    qty: string;
    scheduled: string;
    line: string;
    bom: string;
    actions: string;
  };
  bomBadge: string;
  noBomBadge: string;
  notAssigned: string;
  release: string;
  releasing: string;
  confirmRelease: string;
  deleteDraft: string;
  deletingDraft: string;
  confirmDeleteDraft: string;
  /** Archive tab + archived-mode chrome (staged: _meta/i18n-staging/archive-tabs.json). */
  tabArchive: string;
  archivedHint: string;
  backToActive: string;
  empty: {
    title: string;
    body: string;
    clear: string;
  };
  releaseError: Record<string, string>;
  /**
   * P0-UOM — actionable copy for the new releaseWorkOrder
   * { ok:false, error:'factory_release_incomplete', missing:[...] } result.
   *   title — the base sentence; {missing} is replaced with the resolved list
   *   activeBom / factorySpec — the per-artifact names
   *   technicalHint — "create them in Technical"
   */
  factoryReleaseIncomplete?: {
    title: string;
    activeBom: string;
    factorySpec: string;
    technicalHint: string;
  };
  create: CreateWoLabels;
  pagination: ListPaginationLabels;
};

export type WoListViewProps = {
  locale: string;
  workOrders: WoRow[];
  pagination: PaginatedResult<WoRow>;
  filters: WoListFilters;
  statusCounts: WoStatusCounts;
  resources: ProductionResources;
  labels: WoListLabels;
  /**
   * Archived mode — when true the page fetched with archived:true (?archived=1) and
   * `workOrders` holds the archived rows. Status tabs are client filters over the
   * active set, so archive is a server re-fetch (link), not a client filter.
   */
  archived?: boolean;
  /** Count of archived WOs (from the active fetch's payload) for the chip. */
  archivedCount: number;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  searchFgProductsAction: (input: SearchFgProductsInput) => Promise<FgProductOption[]>;
  createWorkOrderAction: (params: {
    productId: string;
    itemCode: string;
    plannedQuantity: string;
    scheduledStartTime?: string;
    productionLineId?: string;
    notes?: string;
  }) => Promise<CreateWorkOrderResult>;
  releaseWorkOrderAction: (params: { id: string }) => Promise<ReleaseWorkOrderResult>;
  deleteDraftWorkOrderAction?: (params: { id: string }) => Promise<DeleteDraftWorkOrderResult>;
  /** Optional chain-preview seam forwarded to the create modal (see create-wo-modal). */
  previewChainAction?: (input: { productId: string; plannedQuantity: string }) => Promise<PreviewWorkOrderChainResult>;
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

export function WoListView({
  locale,
  workOrders,
  pagination,
  filters,
  statusCounts,
  resources,
  labels,
  archived = false,
  archivedCount,
  autoOpenCreate = false,
  searchFgProductsAction,
  createWorkOrderAction,
  releaseWorkOrderAction,
  deleteDraftWorkOrderAction,
  previewChainAction,
}: WoListViewProps) {
  const router = useRouter();
  const basePath = `/${locale}/planning/work-orders`;
  const activeTab: TabKey = (filters.status as TabKey) || 'all';
  const pageHref = (page: number) => buildListPageHref(basePath, listQuery(filters, archived), page);
  const shown = pagination.offset + workOrders.length;
  const [searchDraft, setSearchDraft] = React.useState(filters.search);
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);
  const [releasingId, setReleasingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);
  const [createNotice, setCreateNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => {
      router.push(buildListPageHref(basePath, listQuery({ ...filters, search: searchDraft }, archived), 1));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [archived, basePath, filters, router, searchDraft]);

  function navigate(next: Partial<WoListFilters>) {
    router.push(buildListPageHref(basePath, listQuery({ ...filters, ...next }, archived), 1));
  }

  function tabCount(key: TabKey): number {
    return key === 'all' ? statusCounts.all : statusCounts[key as keyof WoStatusCounts] ?? 0;
  }

  function statusLabel(status: string): string {
    const key = status.toLowerCase();
    return labels.status[key] ?? status;
  }

  // P0-UOM — turn the new factory_release_incomplete result into actionable copy
  // naming exactly which artifacts are missing and that they are created in
  // Technical (live bug: a WO was released with no BOM/spec and Start failed with
  // a generic message). Defensive on `missing` shape (the action contract is owned
  // by the Codex backend lane and may not type the field yet).
  function factoryIncompleteMessage(missing: readonly string[]): string {
    const fr = labels.factoryReleaseIncomplete;
    if (!fr) return labels.releaseError.persistence_failed;
    const names = missing
      .map((m) => (m === 'active_bom' ? fr.activeBom : m === 'factory_spec' ? fr.factorySpec : m))
      .filter(Boolean);
    const list = names.length > 0 ? names.join(', ') : [fr.activeBom, fr.factorySpec].join(', ');
    return `${fr.title.replace('{missing}', list)} ${fr.technicalHint}`.trim();
  }

  async function onRelease(wo: WoRow) {
    if (releasingId || deletingId) return;
    // Confirm gate (parity: release is a state transition — guarded).
    if (!window.confirm(labels.confirmRelease.replace('{wo}', wo.woNumber))) return;
    setReleasingId(wo.id);
    setRowError(null);
    try {
      const result = await releaseWorkOrderAction({ id: wo.id });
      if (!result.ok) {
        const r = result as { error: string; missing?: readonly string[]; message?: string };
        const message =
          r.error === 'factory_release_incomplete'
            ? r.message ?? factoryIncompleteMessage(r.missing ?? [])
            : r.error === 'upstream_wip_not_ready' && r.message
              ? r.message
              : labels.releaseError[r.error] ?? labels.releaseError.persistence_failed;
        setRowError({ id: wo.id, message });
        setReleasingId(null);
        return;
      }
      router.refresh();
    } catch {
      setRowError({ id: wo.id, message: labels.releaseError.persistence_failed });
    } finally {
      setReleasingId(null);
    }
  }

  async function onDeleteDraft(wo: WoRow) {
    if (!deleteDraftWorkOrderAction || releasingId || deletingId) return;
    if (!window.confirm(labels.confirmDeleteDraft.replace('{wo}', wo.woNumber))) return;
    setDeletingId(wo.id);
    setRowError(null);
    try {
      const result = await deleteDraftWorkOrderAction({ id: wo.id });
      if (!result.ok) {
        setRowError({ id: wo.id, message: labels.releaseError[result.error] ?? labels.releaseError.persistence_failed });
        setDeletingId(null);
        return;
      }
      router.refresh();
    } catch {
      setRowError({ id: wo.id, message: labels.releaseError.persistence_failed });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="wo-list-view">
      {createNotice ? (
        <div role="status" data-testid="wo-list-create-notice" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {createNotice}
        </div>
      ) : null}
      {/* Header action */}
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={searchDraft}
          data-testid="wo-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearchDraft(e.target.value)}
          className="w-72"
        />
        <div className="flex items-center gap-2">
          {/* Bulk WO import (CSV) preview → confirm screen. */}
          <Link
            href={`${basePath}/import`}
            prefetch={false}
            data-testid="wo-list-bulk-import"
            className="btn btn--secondary"
          >
            {labels.bulkImportLabel}
          </Link>
          <Button
            type="button"
            className="btn--primary"
            data-testid="wo-list-create"
            onClick={() => setCreateOpen(true)}
          >
            + {labels.createWo}
          </Button>
        </div>
      </div>

      {/* Status tabs + Archive tab.
          Status tabs are client filters over the active (non-archived) dataset; the
          Archive tab is a server re-fetch (link → ?archived=1) since archived rows are
          excluded from the active fetch. */}
      <div role="tablist" aria-label={labels.tabs.all} data-testid="wo-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) =>
          archived ? (
            <Link
              key={key}
              href={key === 'all' ? basePath : `${basePath}?status=${key}`}
              prefetch={false}
              role="tab"
              aria-selected={false}
              data-testid={`wo-list-tab-${key}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {labels.tabs[key]}
            </Link>
          ) : (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              data-testid={`wo-list-tab-${key}`}
              onClick={() => navigate({ status: key === 'all' ? '' : key })}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium',
                activeTab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {labels.tabs[key]}
              <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">
                {tabCount(key)}
              </span>
            </button>
          ),
        )}
        <Link
          href={`${basePath}?archived=1`}
          prefetch={false}
          role="tab"
          aria-selected={archived}
          data-testid="wo-list-tab-archive"
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium',
            archived ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {labels.tabArchive}
          <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">
            {archivedCount}
          </span>
        </Link>
        <span className="ml-auto self-center text-xs text-slate-500" data-testid="wo-list-rows-count">
          {labels.rowsCount.replace('{n}', String(pagination.total))}
        </span>
      </div>

      {archived ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="wo-list-archived-hint">
          <span>{labels.archivedHint}</span>
          <Link href={basePath} prefetch={false} data-testid="wo-list-back-active" className="font-medium text-blue-700 hover:underline">
            {labels.backToActive}
          </Link>
        </div>
      ) : null}

      {/* Table / empty */}
      {workOrders.length === 0 ? (
        <EmptyState
          icon="📋"
          title={labels.empty.title}
          body={labels.empty.body}
          action={{
            label: labels.empty.clear,
            onClick: () => navigate({ status: '', search: '' }),
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="wo-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.wo}</th>
                <th className="px-3 py-2">{labels.columns.product}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2 text-right">{labels.columns.qty}</th>
                <th className="px-3 py-2">{labels.columns.scheduled}</th>
                <th className="px-3 py-2">{labels.columns.line}</th>
                <th className="px-3 py-2">{labels.columns.bom}</th>
                <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => {
                const lineLabel = resources.lines.find((l) => l.id === wo.productionLineId)?.code;
                return (
                  <tr key={wo.id} data-testid={`wo-row-${wo.id}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/${locale}/planning/work-orders/${wo.id}`}
                        prefetch={false}
                        className="font-mono font-semibold text-blue-700 hover:underline"
                        data-testid={`wo-link-${wo.id}`}
                      >
                        {wo.woNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-slate-600">{wo.itemCode ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <WoStatusBadge status={wo.status} label={statusLabel(wo.status)} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {wo.plannedQuantity} {wo.uom}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{fmtDate(wo.scheduledStartTime, locale)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {lineLabel ?? <span className="text-slate-400">{labels.notAssigned}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {wo.materialCount > 0 ? (
                        <Badge variant="info">{labels.bomBadge}</Badge>
                      ) : (
                        <Badge variant="muted">{labels.noBomBadge}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {wo.status.toUpperCase() === 'DRAFT' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            className="btn--primary btn-sm"
                            data-testid={`wo-release-${wo.id}`}
                            disabled={releasingId === wo.id || deletingId === wo.id}
                            aria-busy={releasingId === wo.id}
                            onClick={() => onRelease(wo)}
                          >
                            {releasingId === wo.id ? labels.releasing : labels.release}
                          </Button>
                          {deleteDraftWorkOrderAction ? (
                            <Button
                              type="button"
                              className="btn--ghost btn-sm text-red-700 hover:bg-red-50"
                              data-testid={`wo-delete-draft-${wo.id}`}
                              disabled={releasingId === wo.id || deletingId === wo.id}
                              aria-busy={deletingId === wo.id}
                              onClick={() => onDeleteDraft(wo)}
                            >
                              {deletingId === wo.id ? labels.deletingDraft : labels.deleteDraft}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {rowError?.id === wo.id ? (
                        <div role="alert" data-testid={`wo-row-error-${wo.id}`} className="mt-1 text-xs text-red-600">
                          {rowError.message}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ListPaginationFooter
            shown={shown}
            total={pagination.total}
            previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
            nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
            labels={labels.pagination}
            testId="wo-list-pagination"
          />
        </div>
      )}

      <CreateWoModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        resources={resources}
        searchFgProductsAction={searchFgProductsAction}
        createWorkOrderAction={createWorkOrderAction}
        onCreated={(result) => {
          if (result.chain && result.chain.totalCount > 1) {
            const root = result.workOrder.woNumber;
            setCreateNotice(
              labels.create.chainCreatedWarning
                ? labels.create.chainCreatedWarning
                    .replace('{count}', String(result.chain.totalCount))
                    .replace('{root}', root)
                : `${result.chain.totalCount} work orders created — root ${root}.`,
            );
          }
          router.refresh();
        }}
        previewChainAction={previewChainAction}
      />
    </div>
  );
}
