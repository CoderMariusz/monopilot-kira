'use client';

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

import type {
  listSiblingLpsForMerge,
  mergeLps,
  MergeSiblingLp,
} from '../_actions/lp-split-merge-destroy-actions';

export type LpMergeModalLabels = {
  title: string;
  intro: string;
  candidates: string;
  loading: string;
  empty: string;
  reason: string;
  reasonPlaceholder: string;
  cancel: string;
  confirm: string;
  submitting: string;
  validation: {
    selectionRequired: string;
    reasonRequired: string;
  };
  errors: {
    forbidden: string;
    notFound: string;
    invalidInput: string;
    mismatch: string;
    invalidState: string;
    reserved: string;
    onHold: string;
    generic: string;
  };
};

function mergeErrorMessage(error: string, labels: LpMergeModalLabels): string {
  switch (error) {
    case 'forbidden':
      return labels.errors.forbidden;
    case 'not_found':
      return labels.errors.notFound;
    case 'invalid_input':
      return labels.errors.invalidInput;
    case 'LP product, UOM, batch, expiry, warehouse, site, and location must match before merge':
      return labels.errors.mismatch;
    case 'only available LPs can be merged':
      return labels.errors.invalidState;
    case 'reserved LPs cannot be merged':
      return labels.errors.reserved;
    case 'one or more LPs are under an active quality hold':
      return labels.errors.onHold;
    default:
      return labels.errors.generic;
  }
}

export function LpMergeModal({
  open,
  onOpenChange,
  primaryLpId,
  primaryLpNumber,
  labels,
  listSiblingsAction,
  mergeAction,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryLpId: string;
  primaryLpNumber: string;
  labels: LpMergeModalLabels;
  listSiblingsAction: typeof listSiblingLpsForMerge;
  mergeAction: typeof mergeLps;
  onSuccess: () => void;
}) {
  const [siblings, setSiblings] = useState<MergeSiblingLp[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setSiblings([]);
      setSelectedIds([]);
      setReason('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await listSiblingsAction(primaryLpId);
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setSiblings(result.siblings);
        setSelectedIds([]);
        setError(null);
      } else {
        setSiblings([]);
        setSelectedIds([]);
        setError(mergeErrorMessage(result.error, labels));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labels, listSiblingsAction, open, primaryLpId]);

  function close() {
    if (isPending) return;
    onOpenChange(false);
  }

  function toggleSibling(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function submit() {
    const trimmedReason = reason.trim();
    if (selectedIds.length === 0) {
      setError(labels.validation.selectionRequired);
      return;
    }
    if (!trimmedReason) {
      setError(labels.validation.reasonRequired);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await mergeAction(primaryLpId, selectedIds, trimmedReason);
      if (result.ok) {
        onOpenChange(false);
        setSelectedIds([]);
        setReason('');
        setError(null);
        onSuccess();
        return;
      }
      setError(mergeErrorMessage(result.error, labels));
    });
  }

  const canSubmit = selectedIds.length > 0 && reason.trim().length > 0 && !loading && !isPending;

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="lp-merge-modal" dismissible={!isPending}>
      <Modal.Header title={labels.title.replace('{lp}', primaryLpNumber)} />
      <Modal.Body>
        <div data-testid="lp-merge-modal" className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{labels.intro}</p>

          <div className="text-sm font-medium text-slate-700">{labels.candidates}</div>
          {loading ? (
            <p className="text-xs text-slate-500">{labels.loading}</p>
          ) : siblings.length === 0 ? (
            <p data-testid="lp-merge-empty" className="text-xs text-slate-500">
              {labels.empty}
            </p>
          ) : (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {siblings.map((sibling) => {
                const checked = selectedIds.includes(sibling.id);
                return (
                  <li key={sibling.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        data-testid={`lp-merge-candidate-${sibling.id}`}
                        checked={checked}
                        disabled={isPending}
                        onChange={() => toggleSibling(sibling.id)}
                      />
                      <span className="font-mono text-sm text-slate-900">{sibling.lpNumber}</span>
                      <span className="text-xs text-slate-500">
                        {sibling.quantity} {sibling.uom}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <label htmlFor="lp-merge-reason" className="text-sm font-medium text-slate-700">
            {labels.reason}
          </label>
          <Textarea
            id="lp-merge-reason"
            data-testid="lp-merge-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.reasonPlaceholder}
            disabled={isPending}
            rows={3}
          />

          {error ? (
            <p role="alert" data-testid="lp-merge-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-merge-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-merge-confirm"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? labels.submitting : labels.confirm}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
