/** Printable delivery note / packing list HTML view (browser print / Save as PDF). */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { getDeliveryNoteDocument } from '../../../_actions/delivery-note-document-actions';
import { DeliveryNotePrintView, type DeliveryNotePrintLabels } from './_components/delivery-note-print-view';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; shipmentId: string }> };

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): DeliveryNotePrintLabels {
  return {
    title: t('deliveryNotePrint.title'),
    documentNumber: t('deliveryNotePrint.documentNumber'),
    printAction: t('deliveryNotePrint.printAction'),
    back: t('deliveryNotePrint.back'),
    generatedAt: t('deliveryNotePrint.generatedAt'),
    companyVat: t('deliveryNotePrint.companyVat'),
    facts: {
      shipment: t('deliveryNotePrint.facts.shipment'),
      salesOrder: t('deliveryNotePrint.facts.salesOrder'),
      customerPo: t('deliveryNotePrint.facts.customerPo'),
      status: t('pack.summary.status'),
      carrier: t('deliveryNotePrint.facts.carrier'),
      tracking: t('deliveryNotePrint.facts.tracking'),
      packedAt: t('deliveryNotePrint.facts.packedAt'),
      shippedAt: t('deliveryNotePrint.facts.shippedAt'),
      none: t('deliveryNotePrint.facts.none'),
    },
    shipTo: {
      title: t('deliveryNotePrint.shipTo.title'),
      customer: t('deliveryNotePrint.shipTo.customer'),
    },
    boxes: {
      title: t('deliveryNotePrint.boxes.title'),
      boxLabel: t('deliveryNotePrint.boxes.boxLabel'),
      ssccLabel: t('pack.boxes.ssccLabel'),
      noSscc: t('pack.boxes.noSscc'),
      empty: t('deliveryNotePrint.boxes.empty'),
      columns: {
        line: t('deliveryNotePrint.boxes.columns.line'),
        item: t('deliveryNotePrint.boxes.columns.item'),
        lot: t('deliveryNotePrint.boxes.columns.lot'),
        lp: t('pack.boxes.colLp'),
        qty: t('pack.boxes.colQty'),
      },
    },
    totals: {
      boxes: t('deliveryNotePrint.totals.boxes'),
    },
    footer: t('deliveryNotePrint.footer'),
  };
}

function Panel({
  testid,
  tone,
  children,
  backHref,
  backLabel,
}: {
  testid: string;
  tone: 'amber' | 'red' | 'slate';
  children: ReactNode;
  backHref: string;
  backLabel: string;
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-6">
      <div role="alert" data-testid={testid} className={`rounded-xl border px-6 py-4 text-sm ${cls}`}>
        {children}
      </div>
      <Link href={backHref} className="text-sm text-sky-700 hover:underline">
        ← {backLabel}
      </Link>
    </div>
  );
}

export default async function DeliveryNotePrintPage({ params }: PageProps) {
  const { locale, shipmentId } = await params;
  const t = await getTranslations('Shipping.shipments');
  const labels = buildLabels(t);
  const backHref = `/${locale}/shipping/shipments/${shipmentId}`;

  const result = await getDeliveryNoteDocument(shipmentId);

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <Panel testid="delivery-note-print-denied" tone="amber" backHref={backHref} backLabel={labels.back}>
          {t('denied')}
        </Panel>
      );
    }
    if (result.reason === 'not_found') {
      return (
        <Panel testid="delivery-note-print-not-found" tone="slate" backHref={backHref} backLabel={labels.back}>
          {t('pack.notFound')}
        </Panel>
      );
    }
    return (
      <Panel testid="delivery-note-print-error" tone="red" backHref={backHref} backLabel={labels.back}>
        {t('error')}
      </Panel>
    );
  }

  return (
    <main data-screen="shipping-delivery-note-print" className="min-h-screen bg-slate-100 print:bg-white">
      <div data-print-hide="true" className="mx-auto max-w-4xl px-4 pt-4 print:hidden">
        <Link
          href={backHref}
          data-testid="delivery-note-print-back"
          className="text-sm text-sky-700 hover:underline"
        >
          ← {labels.back}
        </Link>
      </div>
      <DeliveryNotePrintView document={result.data} labels={labels} />
    </main>
  );
}
