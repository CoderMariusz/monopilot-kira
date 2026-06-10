'use client';

/**
 * P2-PLANNING — Create Work Order modal.
 *
 * Prototype parity: wo-list.jsx:94 ("＋ Create WO" primary button) + the
 * planning create flow (modals.jsx wo_create_wizard / draft_wo_review_modal).
 * Collapsed to a single dense form modal (one screen, no multi-step wizard) per
 * the reviewed createWorkOrder action shape: product, planned quantity,
 * scheduled start, line, machine, notes.
 *
 * Red lines honoured:
 *   - Product picker = the established ItemPicker combobox pattern (npd) restricted
 *     to FINISHED GOODS via the searchFgProducts read action seam — real items
 *     master, never free text, never a hardcoded list.
 *   - Line / machine are shadcn-family @monopilot/ui Select (NO raw <select>),
 *     loaded from the real production_lines / machines masters.
 *   - The action is the source of truth: this surfaces its result, including the
 *     `no_active_bom` warning, and maps forbidden/invalid_input/persistence_failed
 *     to honest inline states. RBAC is enforced server-side inside createWorkOrder.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (warning
 * banner when no active BOM, then close + onCreated), error (invalid_input /
 * forbidden / persistence_failed inline alert). No client-trusted permissions.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import type { CreateWorkOrderResult } from '../_actions/shared';
import type { FgProductOption, ProductionResources, SearchFgProductsInput } from '../_actions/wo-form-data';

export type CreateWoLabels = {
  title: string;
  productLabel: string;
  productPlaceholder: string;
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
  scheduledStartLabel: string;
  lineLabel: string;
  machineLabel: string;
  noneOption: string;
  notesLabel: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  selectedProduct: string;
  errors: {
    productRequired: string;
    quantityRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    invalid_state: string;
    persistence_failed: string;
  };
  noBomWarning: string;
};

export type CreateWoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreateWoLabels;
  resources: ProductionResources;
  /** Server Action seams (passed from the RSC; never authored here). */
  searchFgProductsAction: (input: SearchFgProductsInput) => Promise<FgProductOption[]>;
  createWorkOrderAction: (params: {
    productId: string;
    itemCode: string;
    plannedQuantity: string;
    scheduledStartTime?: string;
    productionLineId?: string;
    machineId?: string;
    notes?: string;
  }) => Promise<CreateWorkOrderResult>;
  /** Called after a successful create so the list can refresh. */
  onCreated: (result: Extract<CreateWorkOrderResult, { ok: true }>) => void;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

export function CreateWoModal({
  open,
  onOpenChange,
  labels,
  resources,
  searchFgProductsAction,
  createWorkOrderAction,
  onCreated,
}: CreateWoModalProps) {
  const [product, setProduct] = React.useState<FgProductOption | null>(null);
  const [quantity, setQuantity] = React.useState('');
  const [scheduledStart, setScheduledStart] = React.useState('');
  const [lineId, setLineId] = React.useState('');
  const [machineId, setMachineId] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);

  // Reset all field + status state whenever the modal is (re)opened/closed.
  React.useEffect(() => {
    if (!open) {
      setProduct(null);
      setQuantity('');
      setScheduledStart('');
      setLineId('');
      setMachineId('');
      setNotes('');
      setPending(false);
      setFormError(null);
      setWarning(null);
    }
  }, [open]);

  // Adapt searchFgProducts (Fg shape) to the ItemPicker's ItemSearchFn contract so
  // we reuse the EXACT established combobox component, restricted to fg items.
  const pickerSearch: ItemSearchFn = React.useCallback(
    async (input) => {
      const rows = await searchFgProductsAction({ query: input.query });
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

  function onPick(item: ItemPickerOption) {
    setProduct({ id: item.id, itemCode: item.itemCode, name: item.name, uomBase: item.uomBase });
    setFormError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setWarning(null);

    if (!product) {
      setFormError(labels.errors.productRequired);
      return;
    }
    if (!QTY_PATTERN.test(quantity.trim()) || Number(quantity) <= 0) {
      setFormError(labels.errors.quantityRequired);
      return;
    }

    setPending(true);
    try {
      const result = await createWorkOrderAction({
        productId: product.id,
        itemCode: product.itemCode,
        plannedQuantity: quantity.trim(),
        scheduledStartTime: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        productionLineId: lineId || undefined,
        machineId: machineId || undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setFormError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }

      // Success. Surface the no-active-BOM warning, then hand off to the caller.
      if (result.warning === 'no_active_bom') {
        setWarning(labels.noBomWarning);
      }
      onCreated(result);
      onOpenChange(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="plan_wo_create">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-wo-form" onSubmit={onSubmit} data-testid="create-wo-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="create-wo-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
          {warning ? (
            <div role="status" data-testid="create-wo-warning" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          ) : null}

          {/* Product — FG-restricted ItemPicker */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.productLabel}</span>
            {product ? (
              <div data-testid="create-wo-selected-product" className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-blue-700">{product.itemCode}</span>
                <span className="text-slate-800">{product.name}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn-sm"
                  data-testid="create-wo-clear-product"
                  onClick={() => setProduct(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <ItemPicker
                searchItemsAction={pickerSearch}
                onSelect={onPick}
                triggerClassName="btn btn--secondary"
                labels={{
                  trigger: labels.picker.trigger,
                  searchLabel: labels.picker.searchLabel,
                  searchPlaceholder: labels.picker.searchPlaceholder,
                  loading: labels.picker.loading,
                  empty: labels.picker.empty,
                  cancel: labels.picker.cancel,
                  error: labels.picker.error,
                }}
              />
            )}
          </div>

          {/* Planned quantity (decimal string) */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.quantityLabel}</span>
            <Input
              type="text"
              inputMode="decimal"
              value={quantity}
              data-testid="create-wo-quantity"
              placeholder={labels.quantityPlaceholder}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>

          {/* Scheduled start (date) */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.scheduledStartLabel}</span>
            <Input
              type="date"
              value={scheduledStart}
              data-testid="create-wo-scheduled-start"
              onChange={(e) => setScheduledStart(e.target.value)}
            />
          </label>

          {/* Line / machine selects — from real masters */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.lineLabel}</span>
              <Select
                value={lineId}
                onValueChange={setLineId}
                aria-label={labels.lineLabel}
                options={[
                  { value: '', label: labels.noneOption },
                  ...resources.lines.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
                ]}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.machineLabel}</span>
              <Select
                value={machineId}
                onValueChange={setMachineId}
                aria-label={labels.machineLabel}
                options={[
                  { value: '', label: labels.noneOption },
                  ...resources.machines.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })),
                ]}
              />
            </label>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="create-wo-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-wo-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-wo-form"
          className="btn--primary"
          data-testid="create-wo-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
