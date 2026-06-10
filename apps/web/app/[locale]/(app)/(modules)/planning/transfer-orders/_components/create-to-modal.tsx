'use client';

/**
 * P2-PLANNING — Create Transfer Order modal.
 *
 * Prototype parity:
 *   - prototypes/planning/to-screens.jsx:37 ("＋ Create TO" primary trigger)
 *   - prototypes/planning/modals.jsx:697-845 (TOCreateModal: From/To warehouse
 *     selects, scheduled date, notes, "TO lines" editor with per-line product
 *     select + qty + derived UoM + add/remove). Collapsed to a single dense form
 *     modal (no LP / priority sub-flows) to match the reviewed createTransferOrder
 *     action shape: toNumber, fromWarehouseId, toWarehouseId, scheduledDate,
 *     notes, lines[{ itemId, qty, uom, lineNo }].
 *
 * Red lines honoured:
 *   - From / To warehouse = @monopilot/ui Select (shadcn family, NO raw <select>),
 *     loaded from the real public.warehouses master via listTransferWarehouses.
 *   - Per-line product = the established ItemPicker combobox over the REAL items
 *     master (searchTransferItems seam) — never free text, never hardcoded. UoM is
 *     derived from the picked item's base UoM (uomBase), mirroring the prototype's
 *     "code → uom" auto-fill.
 *   - The action is the source of truth: this surfaces its result and maps
 *     forbidden / invalid_input / already_exists / persistence_failed to honest
 *     inline states. RBAC is enforced server-side inside createTransferOrder.
 *
 * Deviations (parity evidence): the prototype's priority field, planned-receive
 * date, Save-Draft split button and LP-selection block are dropped — none are
 * backed by the reviewed schema/action. Client validation mirrors the prototype's
 * V-PLAN-TO-001 (To ≠ From) and V-PLAN-TO-003 (≥1 line) rules.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onCreated), error (inline alert). No client-trusted permissions.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import type { WarehouseOption, SearchTransferItemsInput } from '../_actions/to-form-data';

type CreateTransferOrderResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

export type CreateToLabels = {
  title: string;
  toNumberLabel: string;
  toNumberPlaceholder: string;
  fromWarehouseLabel: string;
  toWarehouseLabel: string;
  warehousePlaceholder: string;
  scheduledDateLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  linesTitle: string;
  addLine: string;
  noLines: string;
  lineColumns: { seq: string; product: string; qty: string; uom: string; remove: string };
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
  qtyPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: Record<string, string>;
};

type LineDraft = {
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  qty: string;
};

export type CreateToModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreateToLabels;
  warehouses: WarehouseOption[];
  /** Server Action seams (passed from the RSC; never authored here). */
  searchTransferItemsAction: (input: SearchTransferItemsInput) => Promise<ItemPickerOption[]>;
  createTransferOrderAction: (input: {
    toNumber: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    scheduledDate?: string;
    notes?: string;
    lines: { itemId: string; qty: string; uom: string; lineNo: number }[];
  }) => Promise<CreateTransferOrderResult>;
  /** Called after a successful create so the list can refresh. */
  onCreated: () => void;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

function newLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), itemId: '', itemCode: '', itemName: '', uom: '', qty: '' };
}

export function CreateToModal({
  open,
  onOpenChange,
  labels,
  warehouses,
  searchTransferItemsAction,
  createTransferOrderAction,
  onCreated,
}: CreateToModalProps) {
  const [toNumber, setToNumber] = React.useState('');
  const [fromWarehouseId, setFromWarehouseId] = React.useState('');
  const [toWarehouseId, setToWarehouseId] = React.useState('');
  const [scheduledDate, setScheduledDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<LineDraft[]>([]);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setToNumber('');
      setFromWarehouseId('');
      setToWarehouseId('');
      setScheduledDate('');
      setNotes('');
      setLines([]);
      setPending(false);
      setFormError(null);
    }
  }, [open]);

  // Adapt the transfer-item search action to the ItemPicker's ItemSearchFn
  // contract (the picker may pass itemTypes; a transfer covers all stock items,
  // so we ignore it and let the action's own query drive results).
  const pickerSearch: ItemSearchFn = React.useCallback(
    (input) => searchTransferItemsAction({ query: input.query }),
    [searchTransferItemsAction],
  );

  const warehouseOptions = React.useMemo(
    () => [
      { value: '', label: labels.warehousePlaceholder },
      ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ],
    [warehouses, labels.warehousePlaceholder],
  );

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function pickLineItem(key: string, item: ItemPickerOption) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, itemId: item.id, itemCode: item.itemCode, itemName: item.name, uom: item.uomBase } : l,
      ),
    );
    setFormError(null);
  }
  function setLineQty(key: string, qty: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!toNumber.trim()) {
      setFormError(labels.errors.toNumberRequired);
      return;
    }
    if (!fromWarehouseId || !toWarehouseId) {
      setFormError(labels.errors.warehousesRequired);
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setFormError(labels.errors.sameWarehouse);
      return;
    }
    if (lines.length === 0) {
      setFormError(labels.errors.linesRequired);
      return;
    }
    if (lines.some((l) => !l.itemId)) {
      setFormError(labels.errors.lineProductRequired);
      return;
    }
    if (lines.some((l) => !QTY_PATTERN.test(l.qty.trim()) || Number(l.qty) <= 0)) {
      setFormError(labels.errors.lineQtyRequired);
      return;
    }

    setPending(true);
    try {
      const result = await createTransferOrderAction({
        toNumber: toNumber.trim(),
        fromWarehouseId,
        toWarehouseId,
        scheduledDate: scheduledDate || undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l, i) => ({ itemId: l.itemId, qty: l.qty.trim(), uom: l.uom || 'kg', lineNo: i + 1 })),
      });

      if (!result.ok) {
        setFormError(labels.errors[result.error] ?? labels.errors.persistence_failed);
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
    <Modal open={open} onOpenChange={onOpenChange} size="xl" modalId="plan_to_create">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-to-form" onSubmit={onSubmit} data-testid="create-to-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="create-to-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.toNumberLabel}</span>
            <Input
              type="text"
              value={toNumber}
              data-testid="create-to-number"
              placeholder={labels.toNumberPlaceholder}
              onChange={(e) => setToNumber(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.fromWarehouseLabel}</span>
              <Select
                value={fromWarehouseId}
                onValueChange={setFromWarehouseId}
                aria-label={labels.fromWarehouseLabel}
                options={warehouseOptions}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.toWarehouseLabel}</span>
              <Select
                value={toWarehouseId}
                onValueChange={setToWarehouseId}
                aria-label={labels.toWarehouseLabel}
                options={warehouseOptions}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.scheduledDateLabel}</span>
              <Input
                type="date"
                value={scheduledDate}
                data-testid="create-to-scheduled"
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="create-to-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm"
            />
          </label>

          {/* TO lines editor (parity: modals.jsx:791-829) */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">{labels.linesTitle}</h3>
            <Button type="button" className="btn--secondary btn-sm" data-testid="create-to-add-line" onClick={addLine}>
              + {labels.addLine}
            </Button>
          </div>

          {lines.length === 0 ? (
            <p data-testid="create-to-no-lines" className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
              {labels.noLines}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm" data-testid="create-to-lines-table">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="w-8 px-2 py-2">{labels.lineColumns.seq}</th>
                    <th className="px-2 py-2">{labels.lineColumns.product}</th>
                    <th className="w-28 px-2 py-2 text-right">{labels.lineColumns.qty}</th>
                    <th className="w-16 px-2 py-2">{labels.lineColumns.uom}</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.key} data-testid={`create-to-line-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 font-mono text-xs text-slate-500">{i + 1}</td>
                      <td className="px-2 py-2">
                        {l.itemId ? (
                          <span className="flex items-center gap-2" data-testid={`create-to-line-product-${i}`}>
                            <span className="font-mono font-semibold text-blue-700">{l.itemCode}</span>
                            <span className="text-slate-800">{l.itemName}</span>
                          </span>
                        ) : (
                          <ItemPicker
                            searchItemsAction={pickerSearch}
                            onSelect={(item) => pickLineItem(l.key, item)}
                            triggerClassName="btn btn--secondary btn-sm"
                            labels={labels.picker}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={l.qty}
                          data-testid={`create-to-line-qty-${i}`}
                          placeholder={labels.qtyPlaceholder}
                          onChange={(e) => setLineQty(l.key, e.target.value)}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-600">{l.uom || '—'}</td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          type="button"
                          className="btn--ghost btn-sm"
                          aria-label={labels.lineColumns.remove}
                          data-testid={`create-to-remove-line-${i}`}
                          onClick={() => removeLine(l.key)}
                        >
                          ✕
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-to-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-to-form"
          className="btn--primary"
          data-testid="create-to-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
