'use client';

/**
 * P2-PLANNING — Create Purchase Order modal.
 *
 * Prototype parity:
 *   - "＋ Create PO" primary trigger        → po-screens.jsx:45
 *   - supplier select + line editor          → po-screens.jsx:66 (supplier select),
 *       208 ("＋ Add line"), 210-248 (PO lines table: product / qty / uom /
 *       unit price). The create modal collapses the prototype's read-only detail
 *       lines table into an editable line editor matching the reviewed
 *       createPurchaseOrder input contract.
 *
 * Red lines honoured:
 *   - Supplier = shadcn-family @monopilot/ui Select (NO raw <select>) loaded from
 *     the REAL public.suppliers master via listPoSuppliers — never the prototype's
 *     hardcoded <option> list (po-screens.jsx:66, documented deviation).
 *   - Line item = the established ItemPicker combobox over the REAL items master
 *     (purchase_order_lines.item_id → items.id) — never free text, never hardcoded.
 *   - createPurchaseOrder is the source of truth: this surfaces its result and maps
 *     forbidden / invalid_input / already_exists / persistence_failed to honest
 *     inline states. RBAC (npd.planning.write) is enforced server-side inside it.
 *
 * Input contract (procurement-shared PurchaseOrderCreateInput): poNumber, supplierId,
 * status (defaults draft), expectedDelivery? (yyyy-mm-dd), currency (3 chars),
 * notes?, lines[] of { itemId, qty (positive numeric string), uom, unitPrice
 * (non-negative numeric string), lineNo (1-based) }. min 1 line.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onCreated), error (validation + forbidden/already_exists/persistence_failed inline
 * alert). No client-trusted permissions.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items';
import type { PoSupplierOption } from '../_actions/po-form-data';
import { UomSelect, type UomOptionLabels } from '../../../../../../../components/forms/uom-select';

export type CreatePoLabels = {
  title: string;
  poNumberLabel: string;
  poNumberPlaceholder: string;
  /** Helper under the (now optional) number field: "Leave empty to auto-number…". */
  poNumberHelp: string;
  supplierLabel: string;
  supplierPlaceholder: string;
  expectedLabel: string;
  currencyLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  linesTitle: string;
  addLine: string;
  removeLine: string;
  lineItem: string;
  lineQty: string;
  lineUom: string;
  lineUnitPrice: string;
  uomPlaceholder: string;
  /**
   * Display labels for the UoM dropdown options, keyed by unit code. Covers the
   * canonical units (kg/g/l/…) and any org-defined unit read from the real
   * unit_of_measure master.
   */
  uomOptions: UomOptionLabels;
  /**
   * Ordered unit codes to offer in the UoM dropdown. Sourced from the org's
   * unit_of_measure master so admin-added units appear; when empty the dropdown
   * keeps its canonical default set.
   */
  uomUnits?: readonly string[];
  qtyPlaceholder: string;
  unitPricePlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    poNumberRequired: string;
    supplierRequired: string;
    linesRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    already_exists: string;
    invalid_state: string;
    persistence_failed: string;
  };
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
};

type CreatePoLine = {
  key: string;
  item: ItemPickerOption | null;
  qty: string;
  uom: string;
  unitPrice: string;
};

export type CreatePoResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

export type CreatePoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreatePoLabels;
  suppliers: PoSupplierOption[];
  /** Server Action seams (passed from the RSC; never authored here). */
  searchPoItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  createPurchaseOrderAction: (input: {
    /** Optional — createPurchaseOrder auto-generates a per-org number when omitted. */
    poNumber?: string;
    supplierId: string;
    expectedDelivery?: string;
    currency: string;
    notes?: string;
    lines: Array<{ itemId: string; qty: string; uom: string; unitPrice: string; lineNo: number }>;
  }) => Promise<CreatePoResult>;
  /** Called after a successful create so the list can refresh. */
  onCreated: () => void;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,4})?$/;

function makeLine(): CreatePoLine {
  return { key: Math.random().toString(36).slice(2), item: null, qty: '', uom: '', unitPrice: '' };
}

export function CreatePoModal({
  open,
  onOpenChange,
  labels,
  suppliers,
  searchPoItemsAction,
  createPurchaseOrderAction,
  onCreated,
}: CreatePoModalProps) {
  const [poNumber, setPoNumber] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [expected, setExpected] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<CreatePoLine[]>(() => [makeLine()]);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Reset all field + status state whenever the modal is closed.
  React.useEffect(() => {
    if (!open) {
      setPoNumber('');
      setSupplierId('');
      setExpected('');
      setNotes('');
      setLines([makeLine()]);
      setPending(false);
      setFormError(null);
    }
  }, [open]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const currency = selectedSupplier?.currency ?? 'EUR';

  function updateLine(key: string, patch: Partial<CreatePoLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, makeLine()]);
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Number is OPTIONAL: blank → the action auto-numbers per-org. No required check.
    if (!supplierId) {
      setFormError(labels.errors.supplierRequired);
      return;
    }
    const validLines = lines.filter(
      (l) => l.item && QTY_PATTERN.test(l.qty.trim()) && Number(l.qty) > 0 && l.uom.trim().length > 0,
    );
    if (validLines.length === 0) {
      setFormError(labels.errors.linesRequired);
      return;
    }

    setPending(true);
    try {
      const result = await createPurchaseOrderAction({
        poNumber: poNumber.trim() || undefined,
        supplierId,
        expectedDelivery: expected || undefined,
        currency,
        notes: notes.trim() || undefined,
        lines: validLines.map((l, idx) => ({
          itemId: l.item!.id,
          qty: l.qty.trim(),
          uom: l.uom.trim(),
          unitPrice: PRICE_PATTERN.test(l.unitPrice.trim()) ? l.unitPrice.trim() : '0',
          lineNo: idx + 1,
        })),
      });

      if (!result.ok) {
        const map = labels.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onCreated();
      onOpenChange(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" modalId="plan_po_create">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-po-form" onSubmit={onSubmit} data-testid="create-po-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="create-po-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* PO number */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.poNumberLabel}</span>
              <Input
                type="text"
                value={poNumber}
                data-testid="create-po-number"
                placeholder={labels.poNumberPlaceholder}
                onChange={(e) => setPoNumber(e.target.value)}
              />
              <span className="text-xs text-slate-500" data-testid="create-po-number-help">
                {labels.poNumberHelp}
              </span>
            </label>

            {/* Supplier — real suppliers master */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.supplierLabel}</span>
              <Select
                value={supplierId}
                onValueChange={setSupplierId}
                aria-label={labels.supplierLabel}
                placeholder={labels.supplierPlaceholder}
                options={suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
              />
            </label>

            {/* Expected delivery */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.expectedLabel}</span>
              <Input
                type="date"
                value={expected}
                data-testid="create-po-expected"
                onChange={(e) => setExpected(e.target.value)}
              />
            </label>

            {/* Currency (derived from supplier, read-only display) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.currencyLabel}</span>
              <Input type="text" value={currency} data-testid="create-po-currency" readOnly />
            </label>
          </div>

          {/* Line editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{labels.linesTitle}</span>
              <Button type="button" className="btn--secondary btn-sm" data-testid="create-po-add-line" onClick={addLine}>
                {labels.addLine}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm" data-testid="create-po-lines">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{labels.lineItem}</th>
                    <th className="px-3 py-2 text-right">{labels.lineQty}</th>
                    <th className="px-3 py-2">{labels.lineUom}</th>
                    <th className="px-3 py-2 text-right">{labels.lineUnitPrice}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} data-testid={`create-po-line-${line.key}`} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-3 py-2">
                        {line.item ? (
                          <div className="flex items-center gap-2 text-sm" data-testid="create-po-line-item">
                            <span className="font-mono font-semibold text-blue-700">{line.item.itemCode}</span>
                            <span className="text-slate-800">{line.item.name}</span>
                            <button
                              type="button"
                              className="btn btn--ghost btn-sm"
                              data-testid="create-po-line-clear"
                              onClick={() => updateLine(line.key, { item: null })}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <ItemPicker
                            searchItemsAction={searchPoItemsAction}
                            onSelect={(item) => updateLine(line.key, { item, uom: line.uom || item.uomBase })}
                            triggerClassName="btn btn--secondary btn-sm"
                            labels={labels.picker}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.qty}
                          data-testid="create-po-line-qty"
                          placeholder={labels.qtyPlaceholder}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-2" data-testid="create-po-line-uom">
                        {/* No free-text units: constrained dropdown defaulting to the
                            picked item's base UoM (set on ItemPicker.onSelect), kept
                            changeable. */}
                        <UomSelect
                          value={line.uom}
                          onValueChange={(uom) => updateLine(line.key, { uom })}
                          labels={labels.uomOptions}
                          {...(labels.uomUnits && labels.uomUnits.length > 0 ? { units: labels.uomUnits } : {})}
                          placeholder={labels.uomPlaceholder}
                          aria-label={labels.lineUom}
                          className="w-24"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.unitPrice}
                          data-testid="create-po-line-price"
                          placeholder={labels.unitPricePlaceholder}
                          onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                          className="w-28 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn-sm"
                            aria-label={labels.removeLine}
                            data-testid="create-po-line-remove"
                            onClick={() => removeLine(line.key)}
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="create-po-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-po-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-po-form"
          className="btn--primary"
          data-testid="create-po-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
