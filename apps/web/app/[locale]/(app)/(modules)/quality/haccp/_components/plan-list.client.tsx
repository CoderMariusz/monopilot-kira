'use client';

/**
 * HACCP plan list (Wave E3, client island).
 *
 * Design-system conformance to the prototype QaHaccpPlans
 * (prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:3-106):
 *   - page actions: "＋ New HACCP Plan"                       → haccp-screens.jsx:18
 *   - plan rows with code, version, status dot/badge          → haccp-screens.jsx:26-41
 *   - draft → "🔒 Approve Plan" (e-sign) / active → versioned  → haccp-screens.jsx:54-60
 *
 * DEVIATION (documented per UI-PROTOTYPE-PARITY-POLICY.md): the prototype's
 * two-pane tree + inline plan-detail layout (haccp-screens.jsx:22-103) is
 * rendered here as a flat list TABLE whose rows link to a dedicated detail route
 * (/quality/haccp/[id]). The plan NAME / scope / version / status / #CCP are
 * surfaced; the plan `id` is a routing key only and is NEVER rendered as text
 * (rule 0.11 — no raw UUIDs).
 *
 * Presentational + owns ONLY the create/activate modal open-state and the
 * transient "new version" error/result. No data fetching, no permission logic
 * (both resolved server-side); the actions are passed in as props. `canEdit`
 * (resolved SERVER-side — never client-trusted; the actions re-check) gates
 * [+ New plan] / [Activate] / [New version]: disabled + tooltip when absent
 * (rule 0.13c). `router.refresh()` re-reads the server list after a mutation.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import type {
  ActivatePlanAction,
  HaccpPlanStatus,
  NewPlanVersionAction,
  PlanListRow,
  UpsertPlanAction,
} from './haccp-contracts';
import type { PlanListLabels, PlanCreateLabels, PlanActivateLabels } from './labels';
import { PlanCreateModal } from './plan-create-modal.client';
import { PlanActivateModal, type PlanActivateTarget } from './plan-activate-modal.client';

const STATUS_VARIANT: Record<HaccpPlanStatus, BadgeVariant> = {
  draft: 'muted',
  active: 'success',
  superseded: 'secondary',
};

export function PlanListClient({
  rows,
  labels,
  createLabels,
  activateLabels,
  locale,
  canEdit,
  upsertPlanAction,
  activatePlanAction,
  newPlanVersionAction,
}: {
  rows: PlanListRow[];
  labels: PlanListLabels;
  createLabels: PlanCreateLabels;
  activateLabels: PlanActivateLabels;
  locale: string;
  /** holds quality.haccp.plan_edit (resolved SERVER-side; the actions re-check). */
  canEdit: boolean;
  upsertPlanAction: UpsertPlanAction;
  activatePlanAction: ActivatePlanAction;
  newPlanVersionAction: NewPlanVersionAction;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<PlanActivateTarget | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versioningId, setVersioningId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function scopeLabel(row: PlanListRow): string {
    return labels.scopeValue
      .replace('{type}', labels.scopeType[row.scopeType])
      .replace('{ref}', row.scopeRef ?? '—');
  }

  function handleCreated() {
    router.refresh();
  }

  function handleActivated() {
    setActivateTarget(null);
    router.refresh();
  }

  function startNewVersion(row: PlanListRow) {
    setVersionError(null);
    setVersioningId(row.id);
    startTransition(async () => {
      const result = await newPlanVersionAction(row.id);
      setVersioningId(null);
      if (!result.ok) {
        setVersionError(labels.newVersionError.replace('{message}', result.message ?? result.reason));
        return;
      }
      // The new draft version now exists — re-read the list to surface it.
      router.refresh();
    });
  }

  const createModal = canEdit ? (
    <PlanCreateModal
      open={createOpen}
      onOpenChange={setCreateOpen}
      labels={createLabels}
      upsertPlanAction={upsertPlanAction}
      onSaved={handleCreated}
    />
  ) : null;

  const activateModal =
    canEdit && activateTarget ? (
      <PlanActivateModal
        open={Boolean(activateTarget)}
        onOpenChange={(o) => {
          if (!o) setActivateTarget(null);
        }}
        plan={activateTarget}
        labels={activateLabels}
        activatePlanAction={activatePlanAction}
        onActivated={handleActivated}
      />
    ) : null;

  // EMPTY state — no plans defined: CTA opens the create modal (gated on plan_edit).
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <button
            type="button"
            data-testid="haccp-plan-new"
            disabled={!canEdit}
            title={canEdit ? undefined : labels.newPlanDisabled}
            onClick={() => setCreateOpen(true)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium text-white transition',
              canEdit ? 'bg-slate-900 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300',
            ].join(' ')}
          >
            + {labels.newPlan}
          </button>
        </div>
        <div
          data-testid="haccp-plan-empty"
          data-state="empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
        >
          <span className="text-base font-semibold text-slate-700">{labels.empty.title}</span>
          <span className="max-w-md text-sm text-slate-500">{labels.empty.body}</span>
          <button
            type="button"
            data-testid="haccp-plan-empty-cta"
            disabled={!canEdit}
            title={canEdit ? undefined : labels.empty.ctaDisabled}
            onClick={() => setCreateOpen(true)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium text-white transition',
              canEdit ? 'bg-slate-900 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300',
            ].join(' ')}
          >
            {labels.empty.cta}
          </button>
        </div>
        {createModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-testid="haccp-plan-new"
          disabled={!canEdit}
          title={canEdit ? undefined : labels.newPlanDisabled}
          onClick={() => setCreateOpen(true)}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium text-white transition',
            canEdit ? 'bg-slate-900 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300',
          ].join(' ')}
        >
          + {labels.newPlan}
        </button>
      </div>

      {versionError && (
        <p role="alert" data-testid="haccp-plan-version-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {versionError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table aria-label={labels.table.ariaLabel} data-testid="haccp-plan-table" data-state="data" className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2 font-medium">{labels.table.name}</th>
              <th scope="col" className="px-4 py-2 font-medium">{labels.table.scope}</th>
              <th scope="col" className="px-4 py-2 font-medium">{labels.table.version}</th>
              <th scope="col" className="px-4 py-2 font-medium">{labels.table.status}</th>
              <th scope="col" className="px-4 py-2 font-medium">{labels.table.ccps}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{labels.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isDraft = row.status === 'draft';
              const isActive = row.status === 'active';
              const busyVersion = versioningId === row.id && pending;
              return (
                <tr key={row.id} data-testid={`haccp-plan-row-${row.id}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/quality/haccp/${row.id}`}
                      prefetch={false}
                      data-testid={`haccp-plan-name-${row.id}`}
                      className="font-medium text-slate-900 hover:text-sky-700 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{scopeLabel(row)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700" data-testid={`haccp-plan-version-${row.id}`}>v{row.version}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status]} data-testid={`haccp-plan-status-${row.id}`}>
                      {labels.status[row.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700" data-testid={`haccp-plan-ccps-${row.id}`}>
                    {labels.ccpsValue.replace('{count}', String(row.ccpCount))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/${locale}/quality/haccp/${row.id}`}
                        prefetch={false}
                        data-testid={`haccp-plan-view-${row.id}`}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {labels.view}
                      </Link>
                      {isDraft && (
                        <button
                          type="button"
                          data-testid={`haccp-plan-activate-${row.id}`}
                          disabled={!canEdit}
                          title={canEdit ? undefined : labels.activateDisabled}
                          onClick={() =>
                            setActivateTarget({
                              id: row.id,
                              name: row.name,
                              scopeLabel: scopeLabel(row),
                              version: row.version,
                            })
                          }
                          className={[
                            'rounded-md px-2.5 py-1 text-xs font-medium transition',
                            canEdit
                              ? 'bg-indigo-700 text-white hover:bg-indigo-800'
                              : 'cursor-not-allowed bg-slate-200 text-slate-400',
                          ].join(' ')}
                        >
                          {labels.activate}
                        </button>
                      )}
                      {isActive && (
                        <button
                          type="button"
                          data-testid={`haccp-plan-newversion-${row.id}`}
                          disabled={!canEdit || busyVersion}
                          title={canEdit ? undefined : labels.newVersionDisabled}
                          onClick={() => startNewVersion(row)}
                          className={[
                            'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                            canEdit && !busyVersion
                              ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                              : 'cursor-not-allowed border-slate-200 text-slate-400',
                          ].join(' ')}
                        >
                          {labels.newVersion}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {createModal}
      {activateModal}
    </div>
  );
}
