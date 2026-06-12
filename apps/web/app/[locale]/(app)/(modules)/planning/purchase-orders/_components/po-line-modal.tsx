'use client';

/**
 * P2-PLANNING (Wave R1) — Add / Edit a DRAFT Purchase Order line.
 *
 * Prototype parity: modals.jsx:182-219 (AddPOLineModal, data-prototype-label
 * "add_po_line_modal") — Product picker + Qty + UoM + Unit price, "Add line" foot.
 * The "edit" mode reuses the same form prefilled (the prototype has no separate
 * edit-line modal; the create surface is reused — documented deviation).
 *
 * Contract (Codex planning lane, imported never authored):
 *   addPurchaseOrderLine({ poId, itemId, qty, uom, unitPrice })
 *   updatePurchaseOrderLine({ poId, lineId, qty?, uom?, unitPrice? })
 *   — both DRAFT-only, 409 invalid_state otherwise.
 *
 * Red lines: item picker = the established ItemPicker combobox over the REAL items
 * master (add mode only; edit mode keeps the existing item, the contract has no
 * itemId change). UoM = constrained UomSelect dropdown, never free text. Errors
 * mapped inline (invalid_input / invalid_state / forbidden). RBAC server-side.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { ItemPicker } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items';
import { UomSelect, type UomValue } from '../../../../../../../components/forms/uom-select';

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export type PoLineModalLabels = {
  addTitle: string;
  editTitle: string;
  lineItem: string;
  lineQty: string;
  lineUom: string;
  lineUnitPrice: string;
  uomPlaceholder: string;
  uomOptions: Partial<Record<UomValue, string>>;
  qtyPlaceholder: string;
  unitPricePlaceholder: string;
  submitAdd: string;
  submitEdit: string;
  submitting: string;
  cancel: string;
  errors: {
    itemRequired: string;
    qtyRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
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

export type PoLineMutationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

/** When editing, the existing line's identity + values to prefill. */
export type EditLineSeed = {
  lineId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  unitPrice: string;
};

export type PoLineModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PoLineModalLabels;
  poId: string;
  /** null = add mode, populated = edit mode. */
  editLine: EditLineSeed | null;
  searchPoItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  addPurchaseOrderLineAction: (input: {
    poId: string;
    itemId: string;
    qty: string;
    uom: string;
    unitPrice: string;
  }) => Promise<PoLineMutationResult>;
  updatePurchaseOrderLineAction: (input: {
    poId: string;
    lineId: string;
    qty?: string;
    uom?: string;
    unitPrice?: string;
  }) => Promise<PoLineMutationResult>;
  onSaved: () => void;
};

export function PoLineModal({
  open,
  onOpenChange,
  labels,
  poId,
  editLine,
  searchPoItemsAction,
  addPurchaseOrderLineAction,
  updatePurchaseOrderLineAction,
  onSaved,
}: PoLineModalProps) {
  const isEdit = editLine !== null;
  const [item, setItem] = React.useState<ItemPickerOption | null>(null);
  const [qty, setQty] = React.useState('');
  const [uom, setUom] = React.useState('');
  const [unitPrice, setUnitPrice] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setItem(null);
      setQty(editLine?.qty ?? '');
      setUom(editLine?.uom ?? '');
      setUnitPrice(editLine?.unitPrice ?? '');
      setPending(false);
      setFormError(null);
    }
  }, [open, editLine?.lineId, editLine?.qty, editLine?.uom, editLine?.unitPrice]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!QTY_PATTERN.test(qty.trim()) || Number(qty) <= 0) {
      setFormError(labels.errors.qtyRequired);
      return;
    }
    if (!uom.trim()) {
      setFormError(labels.errors.qtyRequired);
      return;
    }

    const price = PRICE_PATTERN.test(unitPrice.trim()) ? unitPrice.trim() : '0';

    setPending(true);
    try {
      let result: PoLineMutationResult;
      if (isEdit) {
        result = await updatePurchaseOrderLineAction({
          poId,
          lineId: editLine!.lineId,
          qty: qty.trim(),
          uom: uom.trim(),
          unitPrice: price,
        });
      } else {
        if (!item) {
          setFormError(labels.errors.itemRequired);
          setPending(false);
          return;
        }
        result = await addPurchaseOrderLineAction({
          poId,
          itemId: item.id,
          qty: qty.trim(),
          uom: uom.trim(),
          unitPrice: price,
        });
      }
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

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="default" modalId="plan_po_line">
      <Modal.Header title={isEdit ? labels.editTitle : labels.addTitle} />
      <Modal.Body>
        <form id="po-line-form" onSubmit={onSubmit} data-testid="po-line-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="po-line-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          {/* Item: picker in add mode, read-only identity in edit mode. */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.lineItem}</span>
            {isEdit ? (
              <div className="flex items-center gap-2 text-sm" data-testid="po-line-item-readonly">
                <span className="font-mono font-semibold text-blue-700">{editLine!.itemCode ?? '—'}</span>
                <span className="text-slate-800">{editLine!.itemName ?? '—'}</span>
              </div>
            ) : item ? (
              <div className="flex items-center gap-2 text-sm" data-testid="po-line-item-picked">
                <span className="font-mono font-semibold text-blue-700">{item.itemCode}</span>
                <span className="text-slate-800">{item.name}</span>
                <button type="button" className="btn btn--ghost btn-sm" data-testid="po-line-item-clear" onClick={() => setItem(null)}>
                  ✕
                </button>
              </div>
            ) : (
              <ItemPicker
                searchItemsAction={searchPoItemsAction}
                onSelect={(picked) => {
                  setItem(picked);
                  if (!uom) setUom(picked.uomBase);
                }}
                triggerClassName="btn btn--secondary btn-sm"
                labels={labels.picker}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.lineQty}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={qty}
                data-testid="po-line-qty"
                placeholder={labels.qtyPlaceholder}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.lineUom}</span>
              <UomSelect
                value={uom}
                onValueChange={setUom}
                labels={labels.uomOptions}
                placeholder={labels.uomPlaceholder}
                aria-label={labels.lineUom}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.lineUnitPrice}</span>
            <Input
              type="text"
              inputMode="decimal"
              value={unitPrice}
              data-testid="po-line-price"
              placeholder={labels.unitPricePlaceholder}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="po-line-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="po-line-form"
          className="btn--primary"
          data-testid="po-line-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : isEdit ? labels.submitEdit : labels.submitAdd}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
