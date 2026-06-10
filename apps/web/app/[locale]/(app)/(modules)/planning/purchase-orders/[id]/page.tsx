/**
 * P2-PLANNING — Purchase Order detail route (/planning/purchase-orders/[id]).
 *
 * Prototype parity (1:1): prototypes/planning/po-screens.jsx:141-351 (PlanPODetail)
 *   — header (code/supplier/status), PO lines table, summary side panel, status
 *   action buttons. See po-detail-view.tsx for the per-region anchors + the honest
 *   treatment of the no-source regions (GRN progress / approval gate / D365 / status
 *   history — no data in getPurchaseOrder).
 *
 * Data: the reviewed getPurchaseOrder (header + lines) + transitionPurchaseOrderStatus
 * actions (imported, never authored), run inside withOrgContext (RLS-scoped). The
 * read is org-scoped, so a user from another org gets not_found rather than another
 * org's PO. RBAC for the status transition (npd.planning.write) is enforced
 * server-side inside transitionPurchaseOrderStatus; this page never trusts a client
 * flag.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found / invalid id (404-style honest panel), permission-denied (org-scoped
 * read returns not_found for out-of-org ids; transition surfaces forbidden inline).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getPurchaseOrder, transitionPurchaseOrderStatus } from '../_actions/actions';
import { PoDetailView, type PoDetailLabels } from '../_components/po-detail-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="po-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): PoDetailLabels {
  return {
    status: {
      draft: t('poStatus.draft'),
      sent: t('poStatus.sent'),
      confirmed: t('poStatus.confirmed'),
      partially_received: t('poStatus.partially_received'),
      received: t('poStatus.received'),
      cancelled: t('poStatus.cancelled'),
    },
    summary: {
      title: t('detail.summary.title'),
      supplier: t('detail.summary.supplier'),
      status: t('detail.summary.status'),
      expected: t('detail.summary.expected'),
      currency: t('detail.summary.currency'),
      total: t('detail.summary.total'),
      created: t('detail.summary.created'),
    },
    lines: {
      title: t('detail.lines.title'),
      seq: t('detail.lines.seq'),
      item: t('detail.lines.item'),
      qty: t('detail.lines.qty'),
      uom: t('detail.lines.uom'),
      unitPrice: t('detail.lines.unitPrice'),
      lineTotal: t('detail.lines.lineTotal'),
      empty: t('detail.lines.empty'),
    },
    transitions: {
      title: t('detail.transitions.title'),
      send: t('detail.transitions.send'),
      confirm: t('detail.transitions.confirm'),
      receivePartial: t('detail.transitions.receivePartial'),
      receive: t('detail.transitions.receive'),
      cancel: t('detail.transitions.cancel'),
      pending: t('detail.transitions.pending'),
      confirmPrompt: t('detail.transitions.confirmPrompt'),
    },
    notesTitle: t('notes.title'),
    errors: {
      invalid_input: t('errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      already_exists: t('errors.already_exists'),
      invalid_state: t('errors.invalid_state'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}

async function DetailContent({ locale, id }: { locale: string; id: string }) {
  const t = await getTranslations('Planning.purchaseOrders');
  const result = await getPurchaseOrder(id);

  if (!result.ok) {
    if (result.error === 'not_found' || result.error === 'invalid_input') {
      return (
        <div role="note" data-testid="po-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p className="mb-3">{t('detail.notFound')}</p>
          <Link href={`/${locale}/planning/purchase-orders`} prefetch={false} className="text-blue-700 hover:underline">
            {t('detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="po-detail-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const po = result.data;
  return (
    <PoDetailView
      locale={locale}
      po={{
        id: po.id,
        poNumber: po.poNumber,
        supplierCode: po.supplierCode,
        supplierName: po.supplierName,
        status: po.status,
        expectedDelivery: po.expectedDelivery,
        currency: po.currency,
        notes: po.notes,
        createdAt: po.createdAt,
        lines: po.lines.map((l) => ({
          id: l.id,
          itemCode: l.itemCode,
          itemName: l.itemName,
          qty: l.qty,
          uom: l.uom,
          unitPrice: l.unitPrice,
          lineNo: l.lineNo,
        })),
      }}
      labels={buildLabels(t)}
      transitionPurchaseOrderStatusAction={transitionPurchaseOrderStatus}
    />
  );
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('Planning.purchaseOrders');

  return (
    <main
      data-screen="planning-po-detail"
      data-prototype-label="plan_po_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('breadcrumb.purchaseOrders'), href: `/${locale}/planning/purchase-orders` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} id={id} />
      </Suspense>
    </main>
  );
}
