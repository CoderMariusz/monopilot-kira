'use client';

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';

import type { SoDetail, SoDetailLabels } from './so-detail-view';
import { computeSoLineTotal, formatSoCurrencyDisplay } from '../_actions/sales-line-price';

export type EditSoResult = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

export type EditSoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  so: SoDetail;
  labels: SoDetailLabels['edit'];
  updateSalesOrderAction: (
    soId: string,
    input: {
      requiredDate?: string | null;
      notes?: string | null;
      lines?: Array<{
        id: string;
        qty?: string;
        notes?: string | null;
        unit_price_gbp?: string;
        discount_pct?: string;
        tax_pct?: string;
        currency?: string;
      }>;
    },
  ) => Promise<EditSoResult>;
  onUpdated: () => void;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,4})?$/;
const PCT_PATTERN = /^\d+(?:\.\d{1,4})?$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

type EditLine = {
  id: string;
  itemLabel: string;
  qty: string;
  uom: string;
  unitPriceGbp: string;
  discountPct: string;
  taxPct: string;
  currency: string;
  notes: string;
};

export function EditSoModal({
  open,
  onOpenChange,
  so,
  labels,
  updateSalesOrderAction,
  onUpdated,
}: EditSoModalProps) {
  const [requested, setRequested] = React.useState(so.expectedShipDate ?? '');
  const [notes, setNotes] = React.useState(so.notes ?? '');
  const [lines, setLines] = React.useState<EditLine[]>(() =>
    so.lines.map((line) => ({
      id: line.id,
      itemLabel: [line.itemCode, line.itemName].filter(Boolean).join(' — '),
      qty: line.qty,
      uom: line.uom,
      unitPriceGbp: line.unitPriceGbp,
      discountPct: line.discountPct,
      taxPct: line.taxPct,
      currency: line.currency,
      notes: line.notes ?? '',
    })),
  );
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setRequested(so.expectedShipDate ?? '');
    setNotes(so.notes ?? '');
    setLines(
      so.lines.map((line) => ({
        id: line.id,
        itemLabel: [line.itemCode, line.itemName].filter(Boolean).join(' — '),
        qty: line.qty,
        uom: line.uom,
        unitPriceGbp: line.unitPriceGbp,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
        currency: line.currency,
        notes: line.notes ?? '',
      })),
    );
    setPending(false);
    setFormError(null);
  }, [open, so]);

  function updateLine(id: string, patch: Partial<EditLine>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    for (const line of lines) {
      if (!QTY_PATTERN.test(line.qty.trim()) || Number(line.qty) <= 0) {
        setFormError(labels.errors.linesInvalid);
        return;
      }
      if (!PRICE_PATTERN.test(line.unitPriceGbp.trim()) || Number(line.unitPriceGbp) <= 0) {
        setFormError(labels.errors.priceInvalid);
        return;
      }
      if (
        !PCT_PATTERN.test(line.discountPct.trim()) ||
        Number(line.discountPct) > 100 ||
        !PCT_PATTERN.test(line.taxPct.trim()) ||
        Number(line.taxPct) > 100 ||
        !CURRENCY_PATTERN.test(line.currency.trim())
      ) {
        setFormError(labels.errors.termsInvalid ?? labels.errors.linesInvalid);
        return;
      }
    }

    setPending(true);
    try {
      const result = await updateSalesOrderAction(so.id, {
        requiredDate: requested || null,
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          id: line.id,
          qty: line.qty.trim(),
          notes: line.notes.trim() || null,
          unit_price_gbp: line.unitPriceGbp.trim(),
          discount_pct: line.discountPct.trim(),
          tax_pct: line.taxPct.trim(),
          currency: line.currency.trim().toUpperCase(),
        })),
      });
      if (!result.ok) {
        const map = labels.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onUpdated();
      onOpenChange(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" modalId="ship_so_edit">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="edit-so-form" onSubmit={onSubmit} data-testid="edit-so-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="edit-so-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.requestedLabel}</span>
            <Input type="date" value={requested} data-testid="edit-so-requested" onChange={(e) => setRequested(e.target.value)} />
          </label>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm" data-testid="edit-so-lines">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">{labels.lineItem}</th>
                  <th className="px-3 py-2 text-right">{labels.lineQty}</th>
                  <th className="px-3 py-2">{labels.lineUom}</th>
                  <th className="px-3 py-2 text-right">{labels.lineUnitPrice}</th>
                  <th className="px-3 py-2 text-right">{labels.lineDiscount}</th>
                  <th className="px-3 py-2 text-right">{labels.lineTax}</th>
                  <th className="px-3 py-2">{labels.lineCurrency}</th>
                  <th className="px-3 py-2 text-right">{labels.lineTotal}</th>
                  <th className="px-3 py-2">{labels.lineNotes}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const lineTotal =
                    QTY_PATTERN.test(line.qty) &&
                    PRICE_PATTERN.test(line.unitPriceGbp) &&
                    PCT_PATTERN.test(line.discountPct) &&
                    PCT_PATTERN.test(line.taxPct) &&
                    CURRENCY_PATTERN.test(line.currency)
                      ? formatSoCurrencyDisplay(
                          computeSoLineTotal(
                            line.qty.trim(),
                            line.unitPriceGbp.trim(),
                            line.discountPct.trim(),
                            line.taxPct.trim(),
                          ),
                          line.currency,
                        )
                      : '—';
                  return (
                    <tr key={line.id} data-testid={`edit-so-line-${line.id}`} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-3 py-2 text-slate-800">{line.itemLabel || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.qty}
                          data-testid={`edit-so-line-qty-${line.id}`}
                          onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{line.uom}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.unitPriceGbp}
                          data-testid={`edit-so-line-price-${line.id}`}
                          onChange={(e) => updateLine(line.id, { unitPriceGbp: e.target.value })}
                          className="w-28 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.discountPct}
                          data-testid={`edit-so-line-discount-${line.id}`}
                          onChange={(e) => updateLine(line.id, { discountPct: e.target.value })}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.taxPct}
                          data-testid={`edit-so-line-tax-${line.id}`}
                          onChange={(e) => updateLine(line.id, { taxPct: e.target.value })}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          maxLength={3}
                          value={line.currency}
                          data-testid={`edit-so-line-currency-${line.id}`}
                          onChange={(e) => updateLine(line.id, { currency: e.target.value.toUpperCase() })}
                          className="w-20 font-mono uppercase"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums" data-testid={`edit-so-line-total-${line.id}`}>
                        {lineTotal}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          value={line.notes}
                          data-testid={`edit-so-line-notes-${line.id}`}
                          onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                          className="w-full min-w-32"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea value={notes} data-testid="edit-so-notes" onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full text-sm" />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="edit-so-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button type="submit" form="edit-so-form" className="btn--primary" data-testid="edit-so-submit" disabled={pending} aria-busy={pending}>
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
