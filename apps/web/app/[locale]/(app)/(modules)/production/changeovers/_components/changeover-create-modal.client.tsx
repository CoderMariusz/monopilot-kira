'use client';

/**
 * B-2 — "New changeover" modal (client island).
 *
 * Prototype parity: production/modals.jsx:315-336 (ChangeoverGateModal) for the
 * gate-modal shell + product/credential rows, extended with the create inputs the
 * read-only ChangeoverScreen (other-screens.jsx:298-397) implies (from→to product,
 * cleaning checklist completion, ATP swab result, notes).
 *
 * DEVIATIONS (red-lines):
 *   - the prototype's raw <select> QA-signer + <select> line are replaced by the
 *     shadcn <Select> (line) + the items-master ItemPicker (products) — never raw
 *     <select>, never free-text product codes (the product must be a real FK from
 *     public.items, reused via the org-scoped searchItems action).
 *   - persistence is the createChangeoverEvent Server Action (C4, imported — never
 *     authored here); slot eligibility / RBAC re-checked server-side.
 */

import { useState } from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';

import type {
  ChangeoverLineOption,
  CreateChangeoverFn,
} from './changeovers-contract';
import type { ChangeoverCreateLabels } from './labels';

export function ChangeoverCreateModal({
  open,
  onClose,
  onCreated,
  lines,
  labels,
  createChangeoverAction,
  searchItemsAction,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  lines: ChangeoverLineOption[];
  labels: ChangeoverCreateLabels;
  createChangeoverAction: CreateChangeoverFn;
  // FG search seam — defaults to the org-scoped searchItems action at the page.
  searchItemsAction: ItemSearchFn<'fg'>;
}) {
  const [lineId, setLineId] = useState('');
  const [fromProduct, setFromProduct] = useState<ItemPickerOption | null>(null);
  const [toProduct, setToProduct] = useState<ItemPickerOption | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [atp, setAtp] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLineId('');
    setFromProduct(null);
    setToProduct(null);
    setCleaning(false);
    setAtp('');
    setNotes('');
    setError(null);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  function mapError(code: 'forbidden' | 'invalid_input' | 'error'): string {
    if (code === 'forbidden') return labels.errors.forbidden;
    if (code === 'invalid_input') return labels.errors.invalid_input;
    return labels.errors.generic;
  }

  async function submit() {
    setError(null);
    if (!lineId) {
      setError(labels.validation.lineRequired);
      return;
    }
    if (!toProduct) {
      setError(labels.validation.toProductRequired);
      return;
    }
    setBusy(true);
    const result = await createChangeoverAction({
      lineId,
      fromProductId: fromProduct?.id,
      toProductId: toProduct.id,
      cleaningCompleted: cleaning,
      atpResult: atp.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(mapError(result.error));
      return;
    }
    reset();
    onCreated();
  }

  const lineOptions = lines.map((l) => ({ value: l.id, label: l.code }));

  return (
    <Modal
      open={open}
      onOpenChange={(n) => (n ? undefined : close())}
      size="md"
      modalId="changeover_create_modal"
      dismissible={!busy}
    >
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.subtitle}</p>
        {error ? (
          <div
            role="alert"
            data-testid="changeover-create-error"
            className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
        <div data-testid="changeover-create-form" className="space-y-3">
          <div>
            <label htmlFor="changeover-line" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.line} <span aria-hidden className="text-red-500">*</span>
            </label>
            <Select
              id="changeover-line"
              aria-label={labels.line}
              value={lineId}
              onValueChange={setLineId}
              options={lineOptions}
              placeholder={labels.linePlaceholder}
              disabled={busy}
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fromProduct}</span>
            {fromProduct ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm">
                <span className="font-mono text-slate-700" data-testid="changeover-from-product">
                  {fromProduct.itemCode} · {fromProduct.name}
                </span>
                <button
                  type="button"
                  data-testid="changeover-from-clear"
                  onClick={() => setFromProduct(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  {labels.clearProduct}
                </button>
              </div>
            ) : (
              <ItemPicker<'fg'>
                labels={labels.picker}
                itemTypes={['fg']}
                searchItemsAction={searchItemsAction}
                onSelect={setFromProduct}
                disabled={busy}
              />
            )}
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {labels.toProduct} <span aria-hidden className="text-red-500">*</span>
            </span>
            {toProduct ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm">
                <span className="font-mono text-slate-700" data-testid="changeover-to-product">
                  {toProduct.itemCode} · {toProduct.name}
                </span>
                <button
                  type="button"
                  data-testid="changeover-to-clear"
                  onClick={() => setToProduct(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  {labels.clearProduct}
                </button>
              </div>
            ) : (
              <ItemPicker<'fg'>
                labels={labels.picker}
                itemTypes={['fg']}
                searchItemsAction={searchItemsAction}
                onSelect={setToProduct}
                disabled={busy}
                triggerClassName="changeover-to-trigger"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              data-testid="changeover-cleaning"
              checked={cleaning}
              onChange={(e) => setCleaning(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 rounded border-slate-300"
            />
            {labels.cleaning}
          </label>

          <div>
            <label htmlFor="changeover-atp" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.atp}
            </label>
            <Input
              id="changeover-atp"
              data-testid="changeover-atp"
              value={atp}
              onChange={(e) => setAtp(e.target.value)}
              placeholder={labels.atpPlaceholder}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="changeover-notes" className="mb-1 block text-sm font-medium text-slate-700">
              {labels.notes}
            </label>
            <textarea
              id="changeover-notes"
              data-testid="changeover-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={labels.notesPlaceholder}
              disabled={busy}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="changeover-create-cancel" disabled={busy} onClick={close}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="changeover-create-submit" disabled={busy} onClick={submit}>
          {busy ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
