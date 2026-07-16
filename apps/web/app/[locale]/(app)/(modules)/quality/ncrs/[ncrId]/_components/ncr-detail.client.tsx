'use client';

/**
 * QA-009a — NCR detail (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   ncr-screens.jsx:186-352 (QaNcrDetail):
 *     sticky header + severity/status badges             → ncr-screens.jsx:198-214
 *     overdue alert banner                               → ncr-screens.jsx:216-221
 *     immutable closed/signed banner (21 CFR Part 11)    → ncr-screens.jsx:223-228
 *     NCR context card (type/severity/desc/detected/qty) → ncr-screens.jsx:233-251
 *     Investigation section (root cause / category /
 *       immediate action; editable while non-terminal,
 *       read-only once closed)                            → ncr-screens.jsx:266-280
 *     CAPA panel as the prototype's P2 placeholder        → ncr-screens.jsx:282-285
 *     sticky action bar + Close NCR (investigating)       → ncr-screens.jsx:287-296,320-323
 *     linked-records sidebar (hold → /quality/holds/<id>) → ncr-screens.jsx:307-313
 *     critical dual-sign reg note                         → ncr-screens.jsx:341-345
 *
 * RBAC: the close action re-checks server-side; a closed NCR renders the immutable
 * banner and NO actions (parity hard rule). The investigation save + close are
 * passed as props (imported from _actions, never authored here).
 *
 * DEVIATIONS (red-lines): the yield-details sub-card (ncr-screens.jsx:253-264),
 * the activity timeline (ncr-screens.jsx:327-339) and the draft→open / open→
 * investigating workflow transition buttons (ncr-screens.jsx:292-293,318-319) are
 * OUT OF SCOPE for this read/investigate/close slice; CAPA stays the P2 placeholder.
 * The PIN e-sign is the close modal's single account-password field (see
 * ncr-close-modal.client.tsx).
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select } from '@monopilot/ui/Select';

import { NcrCloseModal, type NcrCloseLabels } from './ncr-close-modal.client';
import {
  NCR_ROOT_CAUSE_CATEGORIES,
  type CloseNcrAction,
  type NcrDetail,
  type UpdateNcrInvestigationAction,
} from '../../_components/ncr-contracts';

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: 'danger',
  major: 'warning',
  minor: 'info',
};
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  open: 'warning',
  investigating: 'info',
  awaiting_capa: 'info',
  reopened: 'warning',
  closed: 'success',
  cancelled: 'muted',
};

const TERMINAL = new Set(['closed', 'cancelled']);

/** Formats a CCP critical limit (min / max / range / none) into a human string. */
function formatCriticalLimit(
  min: string | null,
  max: string | null,
  unit: string | null,
  labels: NcrDetailLabels['ccpBreach'],
): string {
  const u = unit ? ` ${unit}` : '';
  const withUnit = (value: string) => `${value}${u}`;
  if (min !== null && max !== null) {
    return labels.limitRange.replace('{min}', withUnit(min)).replace('{max}', withUnit(max));
  }
  if (min !== null) return labels.limitMin.replace('{value}', withUnit(min));
  if (max !== null) return labels.limitMax.replace('{value}', withUnit(max));
  return labels.limitNone;
}

export type NcrDetailLabels = {
  backToNcrs: string;
  overdueBanner: string;
  closedBanner: string;
  closedBannerSigned: string;
  closeNcr: string;
  downloadReport: string;
  header: { title: string; responseWindowCritical: string; responseWindowMajor: string };
  context: {
    detectedBy: string;
    detectedAt: string;
    location: string;
    product: string;
    affectedQty: string;
    responseDue: string;
    noProduct: string;
    kg: string;
  };
  investigation: {
    title: string;
    rootCause: string;
    rootCauseHelp: string;
    rootCausePlaceholder: string;
    rootCauseCategory: string;
    rootCauseCategoryPlaceholder: string;
    immediateAction: string;
    immediateActionPlaceholder: string;
    save: string;
    saving: string;
    saved: string;
    readOnly: string;
    error: string;
  };
  rootCauseCategories: Record<string, string>;
  capa: { title: string; badge: string; body: string };
  linked: { title: string; hold: string; reference: string; none: string };
  ccpBreach: {
    title: string;
    ccp: string;
    measuredValue: string;
    criticalLimit: string;
    limitMin: string;
    limitMax: string;
    limitRange: string;
    limitNone: string;
    measuredAt: string;
    recordedBy: string;
    noReading: string;
    none: string;
  };
  dualSign: string;
  severityValues: Record<string, string>;
  statusValues: Record<string, string>;
  typeValues: Record<string, string>;
  closeLabels: NcrCloseLabels;
};

export function NcrDetailClient({
  ncr,
  labels,
  locale,
  updateInvestigationAction,
  closeNcrAction,
}: {
  ncr: NcrDetail;
  labels: NcrDetailLabels;
  locale: string;
  updateInvestigationAction: UpdateNcrInvestigationAction;
  closeNcrAction: CloseNcrAction;
}) {
  const router = useRouter();
  const isClosed = TERMINAL.has(ncr.status);
  const isCritical = ncr.severity === 'critical';
  const canClose = !isClosed && ncr.status === 'investigating';

  const [rootCause, setRootCause] = useState(ncr.rootCause ?? '');
  const [rootCauseCategory, setRootCauseCategory] = useState<string>(ncr.rootCauseCategory ?? '');
  const [immediateAction, setImmediateAction] = useState(ncr.immediateAction ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSave] = useTransition();
  const [closeOpen, setCloseOpen] = useState(false);

  function saveInvestigation() {
    setSaveError(null);
    setSaved(false);
    startSave(async () => {
      const result = await updateInvestigationAction({
        ncrId: ncr.id,
        rootCause: rootCause.trim(),
        rootCauseCategory,
        immediateAction: immediateAction.trim(),
      });
      if (!result.ok) {
        setSaveError(labels.investigation.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header (parity ncr-screens.jsx:198-214). */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/${locale}/quality/ncrs`} data-testid="ncr-detail-back" className="text-sm text-sky-700 hover:underline">
          ← {labels.backToNcrs}
        </Link>
        <h1 className="font-mono text-xl font-semibold text-slate-950">{ncr.ncrNumber}</h1>
        <Badge variant={SEVERITY_VARIANT[ncr.severity] ?? 'muted'} data-testid="ncr-detail-severity">
          {labels.severityValues[ncr.severity] ?? ncr.severity}
        </Badge>
        <Badge variant={STATUS_VARIANT[ncr.status] ?? 'muted'} data-testid="ncr-detail-status">
          {labels.statusValues[ncr.status] ?? ncr.status}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {canClose && (
            <button
              type="button"
              data-testid="ncr-detail-close-open"
              onClick={() => setCloseOpen(true)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              🔒 {labels.closeNcr}
            </button>
          )}
          {isClosed && (
            <span data-testid="ncr-detail-download" className="text-sm text-slate-400">
              ⎙ {labels.downloadReport}
            </span>
          )}
        </div>
      </div>

      {/* Overdue alert (parity ncr-screens.jsx:216-221). */}
      {ncr.overdue && !isClosed && (
        <div
          role="alert"
          data-testid="ncr-detail-overdue"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span aria-hidden>⚠</span>
          <span>{labels.overdueBanner.replace('{due}', ncr.responseDueAt ?? '—')}</span>
        </div>
      )}

      {/* Immutable closed/signed banner (parity ncr-screens.jsx:223-228). */}
      {isClosed && (
        <div
          role="note"
          data-testid="ncr-detail-closed-banner"
          data-state="closed"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <span aria-hidden>🔒</span>
          <span>
            {labels.closedBanner.replace('{date}', ncr.closedAt ? ncr.closedAt.slice(0, 10) : '—')}
            {ncr.closureSignatureHash ? ` ${labels.closedBannerSigned}` : ''}
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* NCR context card (parity ncr-screens.jsx:233-251). */}
          <Card data-testid="ncr-detail-context" className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="muted" className="text-[10px]">{labels.typeValues[ncr.ncrType] ?? ncr.ncrType}</Badge>
              <Badge variant={SEVERITY_VARIANT[ncr.severity] ?? 'muted'}>
                {labels.severityValues[ncr.severity] ?? ncr.severity}
              </Badge>
              {ncr.severity === 'critical' && (
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {labels.header.responseWindowCritical}
                </span>
              )}
              {ncr.severity === 'major' && (
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {labels.header.responseWindowMajor}
                </span>
              )}
            </div>
            {ncr.title && <div className="text-sm font-semibold text-slate-900">{ncr.title}</div>}
            {ncr.description && <p className="mt-1 text-xs leading-relaxed text-slate-700">{ncr.description}</p>}
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-slate-500">{labels.context.detectedBy}:</dt>
                <dd className="text-slate-800" title={!ncr.detectedBy && ncr.detectedById ? ncr.detectedById : undefined}>
                  {ncr.detectedBy ?? '—'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">{labels.context.detectedAt}:</dt>
                <dd className="font-mono text-slate-800">{ncr.detectedAt ? ncr.detectedAt.slice(0, 16).replace('T', ' ') : '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">{labels.context.product}:</dt>
                <dd className="text-slate-800">
                  {ncr.productCode ? `${ncr.productCode}${ncr.productName ? ` · ${ncr.productName}` : ''}` : labels.context.noProduct}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">{labels.context.affectedQty}:</dt>
                <dd className="font-mono text-slate-800">{ncr.affectedQtyKg ? `${ncr.affectedQtyKg} ${labels.context.kg}` : '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">{labels.context.responseDue}:</dt>
                <dd className={['font-mono', ncr.overdue ? 'font-semibold text-red-700' : 'text-slate-800'].join(' ')}>
                  {ncr.responseDueAt ? ncr.responseDueAt.slice(0, 16).replace('T', ' ') : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Investigation section (parity ncr-screens.jsx:266-280) — editable while
              non-terminal, read-only once closed/cancelled. */}
          <Card data-testid="ncr-detail-investigation" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{labels.investigation.title}</h2>

            {isClosed && (
              <p data-testid="ncr-investigation-readonly" className="mb-3 text-xs text-slate-500">
                {labels.investigation.readOnly}
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.investigation.rootCause}
                {canClose && <span aria-hidden className="ml-1 text-red-500">*</span>}
              </span>
              <textarea
                data-testid="ncr-investigation-rootcause"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                disabled={isClosed}
                rows={3}
                placeholder={labels.investigation.rootCausePlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
              <span className="text-[11px] text-slate-400">{labels.investigation.rootCauseHelp}</span>
            </label>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">{labels.investigation.rootCauseCategory}</span>
              {isClosed ? (
                <span data-testid="ncr-investigation-category-ro" className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600">
                  {rootCauseCategory
                    ? labels.rootCauseCategories[rootCauseCategory] ?? rootCauseCategory
                    : labels.investigation.rootCauseCategoryPlaceholder}
                </span>
              ) : (
                <div data-testid="ncr-investigation-category">
                  <Select
                    aria-label={labels.investigation.rootCauseCategory}
                    value={rootCauseCategory}
                    onValueChange={(v) => setRootCauseCategory(v)}
                    placeholder={labels.investigation.rootCauseCategoryPlaceholder}
                    options={NCR_ROOT_CAUSE_CATEGORIES.map((c) => ({ value: c, label: labels.rootCauseCategories[c] }))}
                  />
                </div>
              )}
            </label>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">{labels.investigation.immediateAction}</span>
              <textarea
                data-testid="ncr-investigation-immediate"
                value={immediateAction}
                onChange={(e) => setImmediateAction(e.target.value)}
                disabled={isClosed}
                rows={3}
                placeholder={labels.investigation.immediateActionPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>

            {/* Sticky action bar: Save changes (parity ncr-screens.jsx:287-296). A
                closed NCR shows NO save affordance (immutable). */}
            {!isClosed && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  data-testid="ncr-investigation-save"
                  onClick={saveInvestigation}
                  disabled={saving}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition enabled:hover:bg-slate-50 disabled:opacity-50"
                >
                  {saving ? labels.investigation.saving : labels.investigation.save}
                </button>
                {saved && (
                  <span data-testid="ncr-investigation-saved" className="text-xs text-emerald-700">
                    {labels.investigation.saved}
                  </span>
                )}
                {saveError && (
                  <span role="alert" data-testid="ncr-investigation-error" className="text-xs text-red-600">
                    {saveError}
                  </span>
                )}
              </div>
            )}
          </Card>

          {/* CAPA P2 placeholder (parity ncr-screens.jsx:282-285). */}
          <Card data-testid="ncr-detail-capa" className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 opacity-70">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
              {labels.capa.title}
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                {labels.capa.badge}
              </span>
            </h2>
            <p className="text-xs text-slate-500">{labels.capa.body}</p>
          </Card>
        </div>

        {/* Sidebar (parity ncr-screens.jsx:305-346). */}
        <aside className="flex flex-col gap-4">
          <Card data-testid="ncr-detail-linked" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{labels.linked.title}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-slate-500">{labels.linked.hold}</dt>
              <dd>
                {ncr.linkedHoldId ? (
                  <Link
                    href={`/${locale}/quality/holds/${ncr.linkedHoldId}`}
                    data-testid="ncr-detail-hold-link"
                    className="font-mono text-sky-700 hover:underline"
                  >
                    {ncr.linkedHoldNumber ?? ncr.linkedHoldId}
                  </Link>
                ) : (
                  <span className="text-slate-400">{labels.linked.none}</span>
                )}
              </dd>
              <dt className="text-slate-500">{labels.linked.reference}</dt>
              <dd className="font-mono text-slate-700">
                {ncr.referenceType ? (
                  <span>
                    <span className="uppercase text-slate-500">{ncr.referenceType}</span>
                    {ncr.referenceId ? ` · ${ncr.referenceId.slice(0, 8)}` : ''}
                  </span>
                ) : (
                  <span className="text-slate-400">{labels.linked.none}</span>
                )}
              </dd>
            </dl>
          </Card>

          {/* CCP breach context — only for NCRs auto-created from a CCP critical-
              limit breach (referenceType 'ccp_deviation'). Surfaces WHICH CCP / what
              measured value breached which limit, with the reading timestamp + reader
              (no raw UUIDs), so the NCR detail is no longer context-blind. */}
          {ncr.ccpBreach && (
            <Card
              data-testid="ncr-detail-ccp-breach"
              className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
            >
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
                <span aria-hidden>⚠</span>
                {labels.ccpBreach.title}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-amber-800/70">{labels.ccpBreach.ccp}</dt>
                <dd className="text-amber-900">
                  <span className="font-mono font-semibold">{ncr.ccpBreach.ccpCode}</span>
                  {ncr.ccpBreach.ccpName ? <span className="text-amber-800"> · {ncr.ccpBreach.ccpName}</span> : null}
                </dd>

                <dt className="text-amber-800/70">{labels.ccpBreach.measuredValue}</dt>
                <dd className="font-mono font-semibold text-red-700" data-testid="ncr-detail-ccp-measured">
                  {ncr.ccpBreach.measuredValue
                    ? `${ncr.ccpBreach.measuredValue}${ncr.ccpBreach.unit ? ` ${ncr.ccpBreach.unit}` : ''}`
                    : labels.ccpBreach.none}
                </dd>

                <dt className="text-amber-800/70">{labels.ccpBreach.criticalLimit}</dt>
                <dd className="font-mono text-amber-900" data-testid="ncr-detail-ccp-limit">
                  {formatCriticalLimit(
                    ncr.ccpBreach.criticalLimitMin,
                    ncr.ccpBreach.criticalLimitMax,
                    ncr.ccpBreach.unit,
                    labels.ccpBreach,
                  )}
                </dd>

                <dt className="text-amber-800/70">{labels.ccpBreach.measuredAt}</dt>
                <dd className="font-mono text-amber-900">
                  {ncr.ccpBreach.measuredAt
                    ? ncr.ccpBreach.measuredAt.slice(0, 16).replace('T', ' ')
                    : labels.ccpBreach.none}
                </dd>

                <dt className="text-amber-800/70">{labels.ccpBreach.recordedBy}</dt>
                <dd className="text-amber-900">{ncr.ccpBreach.recordedBy ?? labels.ccpBreach.none}</dd>
              </dl>
              {!ncr.ccpBreach.measuredValue && (
                <p className="mt-3 text-[11px] leading-relaxed text-amber-800/80">{labels.ccpBreach.noReading}</p>
              )}
            </Card>
          )}

          {/* Critical dual-sign reg note (parity ncr-screens.jsx:341-345). */}
          {isCritical && (
            <Card
              data-testid="ncr-detail-dualsign-note"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-[11px] leading-relaxed text-red-800"
            >
              {labels.dualSign}
            </Card>
          )}
        </aside>
      </div>

      {/* Close modal — only mounts for a non-terminal, closable NCR. */}
      {canClose && (
        <NcrCloseModal
          open={closeOpen}
          onOpenChange={setCloseOpen}
          ncr={{ id: ncr.id, ncrNumber: ncr.ncrNumber, title: ncr.title, severity: ncr.severity, status: ncr.status }}
          labels={labels.closeLabels}
          closeNcrAction={closeNcrAction}
          onClosed={() => router.refresh()}
        />
      )}
    </div>
  );
}
