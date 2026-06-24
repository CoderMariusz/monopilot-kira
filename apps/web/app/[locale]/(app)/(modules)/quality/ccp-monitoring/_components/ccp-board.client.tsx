'use client';

/**
 * CCP Monitoring board (Wave E3, client island).
 *
 * Design-system conformance to the CCP Monitoring prototype
 * (prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:108-226,
 * QaCcpMonitoring):
 *   - page actions: "+ Record reading"            → haccp-screens.jsx:140
 *   - KPI row: Active CCPs / Compliance / Devs     → haccp-screens.jsx:144-148
 *   - per-CCP card: code, hazard badge, critical
 *     limits, monitoring frequency, latest reading
 *     value + IN/OUT badge                         → haccp-screens.jsx:65-101 (CCP cards)
 *
 * The prototype's filter bar, timeline chart and full readings table
 * (haccp-screens.jsx:150-223) are a DEVIATION (deferred): the cheapest Wave-E3
 * slice surfaces a CCP board with the latest reading per CCP + the record
 * action, not the full historical timeline. No raw UUIDs — CCP CODE/name only.
 *
 * Presentational + owns ONLY the record-modal open state and the transient
 * "last recorded" banner. No data fetching, no permission logic (both resolved
 * server-side); the record action is passed in as a prop. `router.refresh()`
 * re-reads the server board after a successful record (re-derives latest
 * readings + statuses).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

import type { CcpBoardItem, RecordMonitoringAction, UpsertCcpAction } from './ccp-contracts';
import type { CcpBoardLabels, CcpRecordLabels, CcpCreateLabels } from './labels';
import { formatLimit } from './labels';
import { CcpRecordModal, type CcpRecordSuccess } from './ccp-record-modal.client';
import { CcpCreateModal } from './ccp-create-modal.client';

const STATUS_VARIANT: Record<CcpBoardItem['lastStatus'], BadgeVariant> = {
  in_limit: 'success',
  out_of_limit: 'danger',
  no_data: 'muted',
};

const HAZARD_VARIANT: Record<CcpBoardItem['hazardType'], BadgeVariant> = {
  biological: 'warning',
  chemical: 'info',
  physical: 'secondary',
  allergen: 'danger',
};

function statusLabel(item: CcpBoardItem, labels: CcpBoardLabels): string {
  if (item.lastStatus === 'in_limit') return labels.status.inLimit;
  if (item.lastStatus === 'out_of_limit') return labels.status.outOfLimit;
  return labels.status.noData;
}

export function CcpBoardClient({
  items,
  labels,
  recordLabels,
  createLabels,
  locale,
  recordMonitoringAction,
  upsertCcpAction,
  canEdit,
  setupHref,
}: {
  items: CcpBoardItem[];
  labels: CcpBoardLabels;
  recordLabels: CcpRecordLabels;
  createLabels: CcpCreateLabels;
  locale: string;
  recordMonitoringAction: RecordMonitoringAction;
  /** reviewed upsertCcp action (gated server-side on quality.haccp.plan_edit). */
  upsertCcpAction: UpsertCcpAction;
  /**
   * Whether the current user holds quality.haccp.plan_edit (resolved SERVER-SIDE
   * by the page — never client-trusted; the action re-checks). Gates the "Add CCP"
   * actions: disabled + tooltip when absent (rule 0.13c).
   */
  canEdit: boolean;
  /** href of the HACCP / quality landing screen (kept for legacy navigation, no longer the empty CTA). */
  setupHref: string;
}) {
  const router = useRouter();
  const t = useTranslations('quality.ccpMonitoring');
  const [recordOpen, setRecordOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastResult, setLastResult] = useState<CcpRecordSuccess | null>(null);

  const activeCount = items.length;
  const inLimitCount = items.filter((i) => i.lastStatus === 'in_limit').length;
  const outCount = items.filter((i) => i.lastStatus === 'out_of_limit').length;

  function handleRecorded(result: CcpRecordSuccess) {
    setLastResult(result);
    // Re-read the server board (latest reading + status per CCP). On a breach the
    // modal stays open to show the NCR link; an in-limit record closed the modal.
    router.refresh();
  }

  function handleCreated() {
    // Re-read the server board so the newly-created CCP appears (FIX 1).
    router.refresh();
  }

  // The create modal — mounted once, shared by the empty-state CTA and the header
  // "Add CCP" button. Only rendered for users who can edit the plan.
  const createModal = canEdit ? (
    <CcpCreateModal
      open={createOpen}
      onOpenChange={setCreateOpen}
      labels={createLabels}
      upsertCcpAction={upsertCcpAction}
      onSaved={handleCreated}
    />
  ) : null;

  // Empty state — no CCPs defined: CTA now OPENS the create modal (FIX 1), gated on
  // plan_edit (disabled + tooltip when absent, rule 0.13c).
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <button
            type="button"
            disabled
            data-testid="ccp-record-open"
            className="cursor-not-allowed rounded-md bg-slate-300 px-3 py-1.5 text-sm font-medium text-white"
          >
            + {labels.recordReading}
          </button>
        </div>
        <Card
          data-testid="ccp-board-empty"
          data-state="empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
        >
          <span className="text-base font-semibold text-slate-700">{labels.empty.title}</span>
          <span className="max-w-md text-sm text-slate-500">{labels.empty.body}</span>
          <button
            type="button"
            data-testid="ccp-board-empty-cta"
            disabled={!canEdit}
            title={canEdit ? undefined : labels.empty.ctaDisabled}
            onClick={() => setCreateOpen(true)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium text-white transition',
              canEdit
                ? 'bg-slate-900 hover:bg-slate-800'
                : 'cursor-not-allowed bg-slate-300',
            ].join(' ')}
          >
            {labels.empty.cta}
          </button>
        </Card>
        {createModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header actions — "Add CCP" (gated on plan_edit) + record reading. */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="ccp-create-open"
          disabled={!canEdit}
          title={canEdit ? undefined : labels.addCcpDisabled}
          onClick={() => setCreateOpen(true)}
          className={[
            'rounded-md border px-3 py-1.5 text-sm font-medium transition',
            canEdit
              ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
              : 'cursor-not-allowed border-slate-200 text-slate-400',
          ].join(' ')}
        >
          + {labels.addCcp}
        </button>
        <button
          type="button"
          data-testid="ccp-record-open"
          onClick={() => {
            setLastResult(null);
            setRecordOpen(true);
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + {labels.recordReading}
        </button>
      </div>

      {/* KPI summary (parity haccp-screens.jsx:144-148). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card data-testid="ccp-summary-active" className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{labels.summary.activeCcps}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{activeCount}</p>
          <p className="text-xs text-slate-400">{labels.summary.activeCcpsSub}</p>
        </Card>
        <Card data-testid="ccp-summary-inlimit" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{labels.summary.inLimit}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900">{inLimitCount}</p>
          <p className="text-xs text-emerald-700/70">{labels.summary.inLimitSub}</p>
        </Card>
        <Card
          data-testid="ccp-summary-outlimit"
          className={[
            'rounded-xl border p-4',
            outCount > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white',
          ].join(' ')}
        >
          <p className={['text-xs font-medium uppercase tracking-wide', outCount > 0 ? 'text-red-700' : 'text-slate-500'].join(' ')}>
            {labels.summary.outOfLimit}
          </p>
          <p className={['mt-1 text-2xl font-semibold tabular-nums', outCount > 0 ? 'text-red-900' : 'text-slate-950'].join(' ')}>
            {outCount}
          </p>
          <p className={['text-xs', outCount > 0 ? 'text-red-700/70' : 'text-slate-400'].join(' ')}>
            {labels.summary.outOfLimitSub}
          </p>
        </Card>
      </div>

      {lastResult?.kind === 'in_limit' && (
        <div
          role="status"
          data-testid="ccp-board-recorded-inlimit"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {recordLabels.success}
        </div>
      )}

      {/* CCP board — one card per CCP (parity haccp-screens.jsx:65-101 CCP cards). */}
      <ul
        aria-label={labels.board.ariaLabel}
        data-testid="ccp-board"
        data-state="data"
        className="grid grid-cols-1 gap-3 lg:grid-cols-2"
      >
        {items.map((item) => (
          <li key={item.id}>
            <Card
              data-testid={`ccp-card-${item.id}`}
              className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-sky-700" data-testid={`ccp-code-${item.id}`}>
                      {item.ccpCode}
                    </span>
                    <Badge variant={HAZARD_VARIANT[item.hazardType]} data-testid={`ccp-hazard-${item.id}`}>
                      {labels.hazardType[item.hazardType]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{item.name}</p>
                  <p className="truncate text-xs text-slate-500">{item.processStep}</p>
                </div>
                <Badge variant={STATUS_VARIANT[item.lastStatus]} data-testid={`ccp-status-${item.id}`}>
                  {statusLabel(item, labels)}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex flex-col">
                  <dt className="text-slate-400">{labels.board.criticalLimit}</dt>
                  <dd className="font-mono text-slate-700" data-testid={`ccp-limit-${item.id}`}>
                    {formatLimit(t, item.criticalLimitMin, item.criticalLimitMax, item.unit)}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-slate-400">{labels.board.frequency}</dt>
                  <dd className="text-slate-700">{item.monitoringFrequency || '—'}</dd>
                </div>
                <div className="col-span-2 flex flex-col">
                  <dt className="text-slate-400">{labels.board.lastReading}</dt>
                  <dd className="text-slate-700" data-testid={`ccp-last-${item.id}`}>
                    {item.lastValue !== null ? (
                      <span>
                        <span
                          className={[
                            'font-mono font-semibold',
                            item.lastStatus === 'out_of_limit' ? 'text-red-700' : 'text-slate-900',
                          ].join(' ')}
                        >
                          {item.lastValue} {item.unit}
                        </span>
                        {item.lastAt ? (
                          <span className="ml-2 font-mono text-[11px] text-slate-400">
                            {item.lastAt.slice(0, 16).replace('T', ' ')}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-slate-400">{labels.board.noReading}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          </li>
        ))}
      </ul>

      <CcpRecordModal
        open={recordOpen}
        onOpenChange={setRecordOpen}
        ccps={items}
        labels={recordLabels}
        locale={locale}
        recordMonitoringAction={recordMonitoringAction}
        onRecorded={handleRecorded}
      />
      {createModal}
    </div>
  );
}
