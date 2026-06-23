/**
 * Wave-shipping — Shipment pack route (/shipping/shipments/[shipmentId]).
 *
 * Prototype parity: shipping/pack-screens.jsx:48-220 (ShPackStation) — header, scan/
 * enter-LP into the active box, boxes with SSCC + contents, right-rail shipment
 * summary. See shipment-pack-view.tsx for per-region anchors + the honest treatment of
 * the no-source regions (catch-weight grid / dims / ZPL station / ship-confirm — no
 * feed in getShipment; ship-confirm owned by the parallel ship-actions lane).
 *
 * Data: the reviewed getShipment (header + boxes[{ boxNumber, sscc, contents }]) +
 * packLpIntoBox (imported, never authored), run inside withOrgContext (RLS-scoped). The
 * read is org-scoped: an out-of-org id returns { ok:false, error:'not_found' } (rendered
 * as not-found) and a denied user gets { ok:false, error:'forbidden' } (denied panel).
 * RBAC for the pack mutation is enforced server-side inside packLpIntoBox;
 * getCreateShipmentCapability is an advisory server-side probe used ONLY to disable +
 * tooltip the pack control, never client-trusted.
 *
 * UI states: loading (Suspense skeleton, no CLS), error/not-found (honest panel),
 * permission-denied (denied panel). NO raw UUIDs are rendered.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getShipment, packLpIntoBox } from '../../_actions/pack-actions';
import { getCreateShipmentCapability } from '../_actions/shipments-data';
import { ShipmentPackView, type ShipmentPackLabels, type PackLpResult } from '../_components/shipment-pack-view';
import { ShippingTabs } from '../_components/shipping-tabs';

/** Thin client-facing adapter so the client view's narrow seam type lines up with the
 *  server result union. */
async function packLpAction(input: { shipmentId: string; lpId: string; boxId?: string }): Promise<PackLpResult> {
  'use server';
  const result = await packLpIntoBox(input);
  return result.ok ? { ok: true, boxId: result.boxId } : { ok: false, error: result.error };
}

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; shipmentId: string }>;
};

function PackSkeleton() {
  return (
    <div data-testid="shipment-pack-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): ShipmentPackLabels {
  return {
    status: {
      pending: t('status.pending'),
      packing: t('status.packing'),
      packed: t('status.packed'),
      manifested: t('status.manifested'),
      shipped: t('status.shipped'),
      delivered: t('status.delivered'),
      exception: t('status.exception'),
    },
    summary: {
      title: t('pack.summary.title'),
      shipment: t('pack.summary.shipment'),
      salesOrder: t('pack.summary.salesOrder'),
      customer: t('pack.summary.customer'),
      status: t('pack.summary.status'),
      boxes: t('pack.summary.boxes'),
    },
    boxes: {
      title: t('pack.boxes.title'),
      empty: t('pack.boxes.empty'),
      boxLabel: t('pack.boxes.boxLabel'),
      ssccLabel: t('pack.boxes.ssccLabel'),
      noSscc: t('pack.boxes.noSscc'),
      contentsEmpty: t('pack.boxes.contentsEmpty'),
      colLp: t('pack.boxes.colLp'),
      colItem: t('pack.boxes.colItem'),
      colQty: t('pack.boxes.colQty'),
    },
    pack: {
      title: t('pack.control.title'),
      lpLabel: t('pack.control.lpLabel'),
      lpPlaceholder: t('pack.control.lpPlaceholder'),
      boxLabel: t('pack.control.boxLabel'),
      newBox: t('pack.control.newBox'),
      submit: t('pack.control.submit'),
      submitting: t('pack.control.submitting'),
      success: t('pack.control.success'),
      noPermission: t('pack.control.noPermission'),
    },
    errors: {
      invalid_input: t('pack.errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      invalid_state: t('pack.errors.invalid_state'),
      lp_not_allocated: t('pack.errors.lp_not_allocated'),
      already_packed: t('pack.errors.already_packed'),
      invalid_box: t('pack.errors.invalid_box'),
      not_found: t('pack.errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}

async function PackContent({ locale, shipmentId }: { locale: string; shipmentId: string }) {
  const t = await getTranslations('Shipping.shipments');
  const [result, caps] = await Promise.all([getShipment(shipmentId), getCreateShipmentCapability()]);

  if (!result.ok) {
    if (result.error === 'forbidden') {
      return (
        <div role="note" data-testid="shipment-pack-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-800">
          {t('denied')}
        </div>
      );
    }
    return (
      <div role="note" data-testid="shipment-pack-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        <p className="mb-3">{t('pack.notFound')}</p>
        <Link href={`/${locale}/shipping/shipments`} prefetch={false} className="text-blue-700 hover:underline">
          {t('pack.backToList')}
        </Link>
      </div>
    );
  }

  const data = result.data;
  return (
    <ShipmentPackView
      locale={locale}
      caps={{ canPack: caps.canCreate }}
      detail={{
        shipment: { ...data.shipment, weight: null },
        boxes: data.boxes,
      }}
      labels={buildLabels(t)}
      packLpIntoBoxAction={packLpAction}
    />
  );
}

export default async function ShipmentPackPage({ params }: PageProps) {
  const { locale, shipmentId } = await params;
  const t = await getTranslations('Shipping.shipments');

  return (
    <main
      data-screen="shipping-shipment-pack"
      data-prototype-label="ship_pack_station"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('pack.title')}
        breadcrumb={[
          { label: t('breadcrumb.shipping'), href: `/${locale}/shipping` },
          { label: t('breadcrumb.shipments'), href: `/${locale}/shipping/shipments` },
          { label: t('pack.breadcrumbCurrent') },
        ]}
      />
      <ShippingTabs locale={locale} labels={{ salesOrders: t('tabs.salesOrders'), shipments: t('tabs.shipments') }} />
      <Suspense fallback={<PackSkeleton />}>
        <PackContent locale={locale} shipmentId={shipmentId} />
      </Suspense>
    </main>
  );
}
