'use client';

/**
 * HACCP plan detail (Wave E3, client island).
 *
 * Design-system conformance to the prototype QaHaccpPlans detail pane
 * (prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:44-103):
 *   - plan header card (code / family / version / status / approved-by)  → :45-61
 *   - the Critical-Control-Points heading + CCP count                     → :63
 *   - per-CCP rows: code, step, hazard badge, critical limits, frequency  → :65-101
 *   - draft → "🔒 Approve Plan" (e-sign) action                           → :58
 *
 * DEVIATION (documented per UI-PROTOTYPE-PARITY-POLICY.md): the prototype's
 * recent-readings sparkline (haccp-screens.jsx:88-97) is OMITTED — readings live
 * on the parallel /quality/ccp-monitoring board; this detail screen owns the
 * plan ↔ CCP definition relationship only. The CCP grid is rendered as a table.
 *
 * Presentational + owns ONLY the add-CCP / activate modal open-state. No data
 * fetching, no permission logic (both resolved server-side). `canEdit` (holds
 * quality.haccp.plan_edit, resolved SERVER-side — never client-trusted; the
 * actions re-check) AND the plan being a DRAFT gate the [+ Add CCP] / [Activate]
 * controls: editing CCP limits is allowed only while the plan is a draft
 * (rule 0.13c — disabled + tooltip when locked). `router.refresh()` re-reads the
 * server plan after a mutation. The plan/CCP ids are routing keys only, NEVER
 * rendered as text (rule 0.11).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import type {
  ActivatePlanAction,
  DeactivateCcpAction,
  HaccpPlan,
  HaccpPlanStatus,
  HazardType,
  UpsertCcpAction,
} from '../../_components/haccp-contracts';
import type {
  PlanDetailLabels,
  PlanActivateLabels,
  CcpAddLabels,
  CcpRowActionsLabels,
} from '../../_components/labels';
import { formatLimit, type Translator } from '../../_components/labels';
import { CcpAddModal } from './ccp-add-modal.client';
import { CcpRowActions } from './ccp-row-actions.client';
import { PlanActivateModal } from '../../_components/plan-activate-modal.client';

const STATUS_VARIANT: Record<HaccpPlanStatus, BadgeVariant> = {
  draft: 'muted',
  active: 'success',
  superseded: 'secondary',
};

const HAZARD_VARIANT: Record<HazardType, BadgeVariant> = {
  biological: 'warning',
  chemical: 'info',
  physical: 'secondary',
  allergen: 'danger',
};

export function PlanDetailClient({
  plan,
  labels,
  ccpAddLabels,
  ccpRowActionsLabels,
  activateLabels,
  canEdit,
  upsertCcpAction,
  deactivateCcpAction,
  activatePlanAction,
  t,
}: {
  plan: HaccpPlan;
  labels: PlanDetailLabels;
  /** labels for the MODAL-CCP-ADD island (built once on the page). */
  ccpAddLabels: CcpAddLabels;
  /** labels for the per-row Edit/Deactivate island (built once on the page). */
  ccpRowActionsLabels: CcpRowActionsLabels;
  activateLabels: PlanActivateLabels;
  /** holds quality.haccp.plan_edit (resolved SERVER-side; the actions re-check). */
  canEdit: boolean;
  upsertCcpAction: UpsertCcpAction;
  deactivateCcpAction: DeactivateCcpAction;
  activatePlanAction: ActivatePlanAction;
  /** the same translator the labels were built from — used for {min}/{max} limit interpolation. */
  t: Translator;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);

  const isDraft = plan.status === 'draft';
  // Editing CCP limits (adding / editing / deactivating a CCP) is allowed ONLY
  // while the plan is a draft AND the user holds quality.haccp.plan_edit.
  const canAddCcp = canEdit && isDraft;
  // Per-row Edit/Deactivate actions render under the SAME gate as add (rule 0.13c).
  const showRowActions = canEdit && isDraft;
  const addDisabledReason = !canEdit ? labels.addCcpDisabled : labels.lockedHint;

  const scopeLabel = labels.scopeValue
    .replace('{type}', labels.scopeType[plan.scopeType])
    .replace('{ref}', plan.scopeRef ?? '—');

  const headerRows: Array<[string, React.ReactNode]> = [
    [labels.header.name, plan.name],
    [labels.header.scope, scopeLabel],
    [labels.header.version, <span key="v" className="font-mono">v{plan.version}</span>],
    [
      labels.header.status,
      <Badge key="s" variant={STATUS_VARIANT[plan.status]} data-testid="haccp-detail-status">
        {labels.status[plan.status]}
      </Badge>,
    ],
    [
      labels.header.approvedBy,
      plan.approvedAt ? (
        <span key="a" className="font-mono text-xs text-slate-600">
          {plan.approvedAt.slice(0, 10)}
        </span>
      ) : (
        <span key="a" className="text-slate-400">{labels.header.notApproved}</span>
      ),
    ],
    [labels.header.ccpCount, <span key="c" className="tabular-nums" data-testid="haccp-detail-ccp-count">{plan.ccps.length}</span>],
  ];

  function handleAdded() {
    router.refresh();
  }

  function handleActivated() {
    setActivateOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header actions. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isDraft && (
          <button
            type="button"
            data-testid="haccp-detail-activate"
            disabled={!canEdit}
            title={canEdit ? undefined : labels.activateDisabled}
            onClick={() => setActivateOpen(true)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              canEdit
                ? 'bg-indigo-700 text-white hover:bg-indigo-800'
                : 'cursor-not-allowed bg-slate-200 text-slate-400',
            ].join(' ')}
          >
            {labels.activate}
          </button>
        )}
        <button
          type="button"
          data-testid="haccp-detail-add-ccp"
          disabled={!canAddCcp}
          title={canAddCcp ? undefined : addDisabledReason}
          onClick={() => setAddOpen(true)}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium transition',
            canAddCcp ? 'bg-slate-900 text-white hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300 text-white',
          ].join(' ')}
        >
          + {labels.addCcp}
        </button>
      </div>

      {/* Plan header card (parity haccp-screens.jsx:45-61). */}
      <section
        data-testid="haccp-detail-header"
        aria-label={labels.header.title}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.header.title}</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {headerRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Critical Control Points. */}
      {plan.ccps.length === 0 ? (
        <div
          data-testid="haccp-detail-empty"
          data-state="empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
        >
          <span className="text-base font-semibold text-slate-700">{labels.empty.title}</span>
          <span className="max-w-md text-sm text-slate-500">{labels.empty.body}</span>
          <button
            type="button"
            data-testid="haccp-detail-empty-cta"
            disabled={!canAddCcp}
            title={canAddCcp ? undefined : addDisabledReason}
            onClick={() => setAddOpen(true)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium text-white transition',
              canAddCcp ? 'bg-slate-900 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300',
            ].join(' ')}
          >
            {labels.empty.cta}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table
            aria-label={labels.table.ariaLabel}
            data-testid="haccp-ccp-table"
            data-state="data"
            className="w-full text-sm"
          >
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium">{labels.table.code}</th>
                <th scope="col" className="px-4 py-2 font-medium">{labels.table.name}</th>
                <th scope="col" className="px-4 py-2 font-medium">{labels.table.step}</th>
                <th scope="col" className="px-4 py-2 font-medium">{labels.table.hazard}</th>
                <th scope="col" className="px-4 py-2 font-medium">{labels.table.limits}</th>
                <th scope="col" className="px-4 py-2 font-medium">{labels.table.frequency}</th>
                {showRowActions && (
                  <th
                    scope="col"
                    data-testid="haccp-ccp-actions-header"
                    className="px-4 py-2 text-right font-medium"
                  >
                    {labels.table.actions}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {plan.ccps.map((ccp) => (
                <tr key={ccp.id} data-testid={`haccp-ccp-row-${ccp.id}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-sky-700" data-testid={`haccp-ccp-code-${ccp.id}`}>
                    {ccp.ccpCode}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{ccp.name}</td>
                  <td className="px-4 py-3 text-slate-600">{ccp.processStep}</td>
                  <td className="px-4 py-3">
                    <Badge variant={HAZARD_VARIANT[ccp.hazardType]} data-testid={`haccp-ccp-hazard-${ccp.id}`}>
                      {labels.hazardType[ccp.hazardType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700" data-testid={`haccp-ccp-limit-${ccp.id}`}>
                    {formatLimit(t, ccp.criticalLimitMin, ccp.criticalLimitMax, ccp.unit)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{ccp.monitoringFrequency || '—'}</td>
                  {showRowActions && (
                    <td className="px-4 py-3 text-right" data-testid={`haccp-ccp-actions-${ccp.id}`}>
                      <CcpRowActions
                        ccp={ccp}
                        labels={ccpRowActionsLabels}
                        ccpAddLabels={ccpAddLabels}
                        upsertCcpAction={upsertCcpAction}
                        deactivateCcpAction={deactivateCcpAction}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <CcpAddModal
          open={addOpen}
          onOpenChange={setAddOpen}
          planId={plan.id}
          labels={ccpAddLabels}
          upsertCcpAction={upsertCcpAction}
          onSaved={handleAdded}
        />
      )}
      {canEdit && isDraft && (
        <PlanActivateModal
          open={activateOpen}
          onOpenChange={setActivateOpen}
          plan={{ id: plan.id, name: plan.name, scopeLabel, version: plan.version }}
          labels={activateLabels}
          activatePlanAction={activatePlanAction}
          onActivated={handleActivated}
        />
      )}
    </div>
  );
}
