/**
 * Wave-shipping — Sales Order detail route (/shipping/[soId]).
 *
 * Prototype parity: shipping/so-screens.jsx:141-366 (ShSODetail) — header (SO# /
 * customer / status + allocation), summary, order lines table, status action buttons.
 * See so-detail-view.tsx for per-region anchors + the honest treatment of the
 * no-source regions (holds / picks / packs / documents / history / per-LP allocation
 * tabs — no feed in getSalesOrder).
 *
 * Data: the reviewed getSalesOrder (header + allocation_status + lines) +
 * allocateSalesOrder / deallocateSalesOrder / transitionSalesOrderStatus actions
 * (imported, never authored), run inside withOrgContext (RLS-scoped). The read is
 * org-scoped: an out-of-org id returns data:null (rendered as not-found), and a denied
 * user gets { ok:false, error:'forbidden' } (rendered as a denied panel). RBAC for the
 * mutations is enforced server-side inside each action; getSoCapabilities is an
 * advisory server-side probe used ONLY to disable + tooltip controls, never trusted
 * for authorisation.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found (null SO → honest panel), permission-denied (denied panel, no crash).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getSalesOrder,
  allocateSalesOrder,
  deallocateSalesOrder,
  transitionSalesOrderStatus,
  updateSalesOrder,
  deleteSalesOrder,
} from '../_actions/so-actions';
import { getSoCapabilities } from '../_actions/so-form-data';
import { createShipment } from '../_actions/pack-actions';
import { createPickList, getPickListForSalesOrder } from '../_actions/pick-actions';
import { getCreateShipmentCapability } from '../shipments/_actions/shipments-data';
import { DocumentAuditTimelineSection } from '../../_components/audit-timeline/document-audit-timeline-section';
import { SoDetailView, type SoDetailLabels, type SoActionResult } from '../_components/so-detail-view';
import {
  CreateShipmentButton,
  type CreateShipmentLabels,
  type CreateShipmentResult,
} from '../shipments/_components/create-shipment-button';
import {
  CreatePickListButton,
  type CreatePickListLabels,
  type CreatePickListResult,
} from '../_components/create-pick-list-button';

/** Thin client-facing adapters so the client view's narrow `{ ok; error: string }`
 *  seam type lines up with the server result unions (which carry richer error
 *  variants like ILLEGAL_TRANSITION / INSUFFICIENT_STOCK). */
async function allocateAction(id: string): Promise<SoActionResult> {
  'use server';
  const result = await allocateSalesOrder(id);
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
async function deallocateAction(id: string): Promise<SoActionResult> {
  'use server';
  const result = await deallocateSalesOrder(id);
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
async function transitionAction(id: string, status: string): Promise<SoActionResult> {
  'use server';
  const result = await transitionSalesOrderStatus(
    id,
    status as Parameters<typeof transitionSalesOrderStatus>[1],
  );
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
async function updateSoAction(
  id: string,
  input: {
    requiredDate?: string | null;
    notes?: string | null;
    lines?: Array<{ id: string; qty?: string; notes?: string | null; unit_price_gbp?: string }>;
  },
): Promise<SoActionResult> {
  'use server';
  const result = await updateSalesOrder(id, input);
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
async function deleteSoAction(id: string): Promise<SoActionResult> {
  'use server';
  const result = await deleteSalesOrder(id);
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
/** Server-wired createShipment seam for the additive [Create shipment] button. RBAC is
 *  enforced server-side inside createShipment (ship.pack.close); the capability probe is
 *  advisory UI gating only. */
async function createShipmentAction(soId: string): Promise<CreateShipmentResult> {
  'use server';
  return createShipment(soId);
}
async function createPickListAction(soId: string): Promise<CreatePickListResult> {
  'use server';
  return createPickList(soId);
}

function buildCreateShipmentLabels(
  t: Awaited<ReturnType<typeof getTranslations>>,
): CreateShipmentLabels {
  return {
    label: t('createShipment.label'),
    pending: t('createShipment.pending'),
    noPermission: t('createShipment.noPermission'),
    notPicked: t('createShipment.notPicked'),
    notShippable: t('createShipment.notShippable'),
    errors: {
      forbidden: t('createShipment.errors.forbidden'),
      invalid_state: t('createShipment.errors.invalid_state'),
      open_shipment_exists: t('createShipment.errors.open_shipment_exists'),
      persistence_failed: t('createShipment.errors.persistence_failed'),
    },
  };
}

function buildCreatePickListLabels(
  tPick: Awaited<ReturnType<typeof getTranslations>>,
): CreatePickListLabels {
  return {
    label: tPick('createPickList.label'),
    pending: tPick('createPickList.pending'),
    noPermission: tPick('createPickList.noPermission'),
    notAllocated: tPick('createPickList.notAllocated'),
    notPickable: tPick('createPickList.notPickable'),
    goToPick: tPick('createPickList.goToPick'),
    errors: {
      forbidden: tPick('createPickList.errors.forbidden'),
      invalid_state: tPick('createPickList.errors.invalid_state'),
      open_pick_list_exists: tPick('createPickList.errors.open_pick_list_exists'),
      no_allocations: tPick('createPickList.errors.no_allocations'),
      persistence_failed: tPick('createPickList.errors.persistence_failed'),
    },
  };
}

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; soId: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="so-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): SoDetailLabels {
  return {
    status: {
      draft: t('soStatus.draft'),
      confirmed: t('soStatus.confirmed'),
      allocated: t('soStatus.allocated'),
      partially_picked: t('soStatus.partially_picked'),
      picked: t('soStatus.picked'),
      partially_packed: t('soStatus.partially_packed'),
      packed: t('soStatus.packed'),
      manifested: t('soStatus.manifested'),
      shipped: t('soStatus.shipped'),
      partially_delivered: t('soStatus.partially_delivered'),
      delivered: t('soStatus.delivered'),
      cancelled: t('soStatus.cancelled'),
    },
    allocation: {
      unallocated: t('allocationStatus.unallocated'),
      partially_allocated: t('allocationStatus.partially_allocated'),
      allocated: t('allocationStatus.allocated'),
    },
    summary: {
      title: t('detail.summary.title'),
      customer: t('detail.summary.customer'),
      status: t('detail.summary.status'),
      allocation: t('detail.summary.allocation'),
      expected: t('detail.summary.expected'),
      created: t('detail.summary.created'),
      lines: t('detail.summary.lines'),
      total: t('detail.summary.total'),
    },
    lines: {
      title: t('detail.lines.title'),
      seq: t('detail.lines.seq'),
      item: t('detail.lines.item'),
      qty: t('detail.lines.qty'),
      uom: t('detail.lines.uom'),
      unitPrice: t('detail.lines.unitPrice'),
      discount: t('detail.lines.discount'),
      tax: t('detail.lines.tax'),
      currency: t('detail.lines.currency'),
      lineTotal: t('detail.lines.lineTotal'),
      allocated: t('detail.lines.allocated'),
      allocationStatus: t('detail.lines.allocationStatus'),
      empty: t('detail.lines.empty'),
    },
    edit: {
      title: t('detail.edit.title'),
      requestedLabel: t('detail.edit.requestedLabel'),
      notesLabel: t('detail.edit.notesLabel'),
      lineItem: t('detail.edit.lineItem'),
      lineQty: t('detail.edit.lineQty'),
      lineUom: t('detail.edit.lineUom'),
      lineUnitPrice: t('detail.edit.lineUnitPrice'),
      lineDiscount: t('detail.edit.lineDiscount'),
      lineTax: t('detail.edit.lineTax'),
      lineCurrency: t('detail.edit.lineCurrency'),
      lineTotal: t('detail.edit.lineTotal'),
      lineNotes: t('detail.edit.lineNotes'),
      submit: t('detail.edit.submit'),
      submitting: t('detail.edit.submitting'),
      cancel: t('detail.edit.cancel'),
      errors: {
        linesInvalid: t('detail.edit.errors.linesInvalid'),
        priceInvalid: t('detail.edit.errors.priceInvalid'),
        termsInvalid: t('detail.edit.errors.termsInvalid'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_draft: t('errors.not_draft'),
        persistence_failed: t('errors.persistence_failed'),
      },
    },
    actions: {
      title: t('detail.actions.title'),
      allocate: t('detail.actions.allocate'),
      deallocate: t('detail.actions.deallocate'),
      confirm: t('detail.actions.confirm'),
      cancel: t('detail.actions.cancel'),
      edit: t('detail.actions.edit'),
      delete: t('detail.actions.delete'),
      deletePrompt: t('detail.actions.deletePrompt'),
      pending: t('detail.actions.pending'),
      confirmPrompt: t('detail.actions.confirmPrompt'),
      noPermission: t('detail.actions.noPermission'),
      notAvailable: t('detail.actions.notAvailable'),
    },
    notesTitle: t('detail.notesTitle'),
    errors: {
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      ILLEGAL_TRANSITION: t('errors.illegalTransition'),
      INSUFFICIENT_STOCK: t('errors.insufficientStock'),
      persistence_failed: t('errors.persistence_failed'),
      so_cancel_blocked_shipped: t('errors.so_cancel_blocked_shipped'),
      deallocate_not_allowed: t('errors.deallocate_not_allowed'),
      not_draft: t('errors.not_draft'),
    },
  };
}

async function DetailContent({ locale, soId }: { locale: string; soId: string }) {
  const t = await getTranslations('Shipping.salesOrders');
  const tShip = await getTranslations('Shipping.shipments');
  const tPick = await getTranslations('Shipping.pick');
  const [result, caps, shipCaps, pickListResult] = await Promise.all([
    getSalesOrder(soId),
    getSoCapabilities(),
    getCreateShipmentCapability(),
    getPickListForSalesOrder(soId),
  ]);

  if (!result.ok) {
    return (
      <div role="note" data-testid="so-detail-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-800">
        {t('denied')}
      </div>
    );
  }

  const so = result.data;
  if (!so) {
    return (
      <div role="note" data-testid="so-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        <p className="mb-3">{t('detail.notFound')}</p>
        <Link href={`/${locale}/shipping`} prefetch={false} className="text-blue-700 hover:underline">
          {t('detail.backToList')}
        </Link>
      </div>
    );
  }

  const hasOpenPickList =
    pickListResult.ok &&
    pickListResult.data != null &&
    ['pending', 'assigned', 'in_progress'].includes(pickListResult.data.status);

  return (
    <div className="flex flex-col gap-4">
    <SoDetailView
      locale={locale}
      caps={caps}
      createPickListSlot={
        <CreatePickListButton
          locale={locale}
          soId={so.id}
          soStatus={so.status}
          hasOpenPickList={hasOpenPickList}
          canPick={pickListResult.ok ? pickListResult.canPick : false}
          labels={buildCreatePickListLabels(tPick)}
          createPickListAction={createPickListAction}
        />
      }
      createShipmentSlot={
        <CreateShipmentButton
          locale={locale}
          soId={so.id}
          soStatus={so.status}
          canCreate={shipCaps.canCreate}
          labels={buildCreateShipmentLabels(tShip)}
          createShipmentAction={createShipmentAction}
        />
      }
      so={{
        id: so.id,
        soNumber: so.so_number,
        status: so.status,
        customerName: so.customer_name,
        customerCode: so.customer_code,
        expectedShipDate: so.expected_ship_date,
        notes: so.notes,
        createdAt: so.created_at,
        allocationStatus: so.allocation_status,
        lines: so.lines.map((l) => ({
          id: l.id,
          lineNo: l.line_no,
          itemCode: l.item_code,
          itemName: l.item_name,
          qty: l.qty,
          uom: l.uom,
          allocatedQty: l.allocated_qty,
          allocationStatus: l.allocation_status,
          unitPriceGbp: l.unit_price_gbp,
          lineTotalGbp: l.line_total_gbp,
          discountPct: l.discount_pct,
          taxPct: l.tax_pct,
          currency: l.currency,
          notes: l.notes,
        })),
      }}
      labels={buildLabels(t)}
      allocateSalesOrderAction={allocateAction}
      deallocateSalesOrderAction={deallocateAction}
      transitionSalesOrderStatusAction={transitionAction}
      updateSalesOrderAction={updateSoAction}
      deleteSalesOrderAction={deleteSoAction}
    />
    <DocumentAuditTimelineSection entityType="sales_order" entityId={so.id} locale={locale} />
    </div>
  );
}

export default async function SalesOrderDetailPage({ params }: PageProps) {
  const { locale, soId } = await params;
  const t = await getTranslations('Shipping.salesOrders');

  return (
    <main
      data-screen="shipping-so-detail"
      data-prototype-label="ship_so_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        breadcrumb={[
          { label: t('breadcrumb.shipping'), href: `/${locale}/shipping` },
          { label: t('breadcrumb.salesOrders'), href: `/${locale}/shipping` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} soId={soId} />
      </Suspense>
    </main>
  );
}
