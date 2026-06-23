'use client';

import { useEffect, useState, useTransition } from 'react';

import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';

import type { blockLp, BlockLpResult } from '../_actions/lp-detail-actions';
import type { WarehouseResult } from '../../../_actions/shared';

export type LpBlockModalLabels = {
  title: string;
  intro: string;
  reason: string;
  reasonPlaceholder: string;
  cancel: string;
  confirm: string;
  submitting: string;
  errors: {
    forbidden: string;
    alreadyBlocked: string;
    terminal: string;
    locked: string;
    invalidInput: string;
    notFound: string;
    generic: string;
  };
};

function errorMessage(result: Extract<WarehouseResult<BlockLpResult>, { ok: false }>, labels: LpBlockModalLabels): string {
  if (result.reason === 'forbidden') return labels.errors.forbidden;
  if (result.reason === 'not_found') return labels.errors.notFound;
  switch (result.message) {
    case 'already_blocked':
      return labels.errors.alreadyBlocked;
    case 'terminal_lp_status':
      return labels.errors.terminal;
    case 'locked':
      return labels.errors.locked;
    case 'invalid_input':
      return labels.errors.invalidInput;
    default:
      return labels.errors.generic;
  }
}

export function LpBlockModal({
  open,
  onOpenChange,
  lpId,
  lpNumber,
  labels,
  blockAction,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lpId: string;
  lpNumber: string;
  labels: LpBlockModalLabels;
  blockAction: typeof blockLp;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit = reason.trim().length > 0 && !isPending;

  useEffect(() => {
    if (!open) {
      setReason('');
      setError(null);
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
      const result = await blockAction(lpId, reason);
      if (result.ok) {
        onOpenChange(false);
        setReason('');
        setError(null);
        onSuccess();
        return;
      }
      setError(errorMessage(result, labels));
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="lp-block-modal" dismissible={!isPending}>
      <Modal.Header title={labels.title.replace('{lp}', lpNumber)} />
      <Modal.Body>
        <div data-testid="lp-block-modal" className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{labels.intro}</p>
          <label htmlFor="lp-block-reason" className="text-sm font-medium text-slate-700">
            {labels.reason}
          </label>
          <Input
            id="lp-block-reason"
            data-testid="lp-block-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.reasonPlaceholder}
            disabled={isPending}
          />
          {error ? (
            <p role="alert" data-testid="lp-block-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-block-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-block-confirm"
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
