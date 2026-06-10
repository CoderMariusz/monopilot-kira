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
import type { ListPlanningWorkOrdersResult, CreateWorkOrderResult, ReleaseWorkOrderResult } from '../_actions/shared';
import type { FgProductOption, ProductionResources, SearchFgProductsInput } from '../_actions/wo-form-data';

type WoRow = Extract<ListPlanningWorkOrdersResult, { ok: true }>['workOrders'][number];

const TAB_ORDER = ['all', 'DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const;
type TabKey = (typeof TAB_ORDER)[number];

export type WoListLabels = {
  createWo: string;
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
  empty: {
    title: string;
    body: string;
    clear: string;
  };
  releaseError: Record<string, string>;
  create: CreateWoLabels;
};

export type WoListViewProps = {
  locale: string;
  workOrders: WoRow[];
  resources: ProductionResources;
  labels: WoListLabels;
  /** Open the create modal immediately on mount (?new=1 deep-link). */
  autoOpenCreate?: boolean;
  searchFgProductsAction: (input: SearchFgProductsInput) => Promise<FgProductOption[]>;
  createWorkOrderAction: (params: {
    productId: string;
    itemCode: string;
    plannedQuantity: string;
    scheduledStartTime?: string;
    productionLineId?: string;
    machineId?: string;
    notes?: string;
  }) => Promise<CreateWorkOrderResult>;
  releaseWorkOrderAction: (params: { id: string }) => Promise<ReleaseWorkOrderResult>;
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
  resources,
  labels,
  autoOpenCreate = false,
  searchFgProductsAction,
  createWorkOrderAction,
  releaseWorkOrderAction,
}: WoListViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>('all');
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(autoOpenCreate);
  const [releasingId, setReleasingId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);

  const counts = React.useMemo(() => {
    const c: Record<TabKey, number> = { all: workOrders.length, DRAFT: 0, RELEASED: 0, IN_PROGRESS: 0, ON_HOLD: 0, COMPLETED: 0 };
    for (const wo of workOrders) {
      const k = wo.status.toUpperCase() as TabKey;
      if (k in c && k !== 'all') c[k] += 1;
    }
    return c;
  }, [workOrders]);

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (tab !== 'all' && wo.status.toUpperCase() !== tab) return false;
      if (!term) return true;
      return (
        wo.woNumber.toLowerCase().includes(term) ||
        (wo.itemCode ?? '').toLowerCase().includes(term)
      );
    });
  }, [workOrders, tab, search]);

  function statusLabel(status: string): string {
    const key = status.toLowerCase();
    return labels.status[key] ?? status;
  }

  async function onRelease(wo: WoRow) {
    if (releasingId) return;
    // Confirm gate (parity: release is a state transition — guarded).
    if (!window.confirm(labels.confirmRelease.replace('{wo}', wo.woNumber))) return;
    setReleasingId(wo.id);
    setRowError(null);
    try {
      const result = await releaseWorkOrderAction({ id: wo.id });
      if (!result.ok) {
        setRowError({ id: wo.id, message: labels.releaseError[result.error] ?? labels.releaseError.persistence_failed });
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

  return (
    <div className="flex flex-col gap-4" data-testid="wo-list-view">
      {/* Header action */}
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          value={search}
          data-testid="wo-list-search"
          placeholder={labels.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Button
          type="button"
          className="btn--primary"
          data-testid="wo-list-create"
          onClick={() => setCreateOpen(true)}
        >
          + {labels.createWo}
        </Button>
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label={labels.tabs.all} data-testid="wo-list-tabs" className="flex flex-wrap gap-2">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`wo-list-tab-${key}`}
            onClick={() => setTab(key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {labels.tabs[key]}
            <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">
              {counts[key]}
            </span>
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-500" data-testid="wo-list-rows-count">
          {labels.rowsCount.replace('{n}', String(visible.length))}
        </span>
      </div>

      {/* Table / empty */}
      {visible.length === 0 ? (
        <EmptyState
          icon="📋"
          title={labels.empty.title}
          body={labels.empty.body}
          action={{
            label: labels.empty.clear,
            onClick: () => {
              setSearch('');
              setTab('all');
            },
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
              {visible.map((wo) => {
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
                        <Button
                          type="button"
                          className="btn--primary btn-sm"
                          data-testid={`wo-release-${wo.id}`}
                          disabled={releasingId === wo.id}
                          aria-busy={releasingId === wo.id}
                          onClick={() => onRelease(wo)}
                        >
                          {releasingId === wo.id ? labels.releasing : labels.release}
                        </Button>
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
        </div>
      )}

      <CreateWoModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.create}
        resources={resources}
        searchFgProductsAction={searchFgProductsAction}
        createWorkOrderAction={createWorkOrderAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
