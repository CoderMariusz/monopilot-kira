'use client';

/**
 * WH-R3 — LP Destroy / scrap modal (client island).
 *
 * Wires the hardened `destroyLp(lpId, reason, clientOpId)` Server Action
 * (lp-split-merge-destroy-actions.ts). This is a DESTRUCTIVE, terminal operation:
 * the modal forces an explicit confirmation acknowledgement + a reason before the
 * confirm button enables, and styles confirm as danger.
 *
 * Idempotency: `destroyLp` REQUIRES a clientOpId. We mint a FRESH
 * crypto.randomUUID() when the modal OPENS and keep it stable for that open, so a
 * double-click / retry replays the same destroy (the backend keys the destroy
 * transaction on this id and short-circuits an already-destroyed LP to ok).
 */

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

import type { destroyLp } from '../_actions/lp-split-merge-destroy-actions';

export type LpDestroyModalLabels = {
  title: string;
  intro: string;
  warning: string;
  acknowledge: string;
  reason: string;
  reasonPlaceholder: string;
  cancel: string;
  confirm: string;
  submitting: string;
  errors: {
    forbidden: string;
    notFound: string;
    invalidInput: string;
    terminal: string;
    reserved: string;
    generic: string;
  };
};

/**
 * Maps the action's flat `error` string to localized copy. The action returns the
 * machine reasons plus human-readable guard strings for the terminal / reserved
 * cases — match every one, fall back to generic.
 */
function destroyErrorMessage(error: string, labels: LpDestroyModalLabels): string {
  switch (error) {
    case 'forbidden':
      return labels.errors.forbidden;
    case 'not_found':
      return labels.errors.notFound;
    case 'invalid_input':
      return labels.errors.invalidInput;
    case 'LP is already consumed/shipped/merged/destroyed and cannot be destroyed':
      return labels.errors.terminal;
    case 'LP has reserved stock; clear reservation before destroying':
      return labels.errors.reserved;
    default:
      return labels.errors.generic;
  }
}

export function LpDestroyModal({
  open,
  onOpenChange,
  lpId,
  lpNumber,
  labels,
  destroyAction,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lpId: string;
  lpNumber: string;
  labels: LpDestroyModalLabels;
  destroyAction: typeof destroyLp;
  onSuccess: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Fresh idempotency key per modal open; stable across retries within this open.
  const [clientOpId, setClientOpId] = useState('');
  const [isPending, startTransition] = useTransition();

  const canSubmit = acknowledged && reason.trim().length > 0 && !isPending;

  useEffect(() => {
    if (open) {
      setClientOpId(crypto.randomUUID());
    } else {
      setAcknowledged(false);
      setReason('');
      setError(null);
      setClientOpId('');
    }
  }, [open]);

  function close() {
    if (isPending) return;
    onOpenChange(false);
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await destroyAction(lpId, reason.trim(), clientOpId);
      if (result.ok) {
        onOpenChange(false);
        onSuccess();
        return;
      }
      setError(destroyErrorMessage(result.error, labels));
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="lp-destroy-modal" dismissible={!isPending}>
      <Modal.Header title={labels.title.replace('{lp}', lpNumber)} />
      <Modal.Body>
        <div data-testid="lp-destroy-modal" className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{labels.intro}</p>
          <p
            role="note"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {labels.warning}
          </p>

          <label htmlFor="lp-destroy-reason" className="text-sm font-medium text-slate-700">
            {labels.reason}
          </label>
          <Textarea
            id="lp-destroy-reason"
            data-testid="lp-destroy-reason"
            rows={2}
            value={reason}
            placeholder={labels.reasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
          />

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              data-testid="lp-destroy-ack"
              checked={acknowledged}
              disabled={isPending}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5"
            />
            <span>{labels.acknowledge}</span>
          </label>

          {error ? (
            <p role="alert" data-testid="lp-destroy-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-destroy-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-destroy-confirm"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {isPending ? labels.submitting : labels.confirm}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
