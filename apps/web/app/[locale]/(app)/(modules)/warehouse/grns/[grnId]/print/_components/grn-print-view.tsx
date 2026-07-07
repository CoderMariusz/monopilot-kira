'use client';

import type { GrnDocumentData } from '../../../../../../../../../lib/documents/types';
import { Code128Barcode } from '../../../../../../../../../lib/barcode/code128-barcode';

export type GrnPrintLabels = {
  title: string;
  documentNumber: string;
  printAction: string;
  back: string;
  generatedAt: string;
  companyVat: string;
  facts: {
    source: string;
    supplier: string;
    receiptDate: string;
    warehouse: string;
    status: string;
    sourceDocument: string;
    completedAt: string;
    none: string;
  };
  notes: string;
  columns: {
    line: string;
    item: string;
    ordered: string;
    received: string;
    batch: string;
    expiry: string;
    lp: string;
    gtin: string;
  };
  totals: {
    title: string;
    lines: string;
    received: string;
    cancelledLine: string;
  };
  footer: string;
};

const PRINT_STYLES = `
  @media print {
    [data-testid="app-sidebar"],
    [data-testid="app-topbar"],
    [data-print-hide="true"] {
      display: none !important;
    }
    body {
      background: #fff !important;
    }
    [data-testid="grn-print-document"] {
      box-shadow: none !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
    }
  }
  @page {
    margin: 12mm;
  }
`;

function dash(labels: GrnPrintLabels) {
  return labels.facts.none;
}

function formatDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  return iso.slice(0, 10);
}

export function GrnPrintView({ document, labels }: { document: GrnDocumentData; labels: GrnPrintLabels }) {
  const none = dash(labels);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        <div data-print-hide="true" className="flex items-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => typeof window !== 'undefined' && window.print()}
            data-testid="grn-print-action"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {labels.printAction}
          </button>
          <span className="text-sm text-slate-500">{labels.generatedAt.replace('{at}', document.generatedAt.slice(0, 19))}</span>
        </div>

        <article
          data-testid="grn-print-document"
          data-document-number={document.documentNumber}
          className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="mb-8 flex flex-col gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">{labels.title}</p>
              <h1 className="font-mono text-2xl font-semibold text-slate-900" data-testid="grn-print-number">
                {document.documentNumber}
              </h1>
              <p className="text-sm text-slate-600">
                {labels.documentNumber}: <span className="font-mono">{document.documentNumber}</span>
              </p>
            </div>
            <div className="text-right text-sm text-slate-700">
              <p className="text-base font-semibold text-slate-900">{document.company.tradingName}</p>
              {document.company.legalName && document.company.legalName !== document.company.tradingName ? (
                <p>{document.company.legalName}</p>
              ) : null}
              {document.company.vat ? (
                <p>{labels.companyVat.replace('{vat}', document.company.vat)}</p>
              ) : null}
              {document.company.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {document.company.email ? <p>{document.company.email}</p> : null}
              {document.company.phone ? <p>{document.company.phone}</p> : null}
            </div>
          </header>

          <section
            data-testid="grn-print-facts"
            className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.source}</p>
              <p className="font-medium text-slate-900">{document.sourceType.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.supplier}</p>
              <p>{document.supplierName ?? none}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.receiptDate}</p>
              <p className="font-mono">{formatDate(document.receiptDate, none)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.warehouse}</p>
              <p className="font-mono">{document.warehouseCode ?? none}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.status}</p>
              <p>{document.status}</p>
            </div>
            {document.sourceDocumentNumber ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.sourceDocument}</p>
                <p className="font-mono">{document.sourceDocumentNumber}</p>
              </div>
            ) : null}
            {document.completedAt ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.completedAt}</p>
                <p className="font-mono">{formatDate(document.completedAt, none)}</p>
              </div>
            ) : null}
          </section>

          {document.notes ? (
            <section data-testid="grn-print-notes" className="mb-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <strong className="text-slate-900">{labels.notes}:</strong> {document.notes}
            </section>
          ) : null}

          <section data-testid="grn-print-lines">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">{labels.columns.line}</th>
                  <th className="py-2 pr-2">{labels.columns.item}</th>
                  <th className="py-2 pr-2 text-right">{labels.columns.ordered}</th>
                  <th className="py-2 pr-2 text-right">{labels.columns.received}</th>
                  <th className="py-2 pr-2">{labels.columns.batch}</th>
                  <th className="py-2 pr-2">{labels.columns.expiry}</th>
                  <th className="py-2 pr-2 text-right">{labels.columns.lp}</th>
                  <th className="py-2 text-right">{labels.columns.gtin}</th>
                </tr>
              </thead>
              <tbody>
                {document.lines.map((line) => (
                  <tr
                    key={line.lineNumber}
                    data-testid={`grn-print-line-${line.lineNumber}`}
                    className={`border-b border-slate-100 ${line.cancelled ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                  >
                    <td className="py-2 pr-2 font-mono text-xs">{line.lineNumber}</td>
                    <td className="py-2 pr-2">
                      <div>{line.itemName ?? none}</div>
                      {line.itemCode ? <div className="font-mono text-[11px] text-slate-500">{line.itemCode}</div> : null}
                      {line.cancelled ? (
                        <span className="text-[10px] uppercase text-red-600 no-underline">{labels.totals.cancelledLine}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                      {line.orderedQty == null ? none : `${line.orderedQty} ${line.uom}`}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                      {line.receivedQty} {line.uom}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs">{line.batchNumber ?? none}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{line.expiryDate ?? none}</td>
                    <td className="py-2 text-right font-mono text-xs">{line.lpNumber ?? none}</td>
                    <td className="py-2 text-right">
                      {line.gs1Gtin && !line.cancelled ? (
                        <div className="ml-auto w-36 print:w-40">
                          <Code128Barcode
                            data-testid={`grn-print-gtin-barcode-${line.lineNumber}`}
                            value={line.gs1Gtin}
                            field="ean"
                            symbology="ean13"
                            barHeight={28}
                          />
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-slate-400">{none}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section data-testid="grn-print-totals" className="mt-6 flex flex-col items-end gap-1 text-sm">
            <p className="font-semibold text-slate-900">{labels.totals.title}</p>
            <p>{labels.totals.lines.replace('{count}', String(document.totals.liveLineCount))}</p>
            {document.totals.receivedByUom.map((entry) => (
              <p key={entry.uom} className="font-mono tabular-nums">
                {labels.totals.received.replace('{qty}', entry.totalReceived).replace('{uom}', entry.uom)}
              </p>
            ))}
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
            {labels.footer.replace('{number}', document.documentNumber)}
          </footer>
        </article>
      </div>
    </>
  );
}
