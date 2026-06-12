'use client';

/**
 * P2-PLANNING (Wave R1) — Add / Edit a DRAFT Transfer Order line.
 *
 * Prototype parity: modals.jsx:791-829 (TOCreateModal "TO lines" editor — per-line
 * product picker + qty + derived UoM + add/remove). The edit mode reuses the same
 * form prefilled (the prototype has no separate edit-line modal — documented
 * deviation, mirrors the create-to line editor).
 *
 * Contract (Codex planning lane, imported never authored):
 *   addTransferOrderLine(toId, { itemId, quantity, uom, notes? })
 *   updateTransferOrderLine(toId, lineId, { quantity?, uom?, notes? })
 *   deleteTransferOrderLine(toId, lineId)  — wired on the detail row, not here.
 *   — all DRAFT-only, 409 invalid_state otherwise.
 *
 * Red lines: item picker = the established ItemPicker combobox over the REAL items
 * master (add mode); UoM = constrained UomSelect dropdown, never free text. Errors
 * mapped inline. RBAC server-side.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import type { SearchTransferItemsInput } from '../_actions/to-form-data';
import { UomSelect, type UomValue } from '../../../../../../../components/forms/uom-select';

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

export type ToLineModalLabels = {
  addTitle: string;
  editTitle: string;
  lineItem: string;
  lineQty: string;
  lineUom: string;
  uomPlaceholder: string;
  uomOptions: Partial<Record<UomValue, string>>;
  qtyPlaceholder: string;
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

export type ToLineMutationResult = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

export type ToEditLineSeed = {
  lineId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
};

export type ToLineModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ToLineModalLabels;
  toId: string;
  editLine: ToEditLineSeed | null;
  searchTransferItemsAction: (input: SearchTransferItemsInput) => Promise<ItemPickerOption[]>;
  addTransferOrderLineAction: (toId: string, input: { itemId: string; quantity: string; uom: string }) => Promise<ToLineMutationResult>;
  updateTransferOrderLineAction: (toId: string, lineId: string, input: { quantity?: string; uom?: string }) => Promise<ToLineMutationResult>;
  onSaved: () => void;
};

export function ToLineModal({
  open,
  onOpenChange,
  labels,
  toId,
  editLine,
  searchTransferItemsAction,
  addTransferOrderLineAction,
  updateTransferOrderLineAction,
  onSaved,
}: ToLineModalProps) {
  const isEdit = editLine !== null;
  const [item, setItem] = React.useState<ItemPickerOption | null>(null);
  const [qty, setQty] = React.useState('');
  const [uom, setUom] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setItem(null);
      setQty(editLine?.qty ?? '');
      setUom(editLine?.uom ?? '');
      setPending(false);
      setFormError(null);
    }
  }, [open, editLine?.lineId, editLine?.qty, editLine?.uom]);

  const pickerSearch: ItemSearchFn = React.useCallback(
    (input) => searchTransferItemsAction({ query: input.query }),
    [searchTransferItemsAction],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!QTY_PATTERN.test(qty.trim()) || Number(qty) <= 0 || !uom.trim()) {
      setFormError(labels.errors.qtyRequired);
      return;
    }
    setPending(true);
    try {
      let result: ToLineMutationResult;
      if (isEdit) {
        result = await updateTransferOrderLineAction(toId, editLine!.lineId, { quantity: qty.trim(), uom: uom.trim() });
      } else {
        if (!item) {
          setFormError(labels.errors.itemRequired);
          setPending(false);
          return;
        }
        result = await addTransferOrderLineAction(toId, { itemId: item.id, quantity: qty.trim(), uom: uom.trim() });
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
    <Modal open={open} onOpenChange={onOpenChange} size="default" modalId="plan_to_line">
      <Modal.Header title={isEdit ? labels.editTitle : labels.addTitle} />
      <Modal.Body>
        <form id="to-line-form" onSubmit={onSubmit} data-testid="to-line-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="to-line-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.lineItem}</span>
            {isEdit ? (
              <div className="flex items-center gap-2 text-sm" data-testid="to-line-item-readonly">
                <span className="font-mono font-semibold text-blue-700">{editLine!.itemCode ?? '—'}</span>
                <span className="text-slate-800">{editLine!.itemName ?? '—'}</span>
              </div>
            ) : item ? (
              <div className="flex items-center gap-2 text-sm" data-testid="to-line-item-picked">
                <span className="font-mono font-semibold text-blue-700">{item.itemCode}</span>
                <span className="text-slate-800">{item.name}</span>
                <button type="button" className="btn btn--ghost btn-sm" data-testid="to-line-item-clear" onClick={() => setItem(null)}>
                  ✕
                </button>
              </div>
            ) : (
              <ItemPicker
                searchItemsAction={pickerSearch}
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
                data-testid="to-line-qty"
                placeholder={labels.qtyPlaceholder}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.lineUom}</span>
              <UomSelect value={uom} onValueChange={setUom} labels={labels.uomOptions} placeholder={labels.uomPlaceholder} aria-label={labels.lineUom} />
            </label>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="to-line-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="to-line-form"
          className="btn--primary"
          data-testid="to-line-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : isEdit ? labels.submitEdit : labels.submitAdd}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
