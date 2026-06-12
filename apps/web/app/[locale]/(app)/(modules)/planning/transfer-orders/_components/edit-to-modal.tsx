'use client';

/**
 * P2-PLANNING (Wave R1 reversibility) — Edit DRAFT Transfer Order modal.
 *
 * Prototype parity:
 *   - "Edit" header action on a DRAFT TO        → to-screens.jsx:112 (draft action map:
 *       [["Edit","secondary"],["Cancel","danger"]]) + to-screens.jsx:143 (l==="Edit"
 *       → setModal("toEdit")) + to-screens.jsx:277 (<TOCreateModal editing={t}/>).
 *   - header edit fields (from/to warehouse,     → modals.jsx:684-820 (TOCreateModal,
 *       expected date, notes) reused in edit mode    data-prototype-label "to_create_edit_modal";
 *                                                     line 764 titles "Edit Transfer Order").
 *
 * The prototype's TOCreateModal IS the edit modal (editing prop). This mirrors it,
 * restricted to the header fields updateTransferOrder accepts (line edits are inline
 * on the detail table — documented deviation, same as the create-to collapse).
 *
 * Contract (Codex planning lane, imported never authored):
 *   updateTransferOrder({ id, fromWarehouseId?, toWarehouseId?, expectedDate?, notes? })
 *   — DRAFT-only, 409 invalid_state otherwise.
 *
 * Red lines: from/to = @monopilot/ui Select over the REAL warehouses master (same
 * source as create); distinct-warehouse client hint (V-PLAN-TO-001: To ≠ From);
 * errors mapped inline (invalid_state → "not draft anymore"). RBAC server-side.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import type { WarehouseOption } from '../_actions/to-form-data';

export type EditToLabels = {
  title: string;
  fromWarehouseLabel: string;
  toWarehouseLabel: string;
  warehousePlaceholder: string;
  expectedDateLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    warehousesRequired: string;
    sameWarehouse: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    invalid_state: string;
    persistence_failed: string;
  };
};

export type EditToResult = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

export type EditToModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: EditToLabels;
  warehouses: WarehouseOption[];
  initial: {
    id: string;
    fromWarehouseId: string | null;
    toWarehouseId: string | null;
    /** From the detail (column scheduled_date); sent to the action as expectedDate. */
    expectedDate: string | null;
    notes: string | null;
  };
  updateTransferOrderAction: (input: {
    id: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    expectedDate?: string;
    notes?: string;
  }) => Promise<EditToResult>;
  onSaved: () => void;
};

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function EditToModal({
  open,
  onOpenChange,
  labels,
  warehouses,
  initial,
  updateTransferOrderAction,
  onSaved,
}: EditToModalProps) {
  const [fromWarehouseId, setFromWarehouseId] = React.useState(initial.fromWarehouseId ?? '');
  const [toWarehouseId, setToWarehouseId] = React.useState(initial.toWarehouseId ?? '');
  const [expectedDate, setExpectedDate] = React.useState(toDateInput(initial.expectedDate));
  const [notes, setNotes] = React.useState(initial.notes ?? '');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setFromWarehouseId(initial.fromWarehouseId ?? '');
      setToWarehouseId(initial.toWarehouseId ?? '');
      setExpectedDate(toDateInput(initial.expectedDate));
      setNotes(initial.notes ?? '');
      setPending(false);
      setFormError(null);
    }
  }, [open, initial.id, initial.fromWarehouseId, initial.toWarehouseId, initial.expectedDate, initial.notes]);

  const warehouseOptions = React.useMemo(
    () => [
      { value: '', label: labels.warehousePlaceholder },
      ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ],
    [warehouses, labels.warehousePlaceholder],
  );

  // Distinct-warehouse client hint (V-PLAN-TO-001). Surfaced live, not just on submit.
  const sameWarehouse = !!fromWarehouseId && fromWarehouseId === toWarehouseId;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!fromWarehouseId || !toWarehouseId) {
      setFormError(labels.errors.warehousesRequired);
      return;
    }
    if (sameWarehouse) {
      setFormError(labels.errors.sameWarehouse);
      return;
    }
    setPending(true);
    try {
      const result = await updateTransferOrderAction({
        id: initial.id,
        fromWarehouseId,
        toWarehouseId,
        expectedDate: expectedDate || undefined,
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

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="plan_to_edit">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="edit-to-form" onSubmit={onSubmit} data-testid="edit-to-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="edit-to-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.fromWarehouseLabel}</span>
              <Select value={fromWarehouseId} onValueChange={setFromWarehouseId} aria-label={labels.fromWarehouseLabel} options={warehouseOptions} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.toWarehouseLabel}</span>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId} aria-label={labels.toWarehouseLabel} options={warehouseOptions} />
            </label>
          </div>

          {sameWarehouse ? (
            <p role="note" data-testid="edit-to-same-warehouse-hint" className="text-xs text-amber-700">
              {labels.errors.sameWarehouse}
            </p>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.expectedDateLabel}</span>
            <Input type="date" value={expectedDate} data-testid="edit-to-expected" onChange={(e) => setExpectedDate(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="edit-to-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="edit-to-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="edit-to-form"
          className="btn--primary"
          data-testid="edit-to-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
