'use client';

import type { DeliveryNoteDocumentData } from '../../../../../../../../../lib/documents/types';

export type DeliveryNotePrintLabels = {
  title: string;
  documentNumber: string;
  printAction: string;
  back: string;
  generatedAt: string;
  companyVat: string;
  facts: {
    shipment: string;
    salesOrder: string;
    customerPo: string;
    status: string;
    carrier: string;
    tracking: string;
    packedAt: string;
    shippedAt: string;
    none: string;
  };
  shipTo: {
    title: string;
    customer: string;
  };
  boxes: {
    title: string;
    boxLabel: string;
    ssccLabel: string;
    noSscc: string;
    empty: string;
    columns: {
      line: string;
      item: string;
      lot: string;
      lp: string;
      qty: string;
    };
  };
  totals: {
    boxes: string;
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
    [data-testid="delivery-note-print-document"] {
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

function dash(labels: DeliveryNotePrintLabels) {
  return labels.facts.none;
}

function formatDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  return iso.slice(0, 10);
}

export function DeliveryNotePrintView({
  document,
  labels,
}: {
  document: DeliveryNoteDocumentData;
  labels: DeliveryNotePrintLabels;
}) {
  const none = dash(labels);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        <div data-print-hide="true" className="flex items-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => typeof window !== 'undefined' && window.print()}
            data-testid="delivery-note-print-action"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {labels.printAction}
          </button>
          <span className="text-sm text-slate-500">
            {labels.generatedAt.replace('{at}', document.generatedAt.slice(0, 19))}
          </span>
        </div>

        <article
          data-testid="delivery-note-print-document"
          data-document-number={document.documentNumber}
          className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="mb-8 flex flex-col gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">{labels.title}</p>
              <h1 className="font-mono text-2xl font-semibold text-slate-900" data-testid="delivery-note-print-number">
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
            data-testid="delivery-note-print-ship-to"
            className="mb-6 rounded-lg border border-slate-200 px-4 py-3 text-sm"
          >
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">{labels.shipTo.title}</p>
            <p className="font-medium text-slate-900">
              {document.shipTo.customerName ?? none}
              {document.shipTo.customerCode ? (
                <span className="ml-2 font-mono text-xs text-slate-500">({document.shipTo.customerCode})</span>
              ) : null}
            </p>
            {document.shipTo.addressLines.map((line) => (
              <p key={line} className="text-slate-700">
                {line}
              </p>
            ))}
          </section>

          <section
            data-testid="delivery-note-print-facts"
            className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.shipment}</p>
              <p className="font-mono font-medium text-slate-900">{document.shipmentNumber}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.salesOrder}</p>
              <p className="font-mono">{document.salesOrderNumber ?? none}</p>
            </div>
            {document.customerPo ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.customerPo}</p>
                <p className="font-mono">{document.customerPo}</p>
              </div>
            ) : null}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.status}</p>
              <p>{document.status}</p>
            </div>
            {document.carrier ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.carrier}</p>
                <p>{document.carrier}</p>
              </div>
            ) : null}
            {document.trackingNumber ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.tracking}</p>
                <p className="font-mono text-xs">{document.trackingNumber}</p>
              </div>
            ) : null}
            {document.packedAt ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.packedAt}</p>
                <p className="font-mono">{formatDate(document.packedAt, none)}</p>
              </div>
            ) : null}
            {document.shippedAt ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{labels.facts.shippedAt}</p>
                <p className="font-mono">{formatDate(document.shippedAt, none)}</p>
              </div>
            ) : null}
          </section>

          <section data-testid="delivery-note-print-boxes">
            <p className="mb-3 text-sm font-semibold text-slate-900">{labels.boxes.title}</p>
            {document.boxes.length === 0 ? (
              <p className="text-sm text-slate-500">{labels.boxes.empty}</p>
            ) : (
              document.boxes.map((box) => (
                <div
                  key={box.boxNumber}
                  data-testid={`delivery-note-print-box-${box.boxNumber}`}
                  className="mb-6 last:mb-0"
                >
                  <div className="mb-2 flex flex-wrap items-baseline gap-3 text-sm">
                    <span className="font-medium text-slate-900">
                      {labels.boxes.boxLabel.replace('{n}', String(box.boxNumber))}
                    </span>
                    <span className="font-mono text-xs text-slate-600">
                      {labels.boxes.ssccLabel}: {box.sscc ?? labels.boxes.noSscc}
                    </span>
                  </div>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-2">{labels.boxes.columns.line}</th>
                        <th className="py-2 pr-2">{labels.boxes.columns.item}</th>
                        <th className="py-2 pr-2">{labels.boxes.columns.lot}</th>
                        <th className="py-2 pr-2">{labels.boxes.columns.lp}</th>
                        <th className="py-2 text-right">{labels.boxes.columns.qty}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {box.lines.map((line) => (
                        <tr
                          key={line.lineNumber}
                          data-testid={`delivery-note-print-line-${box.boxNumber}-${line.lineNumber}`}
                          className="border-b border-slate-100 text-slate-800"
                        >
                          <td className="py-2 pr-2 font-mono text-xs">{line.lineNumber}</td>
                          <td className="py-2 pr-2">
                            <div>{line.itemName ?? none}</div>
                            {line.itemCode ? (
                              <div className="font-mono text-[11px] text-slate-500">{line.itemCode}</div>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 font-mono text-xs">{line.lotNumber ?? none}</td>
                          <td className="py-2 pr-2 font-mono text-xs">{line.lpCode ?? none}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{line.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>

          <section data-testid="delivery-note-print-totals" className="mt-6 text-sm">
            <p>{labels.totals.boxes.replace('{count}', String(document.totalBoxes))}</p>
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
            {labels.footer.replace('{number}', document.documentNumber)}
          </footer>
        </article>
      </div>
    </>
  );
}
