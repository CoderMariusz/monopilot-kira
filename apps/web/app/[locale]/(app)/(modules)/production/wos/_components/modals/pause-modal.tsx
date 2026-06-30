'use client';

import { useState } from 'react';

import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { freshTransactionId } from './use-wo-action';
import type { WoReasonCategory, WoShiftOption, WoLineOption } from './types';
import { ErrorBanner, FieldRow, mapError, shiftLabel, type BaseModalProps } from './shared';

// ── Pause ─────────────────────────────────────────────────────────────────────

export function PauseModal({
  open,
  woId,
  labels,
  run,
  onClose,
  categories,
  defaultLineId,
  lines = [],
  shifts = [],
}: BaseModalProps & {
  categories: WoReasonCategory[];
  defaultLineId: string | null;
  lines: WoLineOption[];
  shifts: WoShiftOption[];
}) {
  const [reasonCategoryId, setReasonCategoryId] = useState('');
  // Line is now a dropdown (D8) — default to the WO's assigned line when it is a
  // known option, otherwise leave empty so the operator must pick one (mandatory).
  const [lineId, setLineId] = useState(
    defaultLineId && lines.some((l) => l.id === defaultLineId) ? defaultLineId : '',
  );
  const [shiftId, setShiftId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Line stays MANDATORY — only the entry method changed from free text to a picker.
  const canConfirm = reasonCategoryId !== '' && lineId !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('pause', {
      transactionId: freshTransactionId(),
      reasonCategoryId,
      lineId,
      shiftId: shiftId || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-pause" size="sm">
      <Modal.Header title={labels.pause.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.pause.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-pause-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-pause-reason" label={labels.pause.reason}>
            {categories.length === 0 ? (
              <p data-testid="wo-pause-no-categories" className="text-sm text-amber-700">
                {labels.pause.noCategories}
              </p>
            ) : (
              <Select
                value={reasonCategoryId}
                onValueChange={setReasonCategoryId}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                aria-label={labels.pause.reason}
              >
                <SelectTrigger id="wo-pause-reason" data-testid="wo-pause-reason">
                  <SelectValue placeholder={labels.pause.reasonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          <FieldRow id="wo-pause-line" label={labels.pause.line}>
            {lines.length === 0 ? (
              <p data-testid="wo-pause-no-lines" className="text-sm text-amber-700">
                {labels.pause.noLines}
              </p>
            ) : (
              <Select
                value={lineId}
                onValueChange={setLineId}
                options={lines.map((l) => ({ value: l.id, label: l.code }))}
                aria-label={labels.pause.line}
              >
                <SelectTrigger id="wo-pause-line" data-testid="wo-pause-line">
                  <SelectValue placeholder={labels.pause.linePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          <FieldRow id="wo-pause-shift" label={labels.pause.shift}>
            <Select
              value={shiftId}
              onValueChange={setShiftId}
              options={shifts.map((s) => ({ value: s.code, label: shiftLabel(labels, s) }))}
              aria-label={labels.pause.shift}
            >
              <SelectTrigger id="wo-pause-shift" data-testid="wo-pause-shift">
                <SelectValue placeholder={labels.pause.shiftPlaceholder} />
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
          <FieldRow id="wo-pause-notes" label={labels.pause.notes}>
            <Textarea id="wo-pause-notes" rows={2} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} data-testid="wo-pause-notes" />
          </FieldRow>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-pause-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-pause-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
