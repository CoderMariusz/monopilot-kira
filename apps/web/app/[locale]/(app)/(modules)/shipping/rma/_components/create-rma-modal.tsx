'use client';

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type { RmaListLabels } from './rma-list-view';

type LineDraft = { productId: string; quantityExpected: string };

export function CreateRmaModal({
  open,
  onOpenChange,
  labels,
  customers,
  reasonCodes,
  createRmaAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: RmaListLabels['create'];
  customers: Array<{ id: string; code: string; name: string }>;
  reasonCodes: Array<{ code: string; label: string }>;
  createRmaAction: (input: unknown) => Promise<{ ok: boolean; id?: string }>;
  onCreated: (id: string) => void;
}) {
  const [customerId, setCustomerId] = React.useState('');
  const [salesOrderId, setSalesOrderId] = React.useState('');
  const [reasonCode, setReasonCode] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<LineDraft[]>([{ productId: '', quantityExpected: '1' }]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCustomerId('');
    setSalesOrderId('');
    setReasonCode(reasonCodes[0]?.code ?? '');
    setNotes('');
    setLines([{ productId: '', quantityExpected: '1' }]);
    setError(null);
  }, [open, reasonCodes]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !reasonCode || lines.every((l) => !l.productId.trim())) {
      setError(labels.errors.linesRequired);
      return;
    }

    setPending(true);
    setError(null);
    const result = await createRmaAction({
      customerId,
      salesOrderId: salesOrderId.trim() || undefined,
      reasonCode,
      notes: notes.trim() || undefined,
      lines: lines
        .filter((l) => l.productId.trim())
        .map((l) => ({ productId: l.productId.trim(), quantityExpected: l.quantityExpected.trim() || '1' })),
    });
    setPending(false);

    if (!result.ok) {
      setError(labels.errors[(result as { error?: string }).error ?? ''] ?? labels.errors.persistence_failed);
      return;
    }

    onOpenChange(false);
    if (result.id) onCreated(result.id);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="create_rma_modal">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" data-testid="create-rma-modal">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.customerLabel}</span>
            <Select
              value={customerId}
              onValueChange={setCustomerId}
              placeholder={labels.customerPlaceholder}
              options={customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.salesOrderLabel}</span>
            <Input value={salesOrderId} onChange={(e) => setSalesOrderId(e.target.value)} placeholder={labels.salesOrderPlaceholder} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.reasonLabel}</span>
            <Select
              value={reasonCode}
              onValueChange={setReasonCode}
              placeholder={labels.reasonPlaceholder}
              options={reasonCodes.map((r) => ({ value: r.code, label: r.label }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={labels.notesPlaceholder} />
          </label>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                <label className="flex flex-col gap-1">
                  {idx === 0 ? <span className="text-sm font-medium text-slate-700">{labels.productLabel}</span> : null}
                  <Input
                    value={line.productId}
                    onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: e.target.value } : l)))}
                    placeholder={labels.productPlaceholder}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  {idx === 0 ? <span className="text-sm font-medium text-slate-700">{labels.qtyLabel}</span> : null}
                  <Input
                    value={line.quantityExpected}
                    onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantityExpected: e.target.value } : l)))}
                  />
                </label>
                {lines.length > 1 ? (
                  <Button type="button" className="btn--ghost btn-sm self-end" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                    {labels.removeLine}
                  </Button>
                ) : null}
              </div>
            ))}
            <Button type="button" className="btn--ghost btn-sm" onClick={() => setLines((prev) => [...prev, { productId: '', quantityExpected: '1' }])}>
              + {labels.addLine}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600" data-testid="create-rma-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" className="btn--ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn--primary" disabled={pending} data-testid="create-rma-submit">
              {pending ? labels.submitting : labels.submit}
            </Button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
