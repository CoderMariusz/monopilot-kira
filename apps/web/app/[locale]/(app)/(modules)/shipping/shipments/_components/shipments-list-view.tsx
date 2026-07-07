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
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { ShipmentStatusBadge } from './shipment-status-badge';
import type { ShipmentRow } from '../_actions/shipments-data';
import { downloadCsv, toCsv } from '../../../../../../../lib/shared/download';
import { buildListPageHref } from '../../../../../../../lib/shared/list-page-href';
import { ListPaginationFooter, type ListPaginationLabels } from '../../../../../../../lib/shared/list-pagination-footer';
import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';

const LABEL_WEIGHT = { en: 'Weight', pl: 'Waga' } as const;
const LABEL_CARRIER = { en: 'Carrier', pl: 'Przewoźnik' } as const;
const LABEL_REQUIRED_BY = { en: 'Required by', pl: 'Wymagana data' } as const;
const LABEL_OTIF = 'OTIF';
const LABEL_OTIF_ON_TIME = { en: 'On time', pl: 'Na czas' } as const;
const LABEL_OTIF_LATE = { en: 'Late', pl: 'Spóźnione' } as const;
const LABEL_OTIF_PENDING = { en: 'Pending', pl: 'Oczekuje' } as const;

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
  pagination: ListPaginationLabels;
};

export type ShipmentsListViewProps = {
  locale: string;
  shipments: ShipmentRow[];
  pagination: PaginatedResult<ShipmentRow>;
  statusFilter: string;
  labels: ShipmentsListLabels;
};

export function ShipmentsListView({
  locale,
  shipments,
  pagination,
  statusFilter,
  labels,
}: ShipmentsListViewProps) {
  const router = useRouter();
  const basePath = `/${locale}/shipping/shipments`;
  const pageHref = (page: number) =>
    buildListPageHref(basePath, { status: statusFilter || undefined }, page);
  const shown = pagination.offset + shipments.length;
  const [exportError, setExportError] = React.useState<string | null>(null);
  const statusLabel = (s: string) => labels.status[s.toLowerCase()] ?? s;
  const localeKey = locale === 'pl' ? 'pl' : 'en';

  function applyStatusFilter(next: string) {
    router.push(buildListPageHref(basePath, { status: next || undefined }, 1));
  }

  function weightText(value: string | null): string {
    if (value == null || value === '') return labels.noWeight;
    return `${value} ${labels.weightUnit}`;
  }

  function customerText(name: string | null | undefined, code: string | null | undefined): string {
    if (name && code) return `${name} (${code})`;
    return name ?? code ?? '—';
  }

  function shortDateText(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date);
  }

  function dateKey(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function otifBadge(sh: ShipmentRow) {
    const actualShipDate = dateKey(sh.shippedAt);
    if (actualShipDate == null) {
      return {
        label: LABEL_OTIF_PENDING[localeKey],
        className: 'border-slate-200 bg-slate-100 text-slate-700',
      };
    }

    const promisedShipDate = dateKey(sh.promisedShipDate);
    const onTime = promisedShipDate != null && actualShipDate <= promisedShipDate;

    return onTime
      ? { label: LABEL_OTIF_ON_TIME[localeKey], className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
      : { label: LABEL_OTIF_LATE[localeKey], className: 'border-red-200 bg-red-50 text-red-700' };
  }

  function exportCsv() {
    setExportError(null);
    try {
      const headers = [
        labels.columns.shipment,
        labels.columns.salesOrder,
        labels.columns.customer,
        labels.columns.status,
        labels.columns.boxes,
        LABEL_WEIGHT[localeKey],
        LABEL_CARRIER[localeKey],
        LABEL_REQUIRED_BY[localeKey],
        LABEL_OTIF,
        labels.columns.actions,
      ];
      const rows = shipments.map((sh) => [
        sh.shipmentNumber || '—',
        sh.salesOrderNumber ?? '—',
        customerText(sh.customerName, sh.customerCode),
        statusLabel(sh.status),
        sh.boxCount,
        weightText(sh.totalWeightKg ?? sh.weight),
        sh.carrier ?? '—',
        shortDateText(sh.requiredDeliveryDate),
        otifBadge(sh).label,
        labels.view,
      ]);
      downloadCsv(toCsv(headers, rows), 'shipments.csv');
    } catch (error) {
      console.error('Failed to export shipments CSV', error);
      setExportError('CSV export failed.');
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="shipments-list-view">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            value={statusFilter}
            onValueChange={applyStatusFilter}
            aria-label={labels.statusFilterLabel}
            options={[
              { value: '', label: labels.allStatuses },
              ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) })),
            ]}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button type="button" data-testid="shipments-export-csv" onClick={exportCsv}>
            Export CSV
          </Button>
          <span className="text-xs text-slate-500" data-testid="shipments-rows-count">
            {labels.rowsCount.replace('{n}', String(pagination.total))}
          </span>
        </div>
      </div>
      {exportError ? (
        <p className="text-xs text-red-700" role="alert" data-testid="shipments-export-error">
          {exportError}
        </p>
      ) : null}

      {shipments.length === 0 ? (
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
                <th className="px-3 py-2 text-right">{LABEL_WEIGHT[localeKey]}</th>
                <th className="px-3 py-2">{LABEL_CARRIER[localeKey]}</th>
                <th className="px-3 py-2">{LABEL_REQUIRED_BY[localeKey]}</th>
                <th className="px-3 py-2">{LABEL_OTIF}</th>
                <th className="px-3 py-2 text-right">{labels.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((sh) => {
                const otif = otifBadge(sh);
                return (
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
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {weightText(sh.totalWeightKg ?? sh.weight)}
                    </td>
                    <td className="px-3 py-2">{sh.carrier ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{shortDateText(sh.requiredDeliveryDate)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${otif.className}`}>
                        {otif.label}
                      </span>
                    </td>
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
                );
              })}
            </tbody>
          </table>
          <ListPaginationFooter
            shown={shown}
            total={pagination.total}
            previousHref={pagination.page > 1 ? pageHref(pagination.page - 1) : null}
            nextHref={pagination.hasMore ? pageHref(pagination.page + 1) : null}
            labels={labels.pagination}
            testId="shipments-list-pagination"
          />
        </div>
      )}
    </div>
  );
}
