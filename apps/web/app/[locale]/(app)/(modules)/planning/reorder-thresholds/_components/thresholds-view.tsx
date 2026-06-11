'use client';

/**
 * CL2 slice 2 — Reorder thresholds client view (mig 178 reorder_thresholds).
 *
 * Simplest honest surface: list every configured per-item threshold + an
 * add/edit modal (item picker over the REAL items master via searchItems,
 * min_qty / reorder_qty decimal inputs, preferred supplier select from the
 * REAL suppliers master) + delete. All writes go through the write-gated
 * upsert/delete Server Actions (npd.planning.write — the PO/TO create family);
 * the list read gates on scheduler.run.read like the rest of the MRP slice.
 *
 * Prototype note: no thresholds screen exists in prototypes/design/Monopilot
 * Design System/planning(-ext)/ — presentation follows the locked
 * MON-design-system conventions (card/table/badge/empty-state, Modal/Button/
 * Input/Select from @monopilot/ui, ItemPicker combobox) used module-wide.
 *
 * UI states: loading, permission-denied (amber note), error (red alert),
 * empty, table; modal idle/pending/error; per-row delete pending.
 */
import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker } from '../../../../(npd)/_components/item-picker';
import type {
  ItemPickerOption,
  SearchItemsInput,
} from '../../../../../../(npd)/fa/actions/search-items';
import type {
  ReorderThresholdRow,
  ThresholdResult,
  ThresholdSupplierOption,
} from '../../_actions/reorder-thresholds';

export type ThresholdsLabels = {
  add: string;
  empty: string;
  emptyHint: string;
  loading: string;
  denied: string;
  error: string;
  edit: string;
  remove: string;
  removing: string;
  days: string;
  noSupplier: string;
  columns: {
    item: string;
    minQty: string;
    reorderQty: string;
    supplier: string;
    leadTime: string;
    updated: string;
  };
  modal: {
    titleAdd: string;
    titleEdit: string;
    itemLabel: string;
    minQtyLabel: string;
    reorderQtyLabel: string;
    reorderQtyHint: string;
    supplierLabel: string;
    supplierNone: string;
    submit: string;
    submitting: string;
    cancel: string;
    clearItem: string;
    errors: {
      itemRequired: string;
      qtyInvalid: string;
      invalid_input: string;
      forbidden: string;
      not_found: string;
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
};

const QTY_PATTERN = /^\d+(?:\.\d{1,6})?$/;

type UpsertInput = {
  itemId: string;
  minQty: string;
  reorderQty: string;
  preferredSupplierId: string | null;
};

export type ThresholdsViewProps = {
  labels: ThresholdsLabels;
  suppliers: ThresholdSupplierOption[];
  /** Server Action seams (injected from the RSC page). */
  listAction: () => Promise<ThresholdResult<ReorderThresholdRow[]>>;
  upsertAction: (input: UpsertInput) => Promise<ThresholdResult<ReorderThresholdRow>>;
  deleteAction: (id: string) => Promise<ThresholdResult<{ id: string }>>;
  searchItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  /** Locale-aware date formatter (server-composed; falls back to the ISO date). */
  dateFormatter?: (iso: string) => string;
};

type ModalState =
  | { open: false }
  | { open: true; editing: ReorderThresholdRow | null };

export function ThresholdsView({
  labels,
  suppliers,
  listAction,
  upsertAction,
  deleteAction,
  searchItemsAction,
  dateFormatter,
}: ThresholdsViewProps) {
  const [rows, setRows] = React.useState<ReorderThresholdRow[] | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [modal, setModal] = React.useState<ModalState>({ open: false });
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setState('loading');
    listAction()
      .then((result) => {
        if (result.ok) {
          setRows(result.data);
          setState('ready');
        } else {
          setState(result.error === 'forbidden' ? 'forbidden' : 'error');
        }
      })
      .catch(() => setState('error'));
  }, [listAction]);

  React.useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const result = await deleteAction(id);
      if (result.ok) load();
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string): string => {
    if (dateFormatter) return dateFormatter(iso);
    return iso.slice(0, 10);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="thresholds-view">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          className="btn--primary"
          data-testid="thresholds-add"
          onClick={() => setModal({ open: true, editing: null })}
        >
          {labels.add}
        </Button>
      </div>

      {state === 'loading' ? (
        <div className="card px-6 py-4 text-sm text-slate-500" data-testid="thresholds-loading">
          {labels.loading}
        </div>
      ) : null}

      {state === 'forbidden' ? (
        <div
          role="note"
          data-testid="thresholds-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {labels.denied}
        </div>
      ) : null}

      {state === 'error' ? (
        <div
          role="alert"
          data-testid="thresholds-error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {labels.error}
        </div>
      ) : null}

      {state === 'ready' && rows !== null && rows.length === 0 ? (
        <div className="card">
          <div className="empty-state" data-testid="thresholds-empty">
            <div className="empty-state-icon" aria-hidden>
              📉
            </div>
            <div className="empty-state-body">{labels.empty}</div>
            <div className="mt-1 text-xs text-slate-400">{labels.emptyHint}</div>
          </div>
        </div>
      ) : null}

      {state === 'ready' && rows !== null && rows.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="thresholds-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">{labels.columns.item}</th>
                  <th className="px-3 py-2 text-right">{labels.columns.minQty}</th>
                  <th className="px-3 py-2 text-right">{labels.columns.reorderQty}</th>
                  <th className="px-3 py-2">{labels.columns.supplier}</th>
                  <th className="px-3 py-2 text-right">{labels.columns.leadTime}</th>
                  <th className="px-3 py-2">{labels.columns.updated}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} data-testid={`threshold-row-${row.itemCode ?? row.itemId}`}>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-semibold text-slate-800">{row.itemCode ?? row.itemId}</div>
                      <div className="text-slate-600">{row.itemName ?? ''}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {row.minQty} {row.uomBase ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {row.reorderQty} {row.uomBase ?? ''}
                    </td>
                    <td className="px-3 py-2">
                      {row.supplierCode ? (
                        <span>
                          <span className="font-mono text-xs font-semibold text-slate-800">{row.supplierCode}</span>{' '}
                          <span className="text-slate-600">{row.supplierName ?? ''}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{labels.noSupplier}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.leadTimeDays !== null ? (
                        <span className="badge badge-gray">
                          {row.leadTimeDays} {labels.days}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDate(row.updatedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn--secondary btn-sm"
                          data-testid={`threshold-edit-${row.itemCode ?? row.itemId}`}
                          onClick={() => setModal({ open: true, editing: row })}
                        >
                          {labels.edit}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn-sm"
                          disabled={deletingId === row.id}
                          data-testid={`threshold-delete-${row.itemCode ?? row.itemId}`}
                          onClick={() => onDelete(row.id)}
                        >
                          {deletingId === row.id ? labels.removing : labels.remove}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {modal.open ? (
        <ThresholdModal
          labels={labels}
          suppliers={suppliers}
          editing={modal.editing}
          searchItemsAction={searchItemsAction}
          upsertAction={upsertAction}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function ThresholdModal({
  labels,
  suppliers,
  editing,
  searchItemsAction,
  upsertAction,
  onClose,
  onSaved,
}: {
  labels: ThresholdsLabels;
  suppliers: ThresholdSupplierOption[];
  editing: ReorderThresholdRow | null;
  searchItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  upsertAction: (input: UpsertInput) => Promise<ThresholdResult<ReorderThresholdRow>>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = React.useState<ItemPickerOption | null>(
    editing
      ? {
          id: editing.itemId,
          itemCode: editing.itemCode ?? editing.itemId,
          name: editing.itemName ?? '',
          itemType: '',
          status: '',
          costPerKgEur: null,
          uomBase: editing.uomBase ?? '',
        }
      : null,
  );
  const [minQty, setMinQty] = React.useState(editing?.minQty ?? '');
  const [reorderQty, setReorderQty] = React.useState(editing?.reorderQty ?? '');
  const [supplierId, setSupplierId] = React.useState(editing?.preferredSupplierId ?? '');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!item) {
      setFormError(labels.modal.errors.itemRequired);
      return;
    }
    if (!QTY_PATTERN.test(minQty.trim()) || !QTY_PATTERN.test(reorderQty.trim())) {
      setFormError(labels.modal.errors.qtyInvalid);
      return;
    }

    setPending(true);
    try {
      const result = await upsertAction({
        itemId: item.id,
        minQty: minQty.trim(),
        reorderQty: reorderQty.trim(),
        preferredSupplierId: supplierId || null,
      });
      if (!result.ok) {
        const map = labels.modal.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.modal.errors.persistence_failed);
        setPending(false);
        return;
      }
      onSaved();
    } catch {
      setFormError(labels.modal.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="md" modalId="plan_threshold_upsert">
      <Modal.Header title={editing ? labels.modal.titleEdit : labels.modal.titleAdd} />
      <Modal.Body>
        <form
          id="threshold-form"
          onSubmit={onSubmit}
          data-testid="threshold-form"
          className="flex flex-col gap-4"
        >
          {formError ? (
            <div
              role="alert"
              data-testid="threshold-form-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          ) : null}

          {/* Item — real items master; locked while editing (the DDL grain is one row per item). */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.modal.itemLabel}</span>
            {item ? (
              <div className="flex items-center gap-2 text-sm" data-testid="threshold-item">
                <span className="font-mono font-semibold text-blue-700">{item.itemCode}</span>
                <span className="text-slate-800">{item.name}</span>
                {!editing ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn-sm"
                    aria-label={labels.modal.clearItem}
                    data-testid="threshold-item-clear"
                    onClick={() => setItem(null)}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ) : (
              <ItemPicker
                searchItemsAction={searchItemsAction}
                onSelect={setItem}
                triggerClassName="btn btn--secondary btn-sm"
                labels={labels.modal.picker}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.modal.minQtyLabel}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={minQty}
                data-testid="threshold-min-qty"
                onChange={(e) => setMinQty(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.modal.reorderQtyLabel}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={reorderQty}
                data-testid="threshold-reorder-qty"
                onChange={(e) => setReorderQty(e.target.value)}
              />
              <span className="text-xs text-slate-500">{labels.modal.reorderQtyHint}</span>
            </label>
          </div>

          {/* Preferred supplier — real suppliers master; optional (soft FK). */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.modal.supplierLabel}</span>
            <Select
              value={supplierId}
              onValueChange={setSupplierId}
              aria-label={labels.modal.supplierLabel}
              placeholder={labels.modal.supplierNone}
              options={[
                { value: '', label: labels.modal.supplierNone },
                ...suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
              ]}
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="threshold-cancel" onClick={onClose}>
          {labels.modal.cancel}
        </Button>
        <Button
          type="submit"
          form="threshold-form"
          className="btn--primary"
          data-testid="threshold-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.modal.submitting : labels.modal.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
