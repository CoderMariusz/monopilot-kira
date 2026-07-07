'use client';

/**
 * Wave-shipping — Create Sales Order modal.
 *
 * Prototype parity (so_create_wizard_modal, shipping/modals.jsx:115-271 + the
 * "＋ Create SO" trigger so-screens.jsx:50): the prototype is a 4-step wizard
 * (header / lines / allergen / review). The reviewed createSalesOrder contract is a
 * single transactional insert of { customer_id, requested_date?, notes?, lines[] of
 * { item_id, qty, uom } } — there is no allergen-cascade / address / review feed in
 * the reviewed backend, so the wizard is collapsed 1:1 into a single honest form
 * matching the real input (documented deviation; matches the PO/TO create-modal
 * pattern).
 *
 * Red lines honoured:
 *   - Customer = shadcn-family @monopilot/ui Select (NO raw <select>) loaded from the
 *     REAL public.customers master via listSoCustomers — never the prototype's
 *     hardcoded <option> list (so-screens.jsx:62, documented deviation).
 *   - Line item = the established ItemPicker combobox over the REAL items master
 *     (sales_order_lines.product_id → items.id, restricted to fg) — never free text.
 *   - UoM = constrained UomSelect dropdown defaulting to the picked item's base UoM —
 *     never free text.
 *   - createSalesOrder is the source of truth: this surfaces its result and maps
 *     forbidden / invalid_input / persistence_failed to honest inline states. RBAC
 *     (ship.so.create) is enforced server-side inside it; never client-trusted.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onCreated), error (validation + forbidden / invalid_input / persistence_failed
 * inline alert).
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker } from '../../../(npd)/_components/item-picker';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../(npd)/fa/actions/search-items-types';
import type { SoCustomerOption } from '../_actions/so-form-data';
import { UomSelect, type UomOptionLabels } from '../../../../../../components/forms/uom-select';

export type CreateSoLabels = {
  title: string;
  customerLabel: string;
  customerPlaceholder: string;
  newCustomer: string;
  newCustomerNamePlaceholder: string;
  createCustomerSubmit: string;
  creatingCustomer: string;
  cancelCustomerCreate: string;
  requestedLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  linesTitle: string;
  addLine: string;
  removeLine: string;
  lineItem: string;
  lineQty: string;
  lineUom: string;
  uomPlaceholder: string;
  /** Display labels for the UoM dropdown options, keyed by unit code. */
  uomOptions: UomOptionLabels;
  qtyPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    customerRequired: string;
    linesRequired: string;
    invalid_input: string;
    forbidden: string;
    already_exists: string;
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

type CreateSoLine = {
  key: string;
  item: ItemPickerOption | null;
  qty: string;
  uom: string;
};

export type CreateSoResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

export type CreateCustomerResult =
  | { ok: true; id: string; data: SoCustomerOption & Record<string, unknown> }
  | { ok: false; error: string; message?: string };

export type CreateSoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreateSoLabels;
  customers: SoCustomerOption[];
  /** Server Action seams (passed from the RSC; never authored here). */
  searchSoItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  createCustomerAction: (input: { name: string; category: 'retail'; isActive: true }) => Promise<CreateCustomerResult>;
  createSalesOrderAction: (input: {
    customer_id: string;
    requested_date?: string;
    notes?: string;
    lines: Array<{ item_id: string; qty: string; uom: string }>;
  }) => Promise<CreateSoResult>;
  /** Called after a successful create so the list can refresh. */
  onCreated: () => void;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

function makeLine(): CreateSoLine {
  return { key: Math.random().toString(36).slice(2), item: null, qty: '', uom: '' };
}

export function CreateSoModal({
  open,
  onOpenChange,
  labels,
  customers,
  searchSoItemsAction,
  createCustomerAction,
  createSalesOrderAction,
  onCreated,
}: CreateSoModalProps) {
  const [customerOptions, setCustomerOptions] = React.useState(customers);
  const [customerId, setCustomerId] = React.useState('');
  const [creatingCustomer, setCreatingCustomer] = React.useState(false);
  const [newCustomerName, setNewCustomerName] = React.useState('');
  const [customerPending, setCustomerPending] = React.useState(false);
  const [requested, setRequested] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<CreateSoLine[]>(() => [makeLine()]);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCustomerOptions(customers);
  }, [customers]);

  // Reset all field + status state whenever the modal is closed.
  React.useEffect(() => {
    if (!open) {
      setCustomerId('');
      setCreatingCustomer(false);
      setNewCustomerName('');
      setCustomerPending(false);
      setRequested('');
      setNotes('');
      setLines([makeLine()]);
      setPending(false);
      setFormError(null);
    }
  }, [open]);

  async function onCreateCustomer() {
    const name = newCustomerName.trim();
    if (name.length < 2) {
      setFormError(labels.errors.customerRequired);
      return;
    }

    setCustomerPending(true);
    setFormError(null);
    try {
      const result = await createCustomerAction({ name, category: 'retail', isActive: true });
      if (!result.ok) {
        const map = labels.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.errors.persistence_failed);
        setCustomerPending(false);
        return;
      }
      const created = { id: result.id, code: result.data.code, name: result.data.name };
      setCustomerOptions((prev) => [...prev.filter((c) => c.id !== created.id), created]);
      setCustomerId(created.id);
      setNewCustomerName('');
      setCreatingCustomer(false);
      setCustomerPending(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setCustomerPending(false);
    }
  }

  function updateLine(key: string, patch: Partial<CreateSoLine>) {
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

    if (!customerId) {
      setFormError(labels.errors.customerRequired);
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
      const result = await createSalesOrderAction({
        customer_id: customerId,
        requested_date: requested || undefined,
        notes: notes.trim() || undefined,
        lines: validLines.map((l) => ({
          item_id: l.item!.id,
          qty: l.qty.trim(),
          uom: l.uom.trim(),
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
    <Modal open={open} onOpenChange={onOpenChange} size="xl" modalId="ship_so_create">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-so-form" onSubmit={onSubmit} data-testid="create-so-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="create-so-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Customer — real customers master */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.customerLabel}</span>
              <Select
                value={customerId}
                onValueChange={setCustomerId}
                aria-label={labels.customerLabel}
                placeholder={labels.customerPlaceholder}
                options={customerOptions.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
              />
              {creatingCustomer ? (
                <div className="mt-2 flex gap-2">
                  <Input
                    type="text"
                    value={newCustomerName}
                    data-testid="create-so-new-customer-name"
                    placeholder={labels.newCustomerNamePlaceholder}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                  />
                  <Button
                    type="button"
                    className="btn--secondary btn-sm"
                    data-testid="create-so-new-customer-submit"
                    disabled={customerPending}
                    aria-busy={customerPending}
                    onClick={onCreateCustomer}
                  >
                    {customerPending ? labels.creatingCustomer : labels.createCustomerSubmit}
                  </Button>
                  <Button
                    type="button"
                    className="btn--ghost btn-sm"
                    data-testid="create-so-new-customer-cancel"
                    onClick={() => {
                      setCreatingCustomer(false);
                      setNewCustomerName('');
                    }}
                  >
                    {labels.cancelCustomerCreate}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-blue-700 hover:underline"
                  data-testid="create-so-new-customer"
                  onClick={() => setCreatingCustomer(true)}
                >
                  + {labels.newCustomer}
                </button>
              )}
            </label>

            {/* Requested ship date */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.requestedLabel}</span>
              <Input
                type="date"
                value={requested}
                data-testid="create-so-requested"
                onChange={(e) => setRequested(e.target.value)}
              />
            </label>
          </div>

          {/* Line editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{labels.linesTitle}</span>
              <Button type="button" className="btn--secondary btn-sm" data-testid="create-so-add-line" onClick={addLine}>
                {labels.addLine}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm" data-testid="create-so-lines">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{labels.lineItem}</th>
                    <th className="px-3 py-2 text-right">{labels.lineQty}</th>
                    <th className="px-3 py-2">{labels.lineUom}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} data-testid={`create-so-line-${line.key}`} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-3 py-2">
                        {line.item ? (
                          <div className="flex items-center gap-2 text-sm" data-testid="create-so-line-item">
                            <span className="font-mono font-semibold text-blue-700">{line.item.itemCode}</span>
                            <span className="text-slate-800">{line.item.name}</span>
                            <button
                              type="button"
                              className="btn btn--ghost btn-sm"
                              aria-label={labels.removeLine}
                              data-testid="create-so-line-clear"
                              onClick={() => updateLine(line.key, { item: null })}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <ItemPicker
                            searchItemsAction={searchSoItemsAction}
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
                          data-testid="create-so-line-qty"
                          placeholder={labels.qtyPlaceholder}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-2" data-testid="create-so-line-uom">
                        {/* No free-text units: constrained dropdown defaulting to the
                            picked item's base UoM (set on ItemPicker.onSelect). */}
                        <UomSelect
                          value={line.uom}
                          onValueChange={(uom) => updateLine(line.key, { uom })}
                          labels={labels.uomOptions}
                          placeholder={labels.uomPlaceholder}
                          aria-label={labels.lineUom}
                          className="w-24"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn-sm"
                            aria-label={labels.removeLine}
                            data-testid="create-so-line-remove"
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
              data-testid="create-so-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-so-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-so-form"
          className="btn--primary"
          data-testid="create-so-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
