'use client';

import { useState } from 'react';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { freshTransactionId } from './use-wo-action';
import type { WoWasteCategory, WoShiftOption } from './types';
import { ErrorBanner, FieldRow, mapError, shiftLabel, type BaseModalProps } from './shared';

// ── Log waste ──────────────────────────────────────────────────────────────

export function WasteModal({
  open,
  woId,
  labels,
  run,
  onClose,
  categories,
  shifts = [],
}: BaseModalProps & { categories: WoWasteCategory[]; shifts: WoShiftOption[] }) {
  const [categoryCode, setCategoryCode] = useState('');
  const [qty, setQty] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qtyValid = /^\d+(\.\d+)?$/.test(qty.trim()) && Number(qty.trim()) > 0;
  // Shift stays MANDATORY — a selected shift code is required, only the entry
  // method changed from free text to a picker.
  const canConfirm = categoryCode !== '' && qtyValid && shiftId !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('waste', {
      transaction_id: freshTransactionId(),
      category_code: categoryCode,
      qty_kg: qty.trim(),
      shift_id: shiftId,
      ...(reasonCode.trim() ? { reason_code: reasonCode.trim() } : {}),
      ...(notes.trim() ? { reason_notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (result.ok) {
      setQty('');
      setReasonCode('');
      setNotes('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-waste" size="md">
      <Modal.Header title={labels.waste.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.waste.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-waste-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-waste-category" label={labels.waste.category}>
            {categories.length === 0 ? (
              <p data-testid="wo-waste-no-categories" className="text-sm text-amber-700">
                {labels.waste.noCategories}
              </p>
            ) : (
              <Select
                value={categoryCode}
                onValueChange={setCategoryCode}
                options={categories.map((c) => ({ value: c.code, label: c.name }))}
                aria-label={labels.waste.category}
              >
                <SelectTrigger id="wo-waste-category" data-testid="wo-waste-category">
                  <SelectValue placeholder={labels.waste.categoryPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          <FieldRow id="wo-waste-qty" label={labels.waste.qty}>
            <Input id="wo-waste-qty" inputMode="decimal" value={qty} disabled={busy} onChange={(e) => setQty(e.target.value)} data-testid="wo-waste-qty" />
          </FieldRow>
          <FieldRow id="wo-waste-shift" label={labels.waste.shift}>
            <Select
              value={shiftId}
              onValueChange={setShiftId}
              options={shifts.map((s) => ({ value: s.code, label: shiftLabel(labels, s) }))}
              aria-label={labels.waste.shift}
            >
              <SelectTrigger id="wo-waste-shift" data-testid="wo-waste-shift">
                <SelectValue placeholder={labels.waste.shiftPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {shiftLabel(labels, s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow id="wo-waste-reason" label={labels.waste.reasonCode}>
            <Input id="wo-waste-reason" value={reasonCode} disabled={busy} onChange={(e) => setReasonCode(e.target.value)} data-testid="wo-waste-reason" />
          </FieldRow>
          <FieldRow id="wo-waste-notes" label={labels.waste.notes}>
            <Textarea id="wo-waste-notes" rows={2} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} data-testid="wo-waste-notes" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-waste-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-waste-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
