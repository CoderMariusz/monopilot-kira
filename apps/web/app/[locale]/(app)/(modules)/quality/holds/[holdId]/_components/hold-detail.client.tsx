'use client';

/**
 * QA-002a — Quality hold detail (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   holds-screens.jsx:163-286 (QaHoldDetail):
 *     header + status/priority badges                 → holds-screens.jsx:173-183
 *     immutable signed banner when released (21 CFR)  → holds-screens.jsx:185-190
 *     hold-context card (ref/reason/priority/created) → holds-screens.jsx:194-204
 *     Held Items / activity tabs                      → holds-screens.jsx:207-246
 *     held-items table (LP -> link, qty held, status) → holds-screens.jsx:213-229
 *     linked records sidebar (NCRs)                   → holds-screens.jsx:251-257
 *     Actions card (Release Hold; hidden if released) → holds-screens.jsx:259-272
 *     SoD regulation note (V-QA-HOLD-006)             → holds-screens.jsx:274-276
 *
 * Presentational + owns ONLY the items/NCRs tab toggle and the release-modal open
 * state. RBAC (canRelease) is resolved SERVER-side and passed in; a released hold
 * renders the immutable banner and NO action buttons (parity hard rule).
 *
 * DEVIATIONS (red-lines): the prototype's "Activity Log" timeline tab is replaced
 * by the live "Linked NCRs" tab (the backend surfaces hold.ncrs read-only; the
 * activity timeline is a separate audit surface, deferred). Escalate / Link NCR /
 * Add note / Download audit PDF secondary actions are OUT OF SCOPE for this slice.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { HoldReleaseModal, type HoldReleaseLabels } from '../../_components/hold-release-modal.client';
import type { getHoldDetail, releaseHold } from '../../../_actions/hold-actions';

type HoldDetail = NonNullable<Extract<Awaited<ReturnType<typeof getHoldDetail>>, { ok: true }>['data']>;

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'muted',
};
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'warning',
  investigating: 'info',
  escalated: 'danger',
  quarantined: 'warning',
  released: 'success',
};

export type HoldDetailLabels = {
  backToHolds: string;
  signedBanner: string;
  context: {
    title: string;
    reference: string;
    reason: string;
    priority: string;
    disposition: string;
    created: string;
    estRelease: string;
    dispositionPending: string;
  };
  tabs: { items: string; ncrs: string };
  items: { lp: string; qtyHeld: string; qtyReleased: string; status: string; empty: string };
  ncrs: { ncrNumber: string; ncrTitle: string; severity: string; status: string; empty: string };
  actions: { title: string; release: string; sod: string };
  refType: Record<string, string>;
  priorityValues: Record<string, string>;
  statusValues: Record<string, string>;
  noReason: string;
  releaseLabels: HoldReleaseLabels;
};

export function HoldDetailClient({
  hold,
  canRelease,
  labels,
  locale,
  releaseHoldAction,
}: {
  hold: HoldDetail;
  canRelease: boolean;
  labels: HoldDetailLabels;
  locale: string;
  releaseHoldAction: typeof releaseHold;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'items' | 'ncrs'>('items');
  const [releaseOpen, setReleaseOpen] = useState(false);

  const isReleased = hold.status === 'released' || hold.releasedAt !== null;
  const reason = hold.reasonLabel ?? hold.reasonText ?? labels.noReason;

  return (
    <div className="flex flex-col gap-5">
      {/* Header (parity holds-screens.jsx:173-183). */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/${locale}/quality/holds`} data-testid="hold-detail-back" className="text-sm text-sky-700 hover:underline">
          ← {labels.backToHolds}
        </Link>
        <h1 className="font-mono text-xl font-semibold text-slate-950">{hold.holdNumber}</h1>
        <Badge variant={STATUS_VARIANT[hold.status] ?? 'muted'} data-testid="hold-detail-status">
          {labels.statusValues[hold.status] ?? hold.status}
        </Badge>
        <Badge variant={PRIORITY_VARIANT[hold.priority] ?? 'muted'} data-testid="hold-detail-priority">
          {labels.priorityValues[hold.priority] ?? hold.priority}
        </Badge>
      </div>

      {/* Immutable signed banner when released (parity holds-screens.jsx:185-190). */}
      {isReleased && (
        <div
          role="note"
          data-testid="hold-detail-signed-banner"
          data-state="released"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <span aria-hidden>🔒</span>
          <span>
            {labels.signedBanner
              .replace('{date}', hold.releasedAt ? hold.releasedAt.slice(0, 10) : '—')
              .replace('{user}', hold.releasedBy ?? '—')
              .replace('{disposition}', hold.disposition ?? labels.context.dispositionPending)}
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Hold context card (parity holds-screens.jsx:194-204). */}
          <Card data-testid="hold-detail-context" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{labels.context.title}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">{labels.context.reference}</dt>
              <dd className="flex items-center gap-2">
                <Badge variant="muted" className="text-[10px]">{labels.refType[hold.referenceType] ?? hold.referenceType}</Badge>
                <span className="font-mono text-[11px] text-sky-700">{hold.referenceDisplay}</span>
              </dd>
              <dt className="text-slate-500">{labels.context.reason}</dt>
              <dd className="text-slate-800">{reason}</dd>
              <dt className="text-slate-500">{labels.context.priority}</dt>
              <dd className="text-slate-800">{labels.priorityValues[hold.priority] ?? hold.priority}</dd>
              <dt className="text-slate-500">{labels.context.disposition}</dt>
              <dd className="text-slate-800">{hold.disposition ?? labels.context.dispositionPending}</dd>
              <dt className="text-slate-500">{labels.context.created}</dt>
              <dd className="font-mono text-xs text-slate-700">{hold.createdAt.slice(0, 16).replace('T', ' ')}</dd>
              <dt className="text-slate-500">{labels.context.estRelease}</dt>
              <dd className="font-mono text-xs text-slate-700">{hold.estimatedReleaseAt ? hold.estimatedReleaseAt.slice(0, 10) : '—'}</dd>
            </dl>
          </Card>

          {/* Tabs (parity holds-screens.jsx:207-210). */}
          <div role="tablist" aria-label={labels.context.title} className="flex gap-1 border-b border-slate-200">
            {(['items', 'ncrs'] as const).map((k) => {
              const on = tab === k;
              const count = k === 'items' ? hold.items.length : hold.ncrs.length;
              return (
                <button
                  key={k}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  data-testid={`hold-detail-tab-${k}`}
                  onClick={() => setTab(k)}
                  className={[
                    'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition',
                    on ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  {labels.tabs[k]}
                  <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Held items table (parity holds-screens.jsx:213-229). */}
          {tab === 'items' && (
            <Card data-testid="hold-detail-items" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {hold.items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">{labels.items.empty}</p>
              ) : (
                <Table aria-label={labels.tabs.items}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.items.lp}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.items.qtyHeld}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.items.qtyReleased}</TableHead>
                      <TableHead scope="col">{labels.items.status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hold.items.map((it) => (
                      <TableRow key={it.id} data-testid={`hold-item-${it.id}`}>
                        <TableCell className="font-mono text-[11px] text-sky-700">
                          {it.licensePlateId ? (
                            <Link
                              href={`/${locale}/warehouse/license-plates/${it.licensePlateId}`}
                              data-testid={`hold-item-lp-link-${it.id}`}
                              className="hover:underline"
                            >
                              {it.lpNumber ?? it.licensePlateId}
                            </Link>
                          ) : (
                            (it.lpNumber ?? '—')
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{it.qtyHeldKg ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-slate-500">{it.qtyReleasedKg ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={it.status === 'released' ? 'success' : it.status === 'scrapped' ? 'danger' : 'muted'}>
                            {it.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Linked NCRs (parity holds-screens.jsx:251-257 — read-only rows). */}
          {tab === 'ncrs' && (
            <Card data-testid="hold-detail-ncrs" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {hold.ncrs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">{labels.ncrs.empty}</p>
              ) : (
                <Table aria-label={labels.tabs.ncrs}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.ncrs.ncrNumber}</TableHead>
                      <TableHead scope="col">{labels.ncrs.ncrTitle}</TableHead>
                      <TableHead scope="col">{labels.ncrs.severity}</TableHead>
                      <TableHead scope="col">{labels.ncrs.status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hold.ncrs.map((ncr) => (
                      <TableRow key={ncr.id} data-testid={`hold-ncr-${ncr.id}`}>
                        <TableCell className="font-mono text-[11px] text-slate-700">{ncr.ncrNumber}</TableCell>
                        <TableCell className="text-sm text-slate-700">{ncr.title}</TableCell>
                        <TableCell><Badge variant="muted">{ncr.severity}</Badge></TableCell>
                        <TableCell><Badge variant="muted">{ncr.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar: Actions card (parity holds-screens.jsx:259-276). */}
        <aside className="flex flex-col gap-4">
          <Card data-testid="hold-detail-actions" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{labels.actions.title}</h2>
            {/* A released hold renders the immutable banner above and NO action
                buttons (parity hard rule). Release is shown only for an active hold
                AND a server-resolved canRelease grant. */}
            {!isReleased && canRelease ? (
              <button
                type="button"
                data-testid="hold-detail-release-open"
                onClick={() => setReleaseOpen(true)}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                {labels.actions.release}
              </button>
            ) : !isReleased ? (
              <p data-testid="hold-detail-no-release" className="text-xs text-slate-400">{labels.actions.sod}</p>
            ) : null}
          </Card>

          <Card className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-500">
            {labels.actions.sod}
          </Card>
        </aside>
      </div>

      {!isReleased && canRelease && (
        <HoldReleaseModal
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          hold={{
            id: hold.id,
            holdNumber: hold.holdNumber,
            referenceDisplay: hold.referenceDisplay,
            reason,
            priority: labels.priorityValues[hold.priority] ?? hold.priority,
          }}
          labels={labels.releaseLabels}
          releaseHoldAction={releaseHoldAction}
          onReleased={() => router.refresh()}
        />
      )}
    </div>
  );
}
