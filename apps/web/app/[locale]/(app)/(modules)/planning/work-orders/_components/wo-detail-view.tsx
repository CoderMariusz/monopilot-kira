'use client';

/**
 * P2-PLANNING — Work Order detail (planning view, client tabs).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   wo-detail.jsx:4-588 (plan_wo_detail):
 *     header (code/name/status/priority + summary bar) → wo-detail.jsx:24-89
 *     tab bar (7 tabs)                                 → wo-detail.jsx:107-115
 *     Overview (materials + operations)                → wo-detail.jsx:130-267
 *     Outputs (schedule_outputs)                       → wo-detail.jsx:270-317
 *     Dependencies (list view)                         → wo-detail.jsx:321-401
 *     Reservations                                     → wo-detail.jsx:405-447
 *     Sequencing                                       → wo-detail.jsx:451-525
 *     History (status_history)                         → wo-detail.jsx:529-558
 *     D365 sync                                        → wo-detail.jsx:561-585
 *
 * Honest data policy: getPlanningWorkOrder (the reviewed action) returns header +
 * materials + operations + schedules + dependencies + statusHistory. It does NOT
 * return reservations, sequencing-queue, the cascade DAG, or D365 sync info — those
 * tables/feeds aren't live. The Reservations / Sequencing / D365 tabs therefore
 * render an honest "not live yet" panel (same pattern as the planning dashboard's
 * PO/TO placeholders) instead of inventing rows. Dependencies renders real rows
 * when present, empty-state otherwise (the DAG graph view is deferred — no source).
 *
 * UI states: loading/error/permission-denied resolved by the RSC page; here the
 * detail is always for a successfully-loaded WO. No client-trusted permissions.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@monopilot/ui/Tabs';

import { WoStatusBadge } from './wo-status-badge';
import { EditWoModal, type EditWoLabels, type EditWoResult } from './edit-wo-modal';
import type { DeleteDraftWorkOrderResult, GetPlanningWorkOrderResult, CancelWorkOrderChainResult } from '../_actions/shared';
import type { FgProductOption, ProductionResources, SearchFgProductsInput } from '../_actions/wo-form-data';

type Wo = Extract<GetPlanningWorkOrderResult, { ok: true }>['workOrder'];

export type WoDetailLabels = {
  status: Record<string, string>;
  summary: {
    product: string;
    qty: string;
    scheduledStart: string;
    scheduledEnd: string;
    line: string;
    priority: string;
    source: string;
  };
  tabs: {
    overview: string;
    outputs: string;
    dependencies: string;
    reservations: string;
    sequencing: string;
    history: string;
    d365: string;
  };
  materials: { title: string; seq: string; name: string; required: string; source: string; empty: string };
  operations: { title: string; seq: string; op: string; expDur: string; expYield: string; status: string; empty: string };
  outputs: { title: string; role: string; product: string; planned: string; allocation: string; disposition: string; empty: string };
  dependencies: { title: string; direction: string; wo: string; requiredQty: string; materialLink: string; empty: string };
  history: { title: string; from: string; to: string; timestamp: string; user: string; action: string; empty: string };
  notLive: {
    reservations: string;
    sequencing: string;
    d365: string;
  };
  minutes: string;
  /** Wave R1 reversibility — DRAFT-only Edit affordance. */
  edit?: {
    editButton: string;
    modal: EditWoLabels;
  };
  deleteDraft?: {
    button: string;
    pending: string;
    confirm: string;
    error: string;
  };
  cancelChain?: {
    button: string;
    pending: string;
    confirm: string;
    error: string;
    blocked: string;
  };
};

function fmtTs(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

function NotLivePanel({ message, testId }: { message: string; testId: string }) {
  return (
    <div
      role="note"
      data-testid={testId}
      className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
    >
      <div className="mb-2 text-3xl opacity-30" aria-hidden>
        ⇅
      </div>
      {message}
    </div>
  );
}

export function WoDetailView({
  workOrder,
  labels,
  locale,
  resources,
  searchFgProductsAction,
  updateWorkOrderAction,
  deleteDraftWorkOrderAction,
  cancelWorkOrderChainAction,
}: {
  workOrder: Wo;
  labels: WoDetailLabels;
  locale: string;
  /** Wave R1 edit seams — only used when status === 'DRAFT'. Optional so legacy
   *  callers keep type-checking. */
  resources?: ProductionResources;
  searchFgProductsAction?: (input: SearchFgProductsInput) => Promise<FgProductOption[]>;
  updateWorkOrderAction?: (params: {
    id: string;
    productId?: string;
    plannedQuantity?: string;
    scheduledStartTime?: string | null;
    productionLineId?: string | null;
    notes?: string;
  }) => Promise<EditWoResult>;
  deleteDraftWorkOrderAction?: (params: { id: string }) => Promise<DeleteDraftWorkOrderResult>;
  cancelWorkOrderChainAction?: (params: { id: string }) => Promise<CancelWorkOrderChainResult>;
}) {
  const router = useRouter();
  const wo = workOrder;
  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;

  // UUID→name: the summary "Line" field must show the production-line CODE (parity:
  // wo-detail.jsx:60 renders {w.lineCode}, and the WO list view already resolves the
  // id via resources.lines). Without this the raw production_line_id UUID leaked into
  // the summary. Honest fallback: the id itself when the line isn't in the loaded
  // resources (e.g. a deactivated line), and '—' when the WO has no line.
  const lineLabel = wo.productionLineId
    ? resources?.lines.find((l) => l.id === wo.productionLineId)?.code ?? wo.productionLineId
    : '—';

  // Wave R1 — DRAFT edit affordance. Gated on status===DRAFT AND the seams wired.
  // Keep the wiring checks INLINE on the render guard below so TS narrows the
  // optional seams; `canEdit` only carries the status + label presence.
  const isDraft = wo.status.toUpperCase() === 'DRAFT';
  const isReleased = wo.status.toUpperCase() === 'RELEASED';
  const hasChain = wo.dependencies.length > 0;
  const canCancelChain =
    hasChain
    && (isDraft || isReleased)
    && !!labels.cancelChain
    && !!cancelWorkOrderChainAction;
  const canEdit = isDraft && !!labels.edit;
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [cancellingChain, setCancellingChain] = React.useState(false);
  const [cancelChainError, setCancelChainError] = React.useState<string | null>(null);

  async function onDeleteDraft() {
    if (!deleteDraftWorkOrderAction || deleting) return;
    if (!window.confirm((labels.deleteDraft?.confirm ?? '').replace('{wo}', wo.woNumber))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteDraftWorkOrderAction({ id: wo.id });
      if (!result.ok) {
        setDeleteError(labels.deleteDraft?.error ?? result.error);
        setDeleting(false);
        return;
      }
      router.push(`/${locale}/planning/work-orders`);
      router.refresh();
    } catch {
      setDeleteError(labels.deleteDraft?.error ?? 'persistence_failed');
    } finally {
      setDeleting(false);
    }
  }

  async function onCancelChain() {
    if (!cancelWorkOrderChainAction || cancellingChain) return;
    const confirmText = (labels.cancelChain?.confirm ?? '').replace('{wo}', wo.woNumber);
    if (!window.confirm(confirmText)) return;
    setCancellingChain(true);
    setCancelChainError(null);
    try {
      const result = await cancelWorkOrderChainAction({ id: wo.id });
      if (!result.ok) {
        const map = labels.cancelChain as Record<string, string> | undefined;
        setCancelChainError(
          result.error === 'chain_cancel_blocked'
            ? map?.blocked ?? labels.cancelChain?.error ?? result.error
            : map?.error ?? labels.cancelChain?.error ?? result.error,
        );
        setCancellingChain(false);
        return;
      }
      router.push(`/${locale}/planning/work-orders`);
      router.refresh();
    } catch {
      setCancelChainError(labels.cancelChain?.error ?? 'persistence_failed');
    } finally {
      setCancellingChain(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="wo-detail-view" data-prototype-label="plan_wo_detail">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-lg font-semibold text-slate-900">{wo.woNumber}</span>
        <WoStatusBadge status={wo.status} label={statusLabel(wo.status)} />
        <Badge variant="outline">{wo.priority}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && updateWorkOrderAction && searchFgProductsAction && resources && labels.edit ? (
            <Button type="button" className="btn--secondary btn-sm" data-testid="wo-edit-order" onClick={() => setEditOpen(true)}>
              {labels.edit.editButton}
            </Button>
          ) : null}
          {canCancelChain ? (
            <Button
              type="button"
              className="btn--ghost btn-sm text-amber-800 hover:bg-amber-50"
              data-testid="wo-cancel-chain"
              disabled={cancellingChain}
              aria-busy={cancellingChain}
              onClick={onCancelChain}
            >
              {cancellingChain ? labels.cancelChain!.pending : labels.cancelChain!.button}
            </Button>
          ) : null}
          {isDraft && labels.deleteDraft && deleteDraftWorkOrderAction ? (
            <Button
              type="button"
              className="btn--ghost btn-sm text-red-700 hover:bg-red-50"
              data-testid="wo-delete-draft"
              disabled={deleting}
              aria-busy={deleting}
              onClick={onDeleteDraft}
            >
              {deleting ? labels.deleteDraft.pending : labels.deleteDraft.button}
            </Button>
          ) : null}
        </div>
      </div>

      {cancelChainError ? (
        <div role="alert" data-testid="wo-cancel-chain-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {cancelChainError}
        </div>
      ) : null}

      {deleteError ? (
        <div role="alert" data-testid="wo-delete-draft-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </div>
      ) : null}

      {canEdit && updateWorkOrderAction && searchFgProductsAction && resources && labels.edit ? (
        <EditWoModal
          open={editOpen}
          onOpenChange={setEditOpen}
          labels={labels.edit.modal}
          resources={resources}
          initial={{
            id: wo.id,
            productId: wo.productId,
            itemCode: wo.itemCode,
            productName: null,
            uomBase: wo.uom,
            plannedQuantity: wo.plannedQuantity,
            scheduledStartTime: wo.scheduledStartTime,
            productionLineId: wo.productionLineId,
            notes: wo.notes,
          }}
          searchFgProductsAction={searchFgProductsAction}
          updateWorkOrderAction={updateWorkOrderAction}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {/* Summary bar */}
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm sm:grid-cols-4 lg:grid-cols-7" data-testid="wo-detail-summary">
        {(
          [
            [labels.summary.product, wo.itemCode ?? '—'],
            [labels.summary.qty, `${wo.plannedQuantity} ${wo.uom}`],
            [labels.summary.scheduledStart, fmtTs(wo.scheduledStartTime, locale)],
            [labels.summary.scheduledEnd, fmtTs(wo.scheduledEndTime, locale)],
            [labels.summary.line, lineLabel],
            [labels.summary.priority, wo.priority],
            [labels.summary.source, wo.sourceOfDemand],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="font-mono text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList data-testid="wo-detail-tabs" className="flex flex-wrap gap-2">
          <TabsTrigger value="overview" data-testid="wo-tab-overview">{labels.tabs.overview}</TabsTrigger>
          <TabsTrigger value="outputs" data-testid="wo-tab-outputs">
            {labels.tabs.outputs} <span className="ml-1 text-xs opacity-60">{wo.schedules.length}</span>
          </TabsTrigger>
          <TabsTrigger value="dependencies" data-testid="wo-tab-dependencies">
            {labels.tabs.dependencies} <span className="ml-1 text-xs opacity-60">{wo.dependencies.length}</span>
          </TabsTrigger>
          <TabsTrigger value="reservations" data-testid="wo-tab-reservations">{labels.tabs.reservations}</TabsTrigger>
          <TabsTrigger value="sequencing" data-testid="wo-tab-sequencing">{labels.tabs.sequencing}</TabsTrigger>
          <TabsTrigger value="history" data-testid="wo-tab-history">
            {labels.tabs.history} <span className="ml-1 text-xs opacity-60">{wo.statusHistory.length}</span>
          </TabsTrigger>
          <TabsTrigger value="d365" data-testid="wo-tab-d365">{labels.tabs.d365}</TabsTrigger>
        </TabsList>

        {/* Overview — materials + operations */}
        <TabsContent value="overview" data-testid="wo-panel-overview" className="flex flex-col gap-4 pt-3">
          <section className="rounded-xl border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{labels.materials.title}</h3>
            {wo.materials.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400" data-testid="wo-materials-empty">{labels.materials.empty}</p>
            ) : (
              <table className="w-full text-sm" data-testid="wo-materials-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">{labels.materials.seq}</th>
                    <th className="px-4 py-2">{labels.materials.name}</th>
                    <th className="px-4 py-2 text-right">{labels.materials.required}</th>
                    <th className="px-4 py-2">{labels.materials.source}</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.materials.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-mono">{m.sequence}</td>
                      <td className="px-4 py-2">{m.materialName}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{m.requiredQty} {m.uom}</td>
                      <td className="px-4 py-2"><Badge variant="muted">{m.materialSource}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-xl border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{labels.operations.title}</h3>
            {wo.operations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400" data-testid="wo-operations-empty">{labels.operations.empty}</p>
            ) : (
              <table className="w-full text-sm" data-testid="wo-operations-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">{labels.operations.seq}</th>
                    <th className="px-4 py-2">{labels.operations.op}</th>
                    <th className="px-4 py-2 text-right">{labels.operations.expDur}</th>
                    <th className="px-4 py-2 text-right">{labels.operations.expYield}</th>
                    <th className="px-4 py-2">{labels.operations.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.operations.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-mono">{o.sequence}</td>
                      <td className="px-4 py-2">{o.operationName}</td>
                      <td className="px-4 py-2 text-right font-mono">{o.expectedDurationMinutes ?? '—'} {labels.minutes}</td>
                      <td className="px-4 py-2 text-right font-mono">{o.expectedYieldPercent ?? '—'}%</td>
                      <td className="px-4 py-2"><Badge variant="muted">{o.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>

        {/* Outputs — schedule_outputs */}
        <TabsContent value="outputs" data-testid="wo-panel-outputs" className="pt-3">
          <section className="rounded-xl border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{labels.outputs.title}</h3>
            {wo.schedules.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400" data-testid="wo-outputs-empty">{labels.outputs.empty}</p>
            ) : (
              <table className="w-full text-sm" data-testid="wo-outputs-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">{labels.outputs.role}</th>
                    <th className="px-4 py-2 text-right">{labels.outputs.planned}</th>
                    <th className="px-4 py-2 text-right">{labels.outputs.allocation}</th>
                    <th className="px-4 py-2">{labels.outputs.disposition}</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.schedules.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-2"><Badge variant="info">{s.outputRole}</Badge></td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{s.expectedQty} {s.uom}</td>
                      <td className="px-4 py-2 text-right font-mono">{s.allocationPct}%</td>
                      <td className="px-4 py-2"><Badge variant="muted">{s.disposition}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>

        {/* Dependencies */}
        <TabsContent value="dependencies" data-testid="wo-panel-dependencies" className="pt-3">
          <section className="rounded-xl border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{labels.dependencies.title}</h3>
            {wo.dependencies.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400" data-testid="wo-dependencies-empty">{labels.dependencies.empty}</p>
            ) : (
              <table className="w-full text-sm" data-testid="wo-dependencies-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">{labels.dependencies.direction}</th>
                    <th className="px-4 py-2">{labels.dependencies.wo}</th>
                    <th className="px-4 py-2 text-right">{labels.dependencies.requiredQty}</th>
                    <th className="px-4 py-2">{labels.dependencies.materialLink}</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.dependencies.map((d) => {
                    const isParent = d.parentWoId === wo.id;
                    return (
                      <tr key={d.id} className="border-t border-slate-100">
                        <td className="px-4 py-2">
                          <Badge variant="info">{isParent ? 'downstream' : 'upstream'}</Badge>
                        </td>
                        <td className="px-4 py-2 font-mono text-blue-700">{isParent ? d.childWoId.slice(0, 8) : d.parentWoId.slice(0, 8)}</td>
                        <td className="px-4 py-2 text-right font-mono">{d.requiredQty ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-xs">{d.materialLink ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>

        {/* Reservations — no live source */}
        <TabsContent value="reservations" data-testid="wo-panel-reservations" className="pt-3">
          <NotLivePanel message={labels.notLive.reservations} testId="wo-reservations-not-live" />
        </TabsContent>

        {/* Sequencing — no live source */}
        <TabsContent value="sequencing" data-testid="wo-panel-sequencing" className="pt-3">
          <NotLivePanel message={labels.notLive.sequencing} testId="wo-sequencing-not-live" />
        </TabsContent>

        {/* History — wo_status_history */}
        <TabsContent value="history" data-testid="wo-panel-history" className="pt-3">
          <section className="rounded-xl border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{labels.history.title}</h3>
            {wo.statusHistory.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400" data-testid="wo-history-empty">{labels.history.empty}</p>
            ) : (
              <table className="w-full text-sm" data-testid="wo-history-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">{labels.history.from}</th>
                    <th className="px-4 py-2">{labels.history.to}</th>
                    <th className="px-4 py-2">{labels.history.timestamp}</th>
                    <th className="px-4 py-2">{labels.history.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.statusHistory.map((h) => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{h.fromStatus ? statusLabel(h.fromStatus) : '—'}</td>
                      <td className="px-4 py-2">{statusLabel(h.toStatus)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{fmtTs(h.occurredAt, locale)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{h.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>

        {/* D365 — no live source */}
        <TabsContent value="d365" data-testid="wo-panel-d365" className="pt-3">
          <NotLivePanel message={labels.notLive.d365} testId="wo-d365-not-live" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
