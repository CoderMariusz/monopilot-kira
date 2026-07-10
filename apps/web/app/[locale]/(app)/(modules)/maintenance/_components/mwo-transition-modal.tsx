'use client';

import { useState, useTransition } from 'react';

import type { MwoListRow, MwoTransition } from '../_actions/mwo-actions';
import type { MwoListLabels, TransitionMwoAction } from './mwo-list.client';
import { ModalShell } from './mwo-modal-shell';

/** MODAL: confirm a state transition (note for complete/cancel). */
export function MwoTransitionModal({
  row,
  to,
  labels,
  transitionMwoAction,
  onClose,
  onDone,
}: {
  row: MwoListRow;
  to: MwoTransition;
  labels: MwoListLabels;
  transitionMwoAction: TransitionMwoAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const title =
    to === 'in_progress'
      ? labels.transition.startTitle
      : to === 'completed'
        ? labels.transition.completeTitle
        : labels.transition.cancelTitle;
  const confirmLabel =
    to === 'in_progress'
      ? labels.transition.confirmStart
      : to === 'completed'
        ? labels.transition.confirmComplete
        : labels.transition.confirmCancel;
  const noteLabel = to === 'cancelled' ? labels.transition.noteCancel : labels.transition.noteComplete;

  const submit = () => {
    setError(null);
    startSubmit(async () => {
      const result = await transitionMwoAction({
        mwoId: row.id,
        to,
        note: note.trim() || undefined,
      });
      if (result.ok) onDone();
      else if (result.reason === 'forbidden') setError(labels.transition.errorForbidden);
      else if (result.reason === 'invalid_transition') setError(labels.transition.errorIllegal);
      else if (result.reason === 'loto_not_verified') setError(result.message ?? labels.transition.errorFailed);
      else setError(labels.transition.errorFailed);
    });
  };

  return (
    <ModalShell title={`${title} — ${row.mwoNumber}`} testId="mwo-transition-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {to !== 'in_progress' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{noteLabel}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              data-testid="mwo-transition-note"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        ) : null}

        {error ? (
          <p role="alert" data-testid="mwo-transition-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="mwo-transition-dismiss"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.transition.dismiss}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            data-testid="mwo-transition-confirm"
            className={[
              'rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300',
              to === 'cancelled' ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800',
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
