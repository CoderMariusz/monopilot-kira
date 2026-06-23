'use client';

/**
 * Wave-shipping — Sales Order detail (client view).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/shipping/so-screens.jsx:141-366 (ShSODetail):
 *     header (SO# / customer / status + meta)   → so-screens.jsx:211-225
 *     status action buttons (Confirm/Allocate/  → so-screens.jsx:217-224
 *       Cancel) gated by status
 *     summary bar (status / lines / allocated /  → so-screens.jsx:235-242
 *       total)
 *     order lines table (line / product / qty /  → so-screens.jsx:259-285
 *       allocated)
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's 7 tabs (lines/allocation/holds/picks/packs/documents/history),
 *     allergen-conflict alert, per-LP allocation table, ship-to address, GTIN /
 *     picked / packed / shipped / unit£ columns and the Print menu are dropped: none
 *     have a backing feed in getSalesOrder (it returns header + allocation_status +
 *     lines of { line_no, item_code, item_name, qty, uom, allocated_qty,
 *     allocation_status } only). We render real columns + a per-line allocation badge.
 *   - The prototype's per-status action set maps to the REAL legal transitions and the
 *     reviewed allocate/deallocate actions: draft → Confirm/Cancel; confirmed →
 *     Allocate/Cancel; allocated (or partially allocated) → Deallocate + Cancel.
 *
 * Data comes from the reviewed getSalesOrder (header + lines) + the
 * allocateSalesOrder / deallocateSalesOrder / transitionSalesOrderStatus actions
 * (the seams). RBAC is enforced server-side inside each action; the `caps` flags are
 * an advisory server-side RBAC probe (getSoCapabilities) used ONLY to disable +
 * tooltip controls the user can never use — never client-trusted for authorisation.
 *
 * UI states: loading/error/denied resolved by the RSC page; here the detail is always
 * for a successfully-loaded SO. Action: optimistic (pending — buttons disabled +
 * busy), error (forbidden / illegal_transition / insufficient_stock / persistence
 * inline alert), success (router.refresh). NO raw UUIDs are ever rendered.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { SoStatusBadge, AllocationBadge } from './so-status-badge';

export type SoDetailLine = {
  id: string;
  lineNo: number;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  allocatedQty: string;
  allocationStatus: string;
};

export type SoDetail = {
  id: string;
  soNumber: string;
  status: string;
  customerName: string | null;
  customerCode: string | null;
  expectedShipDate: string | null;
  notes: string | null;
  createdAt: string;
  allocationStatus: string;
  lines: SoDetailLine[];
};

export type SoDetailLabels = {
  status: Record<string, string>;
  allocation: Record<string, string>;
  summary: {
    title: string;
    customer: string;
    status: string;
    allocation: string;
    expected: string;
    created: string;
    lines: string;
    total: string;
  };
  lines: {
    title: string;
    seq: string;
    item: string;
    qty: string;
    uom: string;
    allocated: string;
    allocationStatus: string;
    empty: string;
  };
  actions: {
    title: string;
    allocate: string;
    deallocate: string;
    confirm: string;
    cancel: string;
    pending: string;
    confirmPrompt: string;
    /** Tooltip shown when a control is disabled because the user lacks the permission. */
    noPermission: string;
    /** Tooltip shown when a control is disabled because the SO status disallows it. */
    notAvailable: string;
  };
  notesTitle: string;
  errors: Record<string, string>;
};

export type SoActionResult = { ok: true; data: unknown } | { ok: false; error: string };

export type SoCaps = {
  canAllocate: boolean;
  canConfirm: boolean;
  canCancel: boolean;
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

type ActionKind = 'allocate' | 'deallocate' | 'confirm' | 'cancel';

export function SoDetailView({
  so,
  labels,
  locale,
  caps,
  allocateSalesOrderAction,
  deallocateSalesOrderAction,
  transitionSalesOrderStatusAction,
}: {
  so: SoDetail;
  labels: SoDetailLabels;
  locale: string;
  caps: SoCaps;
  allocateSalesOrderAction: (id: string) => Promise<SoActionResult>;
  deallocateSalesOrderAction: (id: string) => Promise<SoActionResult>;
  transitionSalesOrderStatusAction: (id: string, status: string) => Promise<SoActionResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<ActionKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const status = so.status.toLowerCase();
  const alloc = so.allocationStatus.toLowerCase();

  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;
  const allocLabel = (s: string) => labels.allocation[s.toLowerCase()] ?? s;

  // Legal-by-status (mirrors the reviewed LEGAL_TRANSITIONS + allocate/deallocate
  // contract). Permission gating is the `caps.*` server-side probe.
  const allocateLegal = status === 'confirmed';
  const deallocateLegal = (status === 'allocated' || status === 'confirmed') && alloc !== 'unallocated';
  const confirmLegal = status === 'draft';
  const cancelLegal = !['shipped', 'partially_delivered', 'delivered', 'cancelled'].includes(status);

  async function run(kind: ActionKind, fn: () => Promise<SoActionResult>, prompt?: string) {
    if (pending) return;
    if (prompt && !window.confirm(prompt)) return;
    setPending(kind);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(null);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPending(null);
    }
  }

  function onAllocate() {
    void run('allocate', () => allocateSalesOrderAction(so.id));
  }
  function onDeallocate() {
    void run('deallocate', () => deallocateSalesOrderAction(so.id));
  }
  function onConfirm() {
    void run(
      'confirm',
      () => transitionSalesOrderStatusAction(so.id, 'confirmed'),
      labels.actions.confirmPrompt.replace('{so}', so.soNumber).replace('{status}', statusLabel('confirmed')),
    );
  }
  function onCancel() {
    void run(
      'cancel',
      () => transitionSalesOrderStatusAction(so.id, 'cancelled'),
      labels.actions.confirmPrompt.replace('{so}', so.soNumber).replace('{status}', statusLabel('cancelled')),
    );
  }

  // Each button: disabled when (a) status disallows it, (b) the user lacks the
  // permission, or (c) another action is pending. Tooltip explains which.
  type Btn = {
    kind: ActionKind;
    label: string;
    onClick: () => void;
    legal: boolean;
    permitted: boolean;
    variant: 'primary' | 'danger';
  };
  const buttons: Btn[] = [
    { kind: 'confirm', label: labels.actions.confirm, onClick: onConfirm, legal: confirmLegal, permitted: caps.canConfirm, variant: 'primary' },
    { kind: 'allocate', label: labels.actions.allocate, onClick: onAllocate, legal: allocateLegal, permitted: caps.canAllocate, variant: 'primary' },
    { kind: 'deallocate', label: labels.actions.deallocate, onClick: onDeallocate, legal: deallocateLegal, permitted: caps.canAllocate, variant: 'primary' },
    { kind: 'cancel', label: labels.actions.cancel, onClick: onCancel, legal: cancelLegal, permitted: caps.canCancel, variant: 'danger' },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="so-detail-view" data-prototype-label="ship_so_detail">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3" data-testid="so-detail-header">
        <span className="font-mono text-lg font-semibold text-slate-900">{so.soNumber}</span>
        <span className="text-slate-700">{so.customerName ?? '—'}</span>
        <SoStatusBadge status={so.status} label={statusLabel(so.status)} />
        <AllocationBadge status={so.allocationStatus} label={allocLabel(so.allocationStatus)} />
      </div>

      {error ? (
        <div role="alert" data-testid="so-detail-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left: lines + notes */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              <span>
                {labels.lines.title} · {so.lines.length}
              </span>
            </div>
            {so.lines.length === 0 ? (
              <div data-testid="so-lines-empty" className="px-4 py-8 text-center text-sm text-slate-500">
                {labels.lines.empty}
              </div>
            ) : (
              <table className="w-full text-sm" data-testid="so-lines-table">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{labels.lines.seq}</th>
                    <th className="px-3 py-2">{labels.lines.item}</th>
                    <th className="px-3 py-2 text-right">{labels.lines.qty}</th>
                    <th className="px-3 py-2">{labels.lines.uom}</th>
                    <th className="px-3 py-2 text-right">{labels.lines.allocated}</th>
                    <th className="px-3 py-2">{labels.lines.allocationStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {so.lines.map((l) => (
                    <tr key={l.id} data-testid={`so-line-${l.id}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.lineNo}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{l.itemName ?? '—'}</div>
                        <div className="font-mono text-xs text-slate-500">{l.itemCode ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{l.qty}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.uom}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{l.allocatedQty}</td>
                      <td className="px-3 py-2" data-testid={`so-line-alloc-${l.id}`}>
                        <AllocationBadge status={l.allocationStatus} label={allocLabel(l.allocationStatus)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {so.notes ? (
            <div className="rounded-xl border border-slate-200 p-4" data-testid="so-detail-notes">
              <div className="mb-1 text-sm font-semibold text-slate-700">{labels.notesTitle}</div>
              <div className="text-sm text-slate-600">{so.notes}</div>
            </div>
          ) : null}
        </div>

        {/* Right: summary + actions */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 p-4" data-testid="so-detail-summary">
            <div className="mb-3 text-sm font-semibold text-slate-700">{labels.summary.title}</div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.customer}</dt>
                <dd className="text-slate-800">{so.customerName ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.status}</dt>
                <dd>
                  <SoStatusBadge status={so.status} label={statusLabel(so.status)} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.allocation}</dt>
                <dd>
                  <AllocationBadge status={so.allocationStatus} label={allocLabel(so.allocationStatus)} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.expected}</dt>
                <dd className="font-mono text-xs text-slate-800">{fmtDate(so.expectedShipDate, locale)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{labels.summary.created}</dt>
                <dd className="font-mono text-xs text-slate-800">{fmtDate(so.createdAt, locale)}</dd>
              </div>
              <div className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-700">{labels.summary.lines}</dt>
                <dd className="font-mono font-semibold text-slate-900" data-testid="so-detail-line-count">
                  {so.lines.length}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 p-4" data-testid="so-detail-actions">
            <div className="mb-3 text-sm font-semibold text-slate-700">{labels.actions.title}</div>
            <div className="flex flex-col gap-2">
              {buttons.map((b) => {
                const disabled = !b.legal || !b.permitted || pending !== null;
                const tooltip = !b.permitted
                  ? labels.actions.noPermission
                  : !b.legal
                    ? labels.actions.notAvailable
                    : undefined;
                return (
                  <button
                    key={b.kind}
                    type="button"
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-medium',
                      b.variant === 'danger'
                        ? 'border border-red-200 text-red-700 hover:bg-red-50'
                        : 'bg-slate-900 text-white hover:bg-slate-800',
                      disabled ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                    data-testid={`so-action-${b.kind}`}
                    disabled={disabled}
                    aria-busy={pending === b.kind}
                    title={tooltip}
                    onClick={b.onClick}
                  >
                    {pending === b.kind ? labels.actions.pending : b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
