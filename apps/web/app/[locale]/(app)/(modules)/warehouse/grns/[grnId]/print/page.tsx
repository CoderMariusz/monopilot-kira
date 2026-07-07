/** Printable GRN HTML view (browser print / Save as PDF). */
import Link from 'next/link';
import type { ReactNode } from 'react';

import { getGrnDocument } from '../../../_actions/grn-document-actions';
import { getWhcTranslator } from '../../../wh-c-labels';
import { GrnPrintView, type GrnPrintLabels } from './_components/grn-print-view';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; grnId: string }> };

function buildLabels(t: ReturnType<typeof getWhcTranslator>): GrnPrintLabels {
  return {
    title: t('grnPrint.title'),
    documentNumber: t('grnPrint.documentNumber'),
    printAction: t('grnPrint.printAction'),
    back: t('grnPrint.back'),
    generatedAt: t('grnPrint.generatedAt'),
    companyVat: t('grnPrint.companyVat'),
    facts: {
      source: t('grnDetail.facts.source'),
      supplier: t('grnDetail.facts.supplier'),
      receiptDate: t('grnDetail.facts.receiptDate'),
      warehouse: t('grnDetail.facts.warehouse'),
      status: t('grnDetail.facts.status'),
      sourceDocument: t('grnPrint.facts.sourceDocument'),
      completedAt: t('grnPrint.facts.completedAt'),
      none: t('grnDetail.facts.none'),
    },
    notes: t('grnDetail.notesLabel'),
    columns: {
      line: t('grnDetail.columns.line'),
      item: t('grnDetail.columns.item'),
      ordered: t('grnDetail.columns.ordered'),
      received: t('grnDetail.columns.received'),
      batch: t('grnDetail.columns.batch'),
      expiry: t('grnDetail.columns.expiry'),
      lp: t('grnDetail.columns.lp'),
    },
    totals: {
      title: t('grnPrint.totals.title'),
      lines: t('grnPrint.totals.lines'),
      received: t('grnPrint.totals.received'),
      cancelledLine: t('grnPrint.totals.cancelledLine'),
    },
    footer: t('grnPrint.footer'),
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

export default async function GrnPrintPage({ params }: PageProps) {
  const { locale, grnId } = await params;
  const t = getWhcTranslator(locale);
  const labels = buildLabels(t);
  const backHref = `/${locale}/warehouse/grns/${grnId}`;

  const result = await getGrnDocument(grnId);

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <Panel testid="grn-print-denied" tone="amber" backHref={backHref} backLabel={labels.back}>
          {t('grnDetail.denied')}
        </Panel>
      );
    }
    if (result.reason === 'not_found') {
      return (
        <Panel testid="grn-print-not-found" tone="slate" backHref={backHref} backLabel={labels.back}>
          {t('grnDetail.notFound')}
        </Panel>
      );
    }
    return (
      <Panel testid="grn-print-error" tone="red" backHref={backHref} backLabel={labels.back}>
        {t('grnDetail.error')}
      </Panel>
    );
  }

  return (
    <main data-screen="warehouse-grn-print" className="min-h-screen bg-slate-100 print:bg-white">
      <div data-print-hide="true" className="mx-auto max-w-4xl px-4 pt-4 print:hidden">
        <Link href={backHref} data-testid="grn-print-back" className="text-sm text-sky-700 hover:underline">
          ← {labels.back}
        </Link>
      </div>
      <GrnPrintView document={result.data} labels={labels} />
    </main>
  );
}
