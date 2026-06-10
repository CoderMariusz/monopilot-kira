'use client';

/**
 * P2-PLANNING — Supplier detail (client view) with status transitions.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:158-403 (plan_supplier_detail):
 *     header (code + name + status badge)         → suppliers.jsx:180-203
 *     "Edit" + Deactivate/Reactivate actions      → suppliers.jsx:196-201
 *     "Supplier info" card (code/name/currency/   → suppliers.jsx:222-247
 *       lead time/email/phone/country/notes)
 *     side "Status / quick actions" card          → suppliers.jsx:249-267
 *
 * The prototype's deactivate flow (suppliers.jsx:521-557) is a confirm gate; here
 * the three real transitions (active/inactive/blocked) call transitionSupplierStatus
 * behind a window.confirm guard — the same "guarded state transition" interaction
 * the WO list uses for Release.
 *
 * Deviations (documented for parity evidence):
 *   - Products / Purchase-orders / D365-sync tabs (suppliers.jsx:271-389) are
 *     dropped: NONE have a backing read in the reviewed suppliers action set. The
 *     soft-delete is a 3-state status (active/inactive/blocked) — we expose all
 *     three real transitions instead of the prototype's active⇄inactive toggle.
 *   - Rating / certifications / YTD-spend / open-POs have no column → omitted.
 *
 * RBAC for transitions is enforced server-side inside transitionSupplierStatus
 * (forbidden surfaced inline) — never a client-trusted flag.
 *
 * UI states: idle, optimistic (a transition pending → buttons busy + disabled),
 * error (mapped inline alert), success (router.refresh re-reads the row).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { SupplierStatusBadge } from './supplier-status-badge';
import { contactField, type Supplier, type TransitionSupplierResult, type SupplierStatus } from './supplier-types';

export type SupplierDetailLabels = {
  edit: string;
  status: Record<SupplierStatus, string>;
  info: {
    title: string;
    code: string;
    name: string;
    currency: string;
    leadTime: string;
    status: string;
    country: string;
    email: string;
    phone: string;
    paymentTerms: string;
    days: string;
    none: string;
  };
  notes: {
    title: string;
    empty: string;
  };
  transitions: {
    title: string;
    current: string;
    activate: string;
    deactivate: string;
    block: string;
    pending: string;
    hint: string;
    confirmDeactivate: string;
    confirmBlock: string;
    confirmActivate: string;
  };
  errors: Record<string, string>;
};

export type SupplierDetailViewProps = {
  supplier: Supplier;
  labels: SupplierDetailLabels;
  transitionSupplierStatusAction: (id: string, status: SupplierStatus) => Promise<TransitionSupplierResult>;
};

export function SupplierDetailView({ supplier, labels, transitionSupplierStatusAction }: SupplierDetailViewProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = React.useState<SupplierStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const current = supplier.status.toLowerCase() as SupplierStatus;
  const email = contactField(supplier.contact, 'email');
  const phone = contactField(supplier.contact, 'phone');
  const country = contactField(supplier.contact, 'country');
  const paymentTerms = contactField(supplier.contact, 'paymentTerms');

  function statusLabel(status: string): string {
    return labels.status[status.toLowerCase() as SupplierStatus] ?? status;
  }

  async function transition(next: SupplierStatus, confirmMsg: string) {
    if (pendingStatus) return;
    if (!window.confirm(confirmMsg.replace('{code}', supplier.code))) return;
    setError(null);
    setPendingStatus(next);
    try {
      const result = await transitionSupplierStatusAction(supplier.id, next);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPendingStatus(null);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPendingStatus(null);
    }
  }

  const busy = pendingStatus !== null;

  return (
    <div className="flex flex-col gap-4" data-testid="supplier-detail-view">
      {/* Header (parity: suppliers.jsx:180-203) */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4" data-testid="supplier-detail-head">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-blue-700">{supplier.code}</span>
            <span className="text-lg font-medium text-slate-800">{supplier.name}</span>
            <SupplierStatusBadge status={supplier.status} label={statusLabel(supplier.status)} />
          </div>
          <div className="text-xs text-slate-500">
            {supplier.currency} · {labels.info.leadTime} <span className="font-mono">{supplier.leadTimeDays} {labels.info.days}</span>
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" data-testid="supplier-detail-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Info card (parity: suppliers.jsx:222-247) */}
        <div className="rounded-xl border border-slate-200 p-4" data-testid="supplier-info-card">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">{labels.info.title}</h3>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.code}</dt>
              <dd className="font-mono font-semibold">{supplier.code}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.name}</dt>
              <dd>{supplier.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.currency}</dt>
              <dd className="font-mono">{supplier.currency}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.leadTime}</dt>
              <dd className="font-mono">
                {supplier.leadTimeDays} {labels.info.days}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.status}</dt>
              <dd>{statusLabel(supplier.status)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.country}</dt>
              <dd className="font-mono">{country ?? <span className="text-slate-400">{labels.info.none}</span>}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.email}</dt>
              <dd>{email ?? <span className="text-slate-400">{labels.info.none}</span>}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.phone}</dt>
              <dd className="font-mono">{phone ?? <span className="text-slate-400">{labels.info.none}</span>}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.info.paymentTerms}</dt>
              <dd>{paymentTerms ?? <span className="text-slate-400">{labels.info.none}</span>}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <h4 className="mb-1 text-xs uppercase tracking-wide text-slate-400">{labels.notes.title}</h4>
            <p className="text-sm leading-relaxed text-slate-700">
              {supplier.notes && supplier.notes.trim() ? supplier.notes : <span className="text-slate-400">{labels.notes.empty}</span>}
            </p>
          </div>
        </div>

        {/* Status / transitions card (parity: suppliers.jsx:196-201,249-267) */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4" data-testid="supplier-transitions-card">
          <h3 className="text-sm font-semibold text-slate-800">{labels.transitions.title}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">{labels.transitions.current}</span>
            <SupplierStatusBadge status={supplier.status} label={statusLabel(supplier.status)} />
          </div>

          <div className="flex flex-col gap-2">
            {current !== 'active' ? (
              <Button
                type="button"
                className="btn--primary btn-sm"
                data-testid="supplier-transition-active"
                disabled={busy}
                aria-busy={pendingStatus === 'active'}
                onClick={() => transition('active', labels.transitions.confirmActivate)}
              >
                {pendingStatus === 'active' ? labels.transitions.pending : labels.transitions.activate}
              </Button>
            ) : null}

            {current !== 'inactive' ? (
              <Button
                type="button"
                className="btn--secondary btn-sm"
                data-testid="supplier-transition-inactive"
                disabled={busy}
                aria-busy={pendingStatus === 'inactive'}
                onClick={() => transition('inactive', labels.transitions.confirmDeactivate)}
              >
                {pendingStatus === 'inactive' ? labels.transitions.pending : labels.transitions.deactivate}
              </Button>
            ) : null}

            {current !== 'blocked' ? (
              <Button
                type="button"
                className="btn--danger btn-sm"
                data-testid="supplier-transition-blocked"
                disabled={busy}
                aria-busy={pendingStatus === 'blocked'}
                onClick={() => transition('blocked', labels.transitions.confirmBlock)}
              >
                {pendingStatus === 'blocked' ? labels.transitions.pending : labels.transitions.block}
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-slate-400">{labels.transitions.hint}</p>
        </div>
      </div>
    </div>
  );
}
