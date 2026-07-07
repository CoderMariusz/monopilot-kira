/**
 * WH-010 — GRN list receive CTAs (prototype grn-screens.jsx:30-33).
 *
 * Presentational only: the page resolves RBAC server-side and passes `canReceive`.
 * Links route into the warehouse inbound schedule where open POs / in-transit TOs
 * expose per-row desktop receive entry points (receive-po / transfer-order receive).
 */
import Link from 'next/link';

export type GrnListReceiveActionLabels = {
  receiveFromPo: string;
  receiveFromTo: string;
};

export function GrnListReceiveActions({
  locale,
  labels,
  canReceive,
}: {
  locale: string;
  labels: GrnListReceiveActionLabels;
  canReceive: boolean;
}) {
  if (!canReceive) return null;

  const inboundHref = `/${locale}/warehouse/inbound`;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="grn-list-receive-actions">
      <Link
        href={inboundHref}
        data-testid="grn-receive-from-to"
        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
      >
        {labels.receiveFromTo}
      </Link>
      <Link
        href={inboundHref}
        data-testid="grn-receive-from-po"
        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        {labels.receiveFromPo}
      </Link>
    </div>
  );
}
