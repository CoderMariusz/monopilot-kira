'use client';

/**
 * P2-PLANNING (Wave R1 reversibility) — Edit DRAFT Work Order modal.
 *
 * Prototype parity: wo-detail.jsx:10 (draft action map: [["Edit","secondary"],
 * ["Delete","danger"],["Release","primary"]]) — the DRAFT "Edit" affordance. There
 * is no dedicated edit-WO modal in the prototype; the create surface is reused. This
 * MIRRORS create-wo-modal.tsx (same FG-restricted ItemPicker, same conversion-preview
 * quantity pattern, same line/machine @monopilot/ui Selects, same schedule + notes),
 * prefilled from the loaded WO and restricted to the updateWorkOrder contract fields.
 *
 * Contract (Codex planning lane, imported never authored):
 *   updateWorkOrder({ id, productId?, plannedQuantity?, scheduledStartTime?,
 *                     productionLineId?, machineId?, notes? })
 *   — DRAFT only; changing product/qty RE-SNAPSHOTS materials + operations
 *     server-side. We surface that honestly (EN+PL) so planning knows components
 *     and operations will be rebuilt.
 *
 * Red lines: product picker = FG-restricted ItemPicker over the REAL items master;
 * line/machine = Select over the real masters; quantity entered in the product's
 * OUTPUT unit and converted to base for the contract (same as create). Errors mapped
 * inline (invalid_state → "not draft anymore"). RBAC server-side.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import {
  toBaseQty,
  snapshotFromItemRow,
  TypedError,
  type OutputUom,
  type UomSnapshot,
} from '../../../../../../../lib/uom/convert';
import type { FgProductOption, ProductionResources, SearchFgProductsInput } from '../_actions/wo-form-data';

type PickedProduct = {
  id: string;
  itemCode: string;
  name: string;
  uomBase: string;
  snapshot: UomSnapshot;
};

export type EditWoLabels = {
  title: string;
  /** Honest note: editing product/qty rebuilds components + operations. */
  resnapshotNote: string;
  productLabel: string;
  changeProduct: string;
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
  quantityLabel: string;
  quantityPlaceholder: string;
  quantityUom?: { base: string; each: string; box: string };
  conversionPreview?: string;
  scheduledStartLabel: string;
  lineLabel: string;
  machineLabel: string;
  noneOption: string;
  notesLabel: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    quantityRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    invalid_state: string;
    uom_conversion_unavailable?: string;
    persistence_failed: string;
  };
};

export type EditWoResult =
  | { ok: true; workOrder: unknown }
  | { ok: false; error: string; issues?: unknown };

export type EditWoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: EditWoLabels;
  resources: ProductionResources;
  /** Current WO header values to prefill (plannedQuantity is in base `uom`). */
  initial: {
    id: string;
    productId: string;
    itemCode: string | null;
    productName: string | null;
    uomBase: string;
    plannedQuantity: string;
    scheduledStartTime: string | null;
    productionLineId: string | null;
    machineId: string | null;
    notes: string | null;
  };
  searchFgProductsAction: (input: SearchFgProductsInput) => Promise<FgProductOption[]>;
  updateWorkOrderAction: (params: {
    id: string;
    productId?: string;
    plannedQuantity?: string;
    scheduledStartTime?: string;
    productionLineId?: string;
    machineId?: string;
    notes?: string;
  }) => Promise<EditWoResult>;
  onSaved: () => void;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

function fmtKg(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function EditWoModal({
  open,
  onOpenChange,
  labels,
  resources,
  initial,
  searchFgProductsAction,
  updateWorkOrderAction,
  onSaved,
}: EditWoModalProps) {
  // null product = unchanged (keep the WO's current product). A picked product is a
  // product CHANGE → re-snapshot, and the qty is then entered in its output unit.
  const [changedProduct, setChangedProduct] = React.useState<PickedProduct | null>(null);
  const [quantity, setQuantity] = React.useState(initial.plannedQuantity);
  const [scheduledStart, setScheduledStart] = React.useState(toDateInput(initial.scheduledStartTime));
  const [lineId, setLineId] = React.useState(initial.productionLineId ?? '');
  const [machineId, setMachineId] = React.useState(initial.machineId ?? '');
  const [notes, setNotes] = React.useState(initial.notes ?? '');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setChangedProduct(null);
      setQuantity(initial.plannedQuantity);
      setScheduledStart(toDateInput(initial.scheduledStartTime));
      setLineId(initial.productionLineId ?? '');
      setMachineId(initial.machineId ?? '');
      setNotes(initial.notes ?? '');
      setPending(false);
      setFormError(null);
    }
  }, [
    open,
    initial.id,
    initial.plannedQuantity,
    initial.scheduledStartTime,
    initial.productionLineId,
    initial.machineId,
    initial.notes,
  ]);

  const rowsById = React.useRef<Map<string, FgProductOption>>(new Map());
  const pickerSearch: ItemSearchFn = React.useCallback(
    async (input) => {
      const rows = await searchFgProductsAction({ query: input.query });
      for (const r of rows) rowsById.current.set(r.id, r);
      return rows.map<ItemPickerOption>((r) => ({
        id: r.id,
        itemCode: r.itemCode,
        name: r.name,
        itemType: 'fg',
        status: 'active',
        costPerKgEur: null,
        uomBase: r.uomBase,
      }));
    },
    [searchFgProductsAction],
  );

  function onPickProduct(item: ItemPickerOption) {
    const row = rowsById.current.get(item.id);
    const snapshot = snapshotFromItemRow((row as unknown as Record<string, unknown>) ?? { uom_base: item.uomBase });
    setChangedProduct({ id: item.id, itemCode: item.itemCode, name: item.name, uomBase: item.uomBase, snapshot });
    // Reset qty when switching product — it is now in the new product's output unit.
    setQuantity('');
    setFormError(null);
  }

  // Output unit drives the qty label + conversion preview. Unchanged product = the
  // WO already stores base qty, so we edit in base (no preview). A changed product
  // is entered in its output unit (preview shows the base-kg conversion).
  const pickedUom: OutputUom = changedProduct?.snapshot.outputUom ?? 'base';
  const unitWord =
    pickedUom === 'box' ? labels.quantityUom?.box : pickedUom === 'each' ? labels.quantityUom?.each : undefined;
  const qtyLabel = unitWord ? `${labels.quantityLabel} (${unitWord})` : labels.quantityLabel;

  let conversionPreview: string | null = null;
  if (changedProduct && pickedUom !== 'base' && QTY_PATTERN.test(quantity.trim()) && Number(quantity) > 0) {
    try {
      const baseKg = toBaseQty(changedProduct.snapshot, Number(quantity.trim()), pickedUom);
      conversionPreview =
        labels.conversionPreview
          ?.replace('{qty}', quantity.trim())
          .replace('{unit}', unitWord ?? pickedUom)
          .replace('{kg}', fmtKg(baseKg))
          .replace('{base}', changedProduct.snapshot.uomBase) ?? null;
    } catch {
      conversionPreview = labels.errors.uom_conversion_unavailable ?? null;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!QTY_PATTERN.test(quantity.trim()) || Number(quantity) <= 0) {
      setFormError(labels.errors.quantityRequired);
      return;
    }

    // Resolve the base-qty for the contract. Unchanged product → qty is already base.
    // Changed product → convert from its output unit.
    let plannedBase: string;
    if (changedProduct && pickedUom !== 'base') {
      try {
        plannedBase = String(toBaseQty(changedProduct.snapshot, Number(quantity.trim()), pickedUom));
      } catch (err) {
        setFormError(
          err instanceof TypedError
            ? labels.errors.uom_conversion_unavailable ?? labels.errors.invalid_input
            : labels.errors.invalid_input,
        );
        return;
      }
    } else {
      plannedBase = quantity.trim();
    }

    setPending(true);
    try {
      const result = await updateWorkOrderAction({
        id: initial.id,
        // Only send productId when it actually changed (re-snapshot trigger).
        productId: changedProduct ? changedProduct.id : undefined,
        plannedQuantity: plannedBase,
        scheduledStartTime: scheduledStart ? new Date(scheduledStart + 'T00:00:00').toISOString() : undefined,
        productionLineId: lineId || undefined,
        machineId: machineId || undefined,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        const map = labels.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  const currentProductLabel = changedProduct
    ? `${changedProduct.itemCode} — ${changedProduct.name}`
    : `${initial.itemCode ?? '—'}${initial.productName ? ` — ${initial.productName}` : ''}`;

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="plan_wo_edit">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="edit-wo-form" onSubmit={onSubmit} data-testid="edit-wo-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="edit-wo-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          {/* Honest re-snapshot note (EN+PL via i18n). */}
          <div role="note" data-testid="edit-wo-resnapshot-note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {labels.resnapshotNote}
          </div>

          {/* Product — unchanged shows current identity; "Change product" opens the picker. */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.productLabel}</span>
            <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="edit-wo-product">
              <span className="font-mono font-semibold text-blue-700">{currentProductLabel}</span>
              {changedProduct ? (
                <button type="button" className="btn btn--ghost btn-sm" data-testid="edit-wo-product-reset" onClick={() => { setChangedProduct(null); setQuantity(initial.plannedQuantity); }}>
                  ✕
                </button>
              ) : null}
            </div>
            {!changedProduct ? (
              <div className="mt-1">
                <ItemPicker
                  searchItemsAction={pickerSearch}
                  onSelect={onPickProduct}
                  triggerClassName="btn btn--secondary btn-sm"
                  labels={{
                    trigger: labels.changeProduct,
                    searchLabel: labels.picker.searchLabel,
                    searchPlaceholder: labels.picker.searchPlaceholder,
                    loading: labels.picker.loading,
                    empty: labels.picker.empty,
                    cancel: labels.picker.cancel,
                    error: labels.picker.error,
                  }}
                />
              </div>
            ) : null}
          </div>

          {/* Planned quantity (output unit when product changed; base otherwise). */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{qtyLabel}</span>
            <Input
              type="text"
              inputMode="decimal"
              value={quantity}
              data-testid="edit-wo-quantity"
              placeholder={labels.quantityPlaceholder}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {conversionPreview ? (
              <span data-testid="edit-wo-conversion" className="text-xs text-slate-500">
                {conversionPreview}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.scheduledStartLabel}</span>
            <Input type="date" value={scheduledStart} data-testid="edit-wo-scheduled-start" onChange={(e) => setScheduledStart(e.target.value)} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.lineLabel}</span>
              <Select
                value={lineId}
                onValueChange={setLineId}
                aria-label={labels.lineLabel}
                options={[{ value: '', label: labels.noneOption }, ...resources.lines.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))]}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.machineLabel}</span>
              <Select
                value={machineId}
                onValueChange={setMachineId}
                aria-label={labels.machineLabel}
                options={[{ value: '', label: labels.noneOption }, ...resources.machines.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))]}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="edit-wo-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="edit-wo-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="edit-wo-form"
          className="btn--primary"
          data-testid="edit-wo-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
