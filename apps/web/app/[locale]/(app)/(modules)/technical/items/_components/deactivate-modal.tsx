'use client';

/**
 * T-035 — TEC-081 Item Deactivate modal (reason-required, type-to-confirm).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:138-163
 *   (`ArchiveProductModal` — red alert banner naming the product, required
 *   Reason field, an acknowledgement gate, Cancel + destructive confirm). The PRD
 *   TEC-081 contract (docs/prd/03-TECHNICAL-PRD.md:650, V-TEC-05) makes the reason
 *   an enumerated select (Discontinued / Recipe Change / D365 Mismatch / Other)
 *   feeding the audit chain, with notes REQUIRED when reason = Other. We replace
 *   the prototype's free-text acknowledgement checkbox with the stronger
 *   type-to-confirm gate (the operator must type the exact item code) so an
 *   irreversible-pick-list removal can never be a single mis-click.
 *
 * Local Dialog primitive (NOT the Radix-backed @monopilot/ui Modal): React 19 vs
 * the workspace's React 18 @radix peer crashes jsdom unit tests — the same
 * established deviation as the sibling items-manager.client.tsx island. Production
 * semantics (role="dialog", aria-modal, focus on open, Escape + backdrop close,
 * labelled title) preserved.
 *
 * Real data: submits via the existing deactivateItem Server Action (withOrgContext
 * + RLS + zod), passing reason + notes recorded in audit_log. No mocks.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import { deactivateItem } from '../_actions/deactivate-item';
import { DEACTIVATE_REASONS, type DeactivateReason, type ItemsActionError } from '../_actions/shared';

export type DeactivateLabels = {
  title: string;
  subtitle: string;
  warning: string;
  reason: string;
  reasonRequired: string;
  reasons: Record<DeactivateReason, string>;
  notes: string;
  notesRequired: string;
  confirmLabel: string;
  confirmMismatch: string;
  cancel: string;
  confirm: string;
  deactivating: string;
  actionErrors: Record<ItemsActionError, string>;
};

export const DEFAULT_DEACTIVATE_LABELS: DeactivateLabels = {
  title: 'Deactivate item',
  subtitle: 'Removes {code} from active pick-lists. Open WOs continue; no new WOs can be created.',
  warning: '{name} will be blocked. BOMs remain for audit. This sets status to blocked.',
  reason: 'Reason',
  reasonRequired: 'Select a reason.',
  reasons: {
    discontinued: 'Discontinued',
    recipe_change: 'Recipe change',
    d365_mismatch: 'D365 mismatch',
    other: 'Other',
  },
  notes: 'Notes',
  notesRequired: 'Notes are required when the reason is Other (min 10 chars).',
  confirmLabel: 'Type the item code {code} to confirm',
  confirmMismatch: 'The entered code does not match.',
  cancel: 'Cancel',
  confirm: 'Deactivate',
  deactivating: 'Deactivating…',
  actionErrors: {
    already_exists: 'An item with that code already exists in this organization.',
    forbidden: 'You do not have permission to perform this action.',
    invalid_input: 'Please check the values and try again.',
    not_found: 'That item no longer exists.',
    persistence_failed: 'Could not save. Please try again.',
  },
};

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export function DeactivateItemModal({
  open,
  onClose,
  itemId,
  itemCode,
  itemName,
  labels = DEFAULT_DEACTIVATE_LABELS,
  onDeactivated,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemCode: string;
  itemName: string;
  labels?: DeactivateLabels;
  onDeactivated?: () => void;
}) {
  const router = useRouter();
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [reason, setReason] = React.useState<DeactivateReason | ''>('');
  const [notes, setNotes] = React.useState('');
  const [confirmCode, setConfirmCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setReason('');
    setNotes('');
    setConfirmCode('');
    setError(null);
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const reasonOptions = DEACTIVATE_REASONS.map((value) => ({ value, label: labels.reasons[value] }));
  const notesNeeded = reason === 'other';
  const notesValid = !notesNeeded || notes.trim().length >= 10;
  const codeMatches = confirmCode.trim() === itemCode;
  const canConfirm = reason !== '' && notesValid && codeMatches && !pending;

  function submit() {
    setError(null);
    if (reason === '') {
      setError(labels.reasonRequired);
      return;
    }
    if (notesNeeded && !notesValid) {
      setError(labels.notesRequired);
      return;
    }
    if (!codeMatches) {
      setError(labels.confirmMismatch);
      return;
    }
    startTransition(async () => {
      const result = await deactivateItem({
        id: itemId,
        reason,
        notes: notes.trim().length ? notes.trim() : undefined,
      });
      if (result.ok) {
        onClose();
        onDeactivated?.();
        router.refresh();
      } else {
        setError(labels.actionErrors[result.error]);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-modal-id="TEC-081"
        className="w-full max-w-lg rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-red-700">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {interpolate(labels.subtitle, { code: itemCode })}
            </p>
          </div>
          <button type="button" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {interpolate(labels.warning, { name: itemName })}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">{labels.reason}</span>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as DeactivateReason)}
              options={reasonOptions}
            >
              <SelectTrigger aria-label={labels.reason}>
                <SelectValue placeholder={labels.reasonRequired} />
              </SelectTrigger>
              <SelectContent>
                {reasonOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {notesNeeded ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.notes}</span>
              <Input
                name="notes"
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
              />
              <span className="mt-1 block text-xs text-muted-foreground">{labels.notesRequired}</span>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {interpolate(labels.confirmLabel, { code: itemCode })}
            </span>
            <Input
              name="confirmCode"
              className="font-mono"
              value={confirmCode}
              autoComplete="off"
              onChange={(e) => setConfirmCode(e.currentTarget.value)}
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            className="btn-danger"
            data-action="confirm-deactivate"
            disabled={!canConfirm}
            onClick={submit}
          >
            {pending ? labels.deactivating : labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DeactivateItemModal;
