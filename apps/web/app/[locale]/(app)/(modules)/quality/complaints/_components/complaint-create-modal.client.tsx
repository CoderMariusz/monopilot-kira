'use client';

/**
 * MODAL — Create a customer complaint (Wave E11, client island).
 *
 * Design-system conformance: there is NO dedicated complaint-create prototype JSX
 * (CAPA/complaints are P2 placeholders in the NCR prototype). This island mirrors
 * the sibling MODAL-NCR-CREATE (ncr-create-modal.client.tsx) and the CCP-deviation
 * resolve modal markup/density 1:1 — shadcn Modal (no raw <select>), severity pills,
 * useTransition for the optimistic submit, the action error surfaced VERBATIM.
 *
 * Wires the reviewed `createComplaint` Server Action (backend DONE — imported, never
 * authored here). Contract: createComplaint({customerId?, lpId?, batchRef?,
 * description, severity}).
 *
 * DEVIATIONS (documented per UI-PROTOTYPE-PARITY-POLICY.md):
 *   - The reviewed action accepts customerId / lpId only as UUIDs, and there is no
 *     customer / LP PICKER + resolver yet (a free-text UUID input is the audit-#4
 *     raw-UUID antipattern, banned). So the modal exposes a human "customer" field
 *     and a "batch/LP reference" field as FREE TEXT, and wires them into the single
 *     free-text `batchRef` slot the action accepts (customer name prefixed when
 *     present) — never a fabricated UUID. customerId / lpId stay unset; the typed
 *     customer/LP links are established server-side / from other screens and shown
 *     read-only on the detail page. No raw UUID ever reaches the action or the UI.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import {
  COMPLAINT_SEVERITIES,
  type ComplaintSeverity,
  type CreateComplaintAction,
} from './complaints-contracts';
import type { ComplaintCreateLabels } from './labels';

const DESCRIPTION_MAX = 4000;

export function ComplaintCreateModal({
  open,
  onOpenChange,
  labels,
  createComplaintAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ComplaintCreateLabels;
  createComplaintAction: CreateComplaintAction;
  onCreated?: (created: { id: string }) => void;
}) {
  const [customer, setCustomer] = useState('');
  const [batchRef, setBatchRef] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<ComplaintSeverity>('medium');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedDesc = description.trim();
  const valid = trimmedDesc.length > 0;

  function reset() {
    setCustomer('');
    setBatchRef('');
    setDescription('');
    setSeverity('medium');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  /**
   * Combine the free-text customer + batch/LP reference into the single free-text
   * `batchRef` slot the reviewed action accepts (no customer/LP picker → no UUID).
   */
  function combinedRef(): string | undefined {
    const c = customer.trim();
    const b = batchRef.trim();
    if (c && b) return `${c} · ${b}`;
    return c || b || undefined;
  }

  function submit() {
    setError(null);
    if (trimmedDesc.length === 0) {
      setError(labels.validation.descriptionRequired);
      return;
    }

    const ref = combinedRef();
    startTransition(async () => {
      const result = await createComplaintAction({
        description: trimmedDesc,
        severity,
        ...(ref ? { batchRef: ref } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.error));
        return;
      }
      const created = result.data;
      reset();
      onOpenChange(false);
      onCreated?.(created);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="complaint_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="complaint-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Customer (free-text reference — no customer picker / UUID on the reviewed action). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.customer}</span>
            <input
              type="text"
              data-testid="complaint-create-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              maxLength={120}
              placeholder={labels.customerPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.customerHelp}</span>
          </label>

          {/* Batch / LP reference (free text → batchRef). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.batchRef}</span>
            <input
              type="text"
              data-testid="complaint-create-batchref"
              value={batchRef}
              onChange={(e) => setBatchRef(e.target.value)}
              maxLength={120}
              placeholder={labels.batchRefPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.batchRefHelp}</span>
          </label>

          {/* Description (required). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.description} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="complaint-create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              placeholder={labels.descriptionPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.descriptionHelp}</span>
          </label>

          {/* Severity pills (low / medium / high / critical) — no raw <select>. */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">
              {labels.severity} <span aria-hidden className="text-red-500">*</span>
            </legend>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={labels.severity}
              data-testid="complaint-create-severity"
            >
              {COMPLAINT_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`complaint-create-severity-${s}`}
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs capitalize transition',
                    severity === s
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.severityOptions[s]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">{labels.severityHelp}</p>
          </fieldset>

          {error && (
            <p role="alert" data-testid="complaint-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="complaint-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="complaint-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
