'use client';

/**
 * P2-PLANNING (Wave R1 reversibility) — Edit DRAFT Purchase Order modal.
 *
 * Prototype parity:
 *   - "Edit" header action on a DRAFT PO       → po-screens.jsx:150 (draft action map:
 *       [["Edit","secondary"],["Cancel","danger"],["Submit","primary"]])
 *   - header edit fields (supplier / expected / → po-screens.jsx:166-186 (the read-only
 *       currency / notes)                           detail header this modal makes editable)
 *   - The line-level Edit/Delete row actions + "+ Add line" live on the detail lines
 *       table itself (po-detail-view.tsx) — anchor po-screens.jsx:210 ("＋ Add line").
 *
 * There is NO dedicated "edit PO" modal in the prototype: the draft Edit button reuses
 * the create surface. This modal therefore MIRRORS create-po-modal.tsx (same supplier
 * Select source, same field family, same shadcn @monopilot/ui components) restricted to
 * the header fields the updatePurchaseOrder contract accepts, prefilled from the loaded
 * PO. Documented deviation: header-only here; line edits are inline on the detail table.
 *
 * Contract (Codex planning lane, imported never authored):
 *   updatePurchaseOrder({ id, supplierId?, expectedDelivery?, currency?, notes? })
 *   — DRAFT-only, 409 invalid_state otherwise.
 *
 * Red lines: supplier = @monopilot/ui Select over the REAL suppliers master (same
 * source as create); currency derived from the picked supplier (read-only, matching
 * create); errors mapped to honest inline states (invalid_state → "not draft anymore").
 * RBAC enforced server-side inside updatePurchaseOrder; never client-trusted.
 *
 * UI states: idle (prefilled), optimistic (pending — submit disabled + busy), success
 * (close + onSaved → router.refresh), error (inline alert, incl. invalid_state).
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import type { PoSupplierOption } from '../_actions/po-form-data';

export type EditPoLabels = {
  title: string;
  supplierLabel: string;
  supplierPlaceholder: string;
  expectedLabel: string;
  currencyLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    supplierRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    invalid_state: string;
    persistence_failed: string;
  };
};

export type EditPoResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

export type EditPoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: EditPoLabels;
  suppliers: PoSupplierOption[];
  /** Current PO header values to prefill. */
  initial: {
    id: string;
    supplierId: string | null;
    expectedDelivery: string | null;
    currency: string;
    notes: string | null;
  };
  updatePurchaseOrderAction: (input: {
    id: string;
    supplierId?: string;
    expectedDelivery?: string;
    currency?: string;
    notes?: string;
  }) => Promise<EditPoResult>;
  /** Called after a successful save so the detail can refresh. */
  onSaved: () => void;
};

/** ISO timestamp / date → the yyyy-mm-dd a <input type=date> expects. */
function toDateInput(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function EditPoModal({
  open,
  onOpenChange,
  labels,
  suppliers,
  initial,
  updatePurchaseOrderAction,
  onSaved,
}: EditPoModalProps) {
  const [supplierId, setSupplierId] = React.useState(initial.supplierId ?? '');
  const [expected, setExpected] = React.useState(toDateInput(initial.expectedDelivery));
  const [notes, setNotes] = React.useState(initial.notes ?? '');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Re-seed every time the modal opens (or the underlying PO changes).
  React.useEffect(() => {
    if (open) {
      setSupplierId(initial.supplierId ?? '');
      setExpected(toDateInput(initial.expectedDelivery));
      setNotes(initial.notes ?? '');
      setPending(false);
      setFormError(null);
    }
  }, [open, initial.id, initial.supplierId, initial.expectedDelivery, initial.notes]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  // Currency follows the supplier (same rule as create); fall back to the PO's own.
  const currency = selectedSupplier?.currency ?? initial.currency;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError(labels.errors.supplierRequired);
      return;
    }

    setPending(true);
    try {
      const result = await updatePurchaseOrderAction({
        id: initial.id,
        supplierId,
        // Empty date input clears the field server-side; send '' so the action can
        // distinguish "cleared" from "unchanged" (the contract treats undefined as
        // no-op, '' as explicit clear). We always send the resolved values.
        expectedDelivery: expected.trim(),
        currency,
        notes: notes.trim(),
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

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="plan_po_edit">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="edit-po-form" onSubmit={onSubmit} data-testid="edit-po-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="edit-po-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.expectedLabel}</span>
              <Input
                type="date"
                value={expected}
                data-testid="edit-po-expected"
                onChange={(e) => setExpected(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.currencyLabel}</span>
              <Input type="text" value={currency} data-testid="edit-po-currency" readOnly />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="edit-po-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="edit-po-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="edit-po-form"
          className="btn--primary"
          data-testid="edit-po-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
