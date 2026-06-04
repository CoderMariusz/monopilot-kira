'use client';

/**
 * T-110 — ApprovalHistoryTimeline (NPD-011 gate approval history).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:525-616
 *   (ApprovalHistoryTimeline) — labelled region #approval_history_timeline.
 *
 * Translation notes applied (prototype → production):
 *   - APPROVAL_HISTORY_SAMPLE (mock) → REAL org-scoped read via
 *     packages/queries `listApprovalHistory(projectId)` over public.gate_approvals.
 *     RLS scopes to the caller's org (app.current_org_id()); the page-side loader
 *     never trusts the client. This component is purely presentational — the
 *     parent passes `entries` (risk red line: no fetch inside the component).
 *   - `<div class="card">` + `.card-head` → shadcn Card + CardHeader/CardContent.
 *   - status pill `<span class="badge badge-green|red">` → shadcn Badge
 *     (variant success/destructive).
 *   - green/red circle with ✓ / ✗ glyph → circle with glyph + aria-label so the
 *     decision is never color/glyph-only (a11y).
 *   - mono date → <time dateTime> (machine-readable + mono styling).
 *   - 🔐 e-signed marker → text Badge tag + aria-labelled glyph (never emoji-only).
 *   - "View signature details ▼" button + sigOpen panel → controlled disclosure
 *     button (aria-expanded/aria-controls) revealing the signature detail grid.
 *     Rendered ONLY for eSigned entries (risk red line).
 *   - inline English literals → next-intl label props (namespace npd.approvalHistory),
 *     resolved server-side and passed down (RSC must not call useTranslations).
 *
 * Required UI states: loading / empty / error / permission_denied / ready — the
 * interactive "optimistic"/reveal affordance in this read-only screen is the
 * signature-details disclosure (no mutation exists).
 *
 * Red lines (T-110): read-only (no edit/delete/approve controls); does not fetch
 * data; never renders e-signature details for a non-eSigned entry.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';

export type ApprovalHistoryState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission_denied';

export type ApprovalDecision = 'approved' | 'rejected';

export type ApprovalHistoryEntry = {
  /** Stable id (gate_approvals.id) for React keys + test ids. */
  id: string;
  /** Gate code, e.g. 'G1'. */
  gate: string;
  /** Human gate label, e.g. 'Feasibility'. */
  gateLabel: string;
  result: ApprovalDecision;
  /** Resolved approver display name. */
  approver: string;
  /** Approver role / title. */
  role: string;
  /** Approval notes (or rejection reason). */
  notes: string | null;
  /** Display date (ISO date or datetime). */
  date: string;
  eSigned: boolean;
  /** SHA-256 certificate hash for e-signed entries (null otherwise). */
  eSignHash?: string | null;
  /** Full ISO timestamp the signature was applied (null otherwise). */
  eSignedAt?: string | null;
};

export type ApprovalHistoryLabels = {
  title: string;
  /** ICU plural string already resolved by the caller, e.g. "2 approvals recorded". */
  subtitle: string;
  statusApproved: string;
  statusRejected: string;
  eSignedTag: string;
  eSignedIconLabel: string;
  sigShow: string;
  sigHide: string;
  sigPanelTitle: string;
  sigSigner: string;
  sigRole: string;
  sigTimestamp: string;
  sigCertId: string;
  sigVerification: string;
  sigValid: string;
  approvedIconLabel: string;
  rejectedIconLabel: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

function StateNotice({
  state,
  labels,
}: {
  state: ApprovalHistoryState;
  labels: ApprovalHistoryLabels;
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  // empty
  return (
    <div
      data-testid="approval-history-empty"
      role="status"
      className="flex flex-col items-center gap-1 px-5 py-10 text-center"
    >
      <span aria-hidden="true" className="text-4xl">
        🕐
      </span>
      <p className="font-semibold text-slate-900">{labels.empty}</p>
      <p className="text-sm text-slate-500">{labels.emptyBody}</p>
    </div>
  );
}

function SignaturePanel({
  entry,
  labels,
}: {
  entry: ApprovalHistoryEntry;
  labels: ApprovalHistoryLabels;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = `approval-history-signature-panel-${entry.id}`;
  const timestamp = entry.eSignedAt ?? entry.date;

  return (
    <div data-testid="approval-history-signature" className="mt-2">
      <button
        type="button"
        data-testid="approval-history-signature-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        {open ? labels.sigHide : labels.sigShow}
      </button>
      {open ? (
        <div
          id={panelId}
          data-testid="approval-history-signature-panel"
          className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-xs"
        >
          <p className="mb-2 font-semibold text-slate-900">{labels.sigPanelTitle}</p>
          <dl className="grid grid-cols-[130px_1fr] gap-y-1">
            <dt className="text-slate-500">{labels.sigSigner}</dt>
            <dd className="text-slate-900">{entry.approver}</dd>
            <dt className="text-slate-500">{labels.sigRole}</dt>
            <dd className="text-slate-900">{entry.role}</dd>
            <dt className="text-slate-500">{labels.sigTimestamp}</dt>
            <dd className="font-mono text-slate-900">
              <time dateTime={timestamp}>{timestamp}</time>
            </dd>
            <dt className="text-slate-500">{labels.sigCertId}</dt>
            <dd className="break-all font-mono text-slate-900">{entry.eSignHash}</dd>
            <dt className="text-slate-500">{labels.sigVerification}</dt>
            <dd className="font-medium text-green-700">✓ {labels.sigValid}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function TimelineEntry({
  entry,
  labels,
}: {
  entry: ApprovalHistoryEntry;
  labels: ApprovalHistoryLabels;
}) {
  const approved = entry.result === 'approved';
  const statusLabel = approved ? labels.statusApproved : labels.statusRejected;
  const iconLabel = approved ? labels.approvedIconLabel : labels.rejectedIconLabel;

  return (
    <li
      data-testid={`approval-history-row-${entry.id}`}
      data-result={entry.result}
      className="relative flex gap-4 pb-5 last:pb-0"
    >
      <span
        data-testid="approval-history-icon"
        aria-label={iconLabel}
        role="img"
        className={[
          'z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-[0_0_0_3px_#fff]',
          approved ? 'bg-green-600' : 'bg-red-500',
        ].join(' ')}
      >
        {approved ? '✓' : '✗'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">
            {entry.gateLabel} — {entry.gate}
          </span>
          <Badge variant={approved ? 'success' : 'destructive'}>{statusLabel}</Badge>
          {entry.eSigned ? (
            <span role="img" aria-label={labels.eSignedIconLabel} className="text-sm">
              🔐
            </span>
          ) : null}
          <time
            dateTime={entry.date}
            className="ml-auto font-mono text-xs text-slate-500"
          >
            {entry.date}
          </time>
        </div>
        <div
          className={[
            'rounded-lg border px-3.5 py-2.5',
            approved ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
          ].join(' ')}
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-900">{entry.approver}</span>
            <span className="text-xs text-slate-500">({entry.role})</span>
            {entry.eSigned ? (
              <span className="text-xs text-slate-500">· {labels.eSignedTag}</span>
            ) : null}
          </div>
          {entry.notes ? (
            <p className={['text-sm', approved ? 'text-green-800' : 'text-red-800'].join(' ')}>
              {entry.notes}
            </p>
          ) : null}
          {entry.eSigned ? <SignaturePanel entry={entry} labels={labels} /> : null}
        </div>
      </div>
    </li>
  );
}

export function ApprovalHistoryTimeline({
  projectId,
  entries,
  labels,
  state = 'ready',
}: {
  projectId: string;
  entries: ApprovalHistoryEntry[];
  labels: ApprovalHistoryLabels;
  state?: ApprovalHistoryState;
}) {
  const dataLoaded = state === 'ready' || state === 'empty';
  const hasEntries = dataLoaded && entries.length > 0;

  return (
    <section
      data-testid="approval-history-timeline"
      aria-labelledby="approval-history-title"
      className="space-y-3"
    >
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="approval-history-title"
            className="text-base font-semibold text-slate-900"
          >
            {labels.title}
          </h2>
          {hasEntries ? (
            <span className="text-xs text-slate-500">{labels.subtitle}</span>
          ) : null}
        </CardHeader>
        <CardContent>
          {!hasEntries ? (
            <StateNotice state={dataLoaded ? 'empty' : state} labels={labels} />
          ) : (
            <div className="relative pt-2">
              {/* vertical connector line */}
              <div
                aria-hidden="true"
                className="absolute bottom-2 left-[15px] top-6 z-0 w-0.5 bg-slate-200"
              />
              <ul data-testid="approval-history-list" aria-label={labels.title}>
                {entries.map((entry) => (
                  <TimelineEntry key={entry.id} entry={entry} labels={labels} />
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <span className="sr-only">{projectId}</span>
    </section>
  );
}

export default ApprovalHistoryTimeline;
