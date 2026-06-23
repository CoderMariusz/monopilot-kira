'use client';

/**
 * Wave-shipping — Shipments list (client view).
 *
 * Prototype parity: spec-driven. No JSX list-of-shipments screen exists; the nearest
 * reusable pattern is the SO list dense table (shipping/so-screens.jsx:92-168) which
 * S2 translated into so-list-view.tsx. This view reuses the SAME density / shadcn
 * Select status filter / row-deep-link / "{n} shipments" footer / EmptyState pattern so
 * the two shipping list screens are visually consistent.
 *
 * Columns: shipment_number · so_number · customer · status badge · box count · weight.
 * The reviewed listShipments row has no per-shipment weight feed (documented deviation
 * in shipments-data.ts); weight renders boxCount-derived "—" until the action surfaces
 * it. Each row deep-links to the pack screen. NO raw UUID is ever rendered (shipment
 * number / SO number / customer code shown — never ids).
 *
 * Data comes from the reviewed listShipments action (imported by the page, never
 * authored here). RBAC (ship.dashboard.view) is enforced server-side inside the action;
 * this view never trusts a client permission flag. The status filter is a client-side
 * narrowing over the already-org-scoped dataset.
 *
 * UI states: loading (Suspense skeleton in page.tsx), empty (EmptyState), error +
 * permission-denied (page renders the banner / denied panel instead of this view).
 */

import React from 'react';
import Link from 'next/link';

import { Select } from '@monopilot/ui/Select';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { ShipmentStatusBadge } from './shipment-status-badge';
import type { ShipmentRow } from '../_actions/shipments-data';

const STATUS_ORDER = [
  'pending',
  'packing',
  'packed',
  'manifested',
  'shipped',
  'delivered',
  'exception',
] as const;

export type ShipmentsListLabels = {
  statusFilterLabel: string;
  allStatuses: string;
  rowsCount: string;
  status: Record<string, string>;
  columns: {
    shipment: string;
    salesOrder: string;
    customer: string;
    status: string;
    boxes: string;
    weight: string;
    actions: string;
  };
  view: string;
  empty: { title: string; body: string };
  weightUnit: string;
  noWeight: string;
};

export type ShipmentsListViewProps = {
  locale: string;
  shipments: ShipmentRow[];
  labels: ShipmentsListLabels;
};

export function ShipmentsListView({ locale, shipments, labels }: ShipmentsListViewProps) {
  const [statusFilter, setStatusFilter] = React.useState('');

  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;

  const visible = React.useMemo(() => {
    if (!statusFilter) return shipments;
    return shipments.filter((sh) => sh.status.toLowerCase() === statusFilter);
  }, [shipments, statusFilter]);

  function weightText(value: string | null): string {
    if (value == null || value === '') return labels.noWeight;
    return `${value} ${labels.weightUnit}`;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="shipments-list-view">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            aria-label={labels.statusFilterLabel}
            options={[
              { value: '', label: labels.allStatuses },
              ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) })),
            ]}
          />
        </div>
        <span className="ml-auto text-xs text-slate-500" data-testid="shipments-rows-count">
          {labels.rowsCount.replace('{n}', String(visible.length))}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="🚚" title={labels.empty.title} body={labels.empty.body} action={<span />} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="shipments-list-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{labels.columns.shipment}</th>
                <th className="px-3 py-2">{labels.columns.salesOrder}</th>
                <th className="px-3 py-2">{labels.columns.customer}</th>
                <th className="px-3 py-2">{labels.columns.status}</th>
                <th className="px-3 py-2 text-right">{labels.columns.boxes}</th>
                <th className="px-3 py-2 text-right">{labels.columns.weight}</th>
                <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((sh) => (
                <tr key={sh.id} data-testid={`shipment-row-${sh.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/${locale}/shipping/shipments/${sh.id}`}
                      prefetch={false}
                      className="font-mono font-semibold text-blue-700 hover:underline"
                      data-testid={`shipment-link-${sh.id}`}
                    >
                      {sh.shipmentNumber || '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{sh.salesOrderNumber ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{sh.customerName ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-500">{sh.customerCode ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <ShipmentStatusBadge status={sh.status} label={statusLabel(sh.status)} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{sh.boxCount}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{weightText(sh.weight)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/${locale}/shipping/shipments/${sh.id}`}
                      prefetch={false}
                      className="text-xs text-blue-700 hover:underline"
                      data-testid={`shipment-view-${sh.id}`}
                    >
                      {labels.view}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
