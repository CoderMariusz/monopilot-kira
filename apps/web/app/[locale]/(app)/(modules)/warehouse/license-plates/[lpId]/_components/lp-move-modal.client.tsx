'use client';

/**
 * LP MOVE modal (audit defect #5) — wires the previously-callerless
 * createStockMove Server Action (warehouse/_actions/stock-move-actions.ts:88).
 *
 * The LP detail "move" action was rendered DISABLED ("Coming soon"); this modal
 * makes it LIVE for movable LPs. It collects a destination location (shadcn
 * Select over the org-scoped listLocations read — no raw <select>) + an optional
 * reason, generates a fresh clientOpId per attempt (idempotency key the action
 * keys its transaction on), and calls createStockMove. Errors are surfaced
 * VERBATIM by mapping the action's machine reasons/messages (forbidden / locked /
 * invalid_state / not_found) to honest copy. On success the parent refreshes so
 * the Movements tab shows the new move.
 *
 * Five states: loading (locations fetch skeleton), empty (no locations panel),
 * error (locations load failed), permission-denied (forbidden from the action →
 * verbatim error), optimistic (useTransition pending + disabled submit).
 *
 * stock-move-actions.ts is NOT touched; locations come from the additive
 * listLocations read (location-read-actions.ts).
 */

import { useEffect, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { createStockMove } from '../../../_actions/stock-move-actions';
import type { listLocations, LocationOption } from '../../../_actions/location-read-actions';

export type LpMoveLabels = {
  title: string;
  subtitle: string;
  destination: string;
  destinationHelp: string;
  destinationPlaceholder: string;
  reason: string;
  reasonHelp: string;
  reasonPlaceholder: string;
  currentLocation: string;
  loadingLocations: string;
  noLocations: string;
  locationsError: string;
  cancel: string;
  submit: string;
  submitting: string;
  validation: { destinationRequired: string };
  error: string;
  errorForbidden: string;
  errorLocked: string;
  errorInvalidState: string;
  errorNotFound: string;
  success: string;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

/** Fresh idempotency key per submit attempt (the action keys its txn on it). */
function freshClientOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `move-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function LpMoveModal({
  open,
  onOpenChange,
  lp,
  labels,
  listLocationsAction,
  createStockMoveAction,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lp: { id: string; lpNumber: string; currentLocationCode: string | null };
  labels: LpMoveLabels;
  listLocationsAction: typeof listLocations;
  createStockMoveAction: typeof createStockMove;
  onMoved?: () => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [toLocationId, setToLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Load org-scoped locations when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadState('loading');
    setError(null);
    (async () => {
      const res = await listLocationsAction({ limit: 500 });
      if (cancelled) return;
      if (!res.ok) {
        setLoadState('error');
        return;
      }
      setLocations(res.data);
      setLoadState(res.data.length === 0 ? 'empty' : 'ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listLocationsAction]);

  function reset() {
    setToLocationId('');
    setReason('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function mapError(reason: string, message?: string): string {
    if (reason === 'forbidden') return labels.errorForbidden;
    if (reason === 'not_found') return labels.errorNotFound;
    if (message === 'locked') return labels.errorLocked;
    if (message === 'immovable_status' || message === 'invalid_state') return labels.errorInvalidState;
    // Fall back to the verbatim action message/reason.
    return labels.error.replace('{message}', message ?? reason);
  }

  function submit() {
    setError(null);
    if (toLocationId === '') {
      setError(labels.validation.destinationRequired);
      return;
    }
    startTransition(async () => {
      const res = await createStockMoveAction({
        lpId: lp.id,
        toLocationId,
        reason: reason.trim() || undefined,
        clientOpId: freshClientOpId(),
      });
      if (!res.ok) {
        const failure = res as Extract<Awaited<ReturnType<typeof createStockMoveAction>>, { ok: false }>;
        setError(mapError(failure.reason, failure.message));
        return;
      }
      reset();
      onOpenChange(false);
      onMoved?.();
    });
  }

  const valid = toLocationId !== '';

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="lp_move_modal" dismissible={!pending}>
      <Modal.Header title={labels.title.replace('{lpNumber}', lp.lpNumber)} />
      <Modal.Body>
        <div data-testid="lp-move-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{labels.currentLocation}: </span>
            <span className="font-mono text-slate-800">{lp.currentLocationCode ?? '—'}</span>
          </div>

          {loadState === 'loading' && (
            <div
              data-testid="lp-move-loading"
              aria-busy="true"
              className="h-10 animate-pulse rounded-md bg-slate-100"
            />
          )}

          {loadState === 'error' && (
            <p role="alert" data-testid="lp-move-locations-error" className="text-sm text-red-600">
              {labels.locationsError}
            </p>
          )}

          {loadState === 'empty' && (
            <p data-testid="lp-move-no-locations" className="text-sm text-slate-500">
              {labels.noLocations}
            </p>
          )}

          {loadState === 'ready' && (
            <>
              {/* Destination (shadcn Select — no raw <select>). */}
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-700">
                  {labels.destination} <span aria-hidden className="text-red-500">*</span>
                </span>
                <div data-testid="lp-move-destination">
                  <Select
                    aria-label={labels.destination}
                    value={toLocationId}
                    onValueChange={setToLocationId}
                    placeholder={labels.destinationPlaceholder}
                    options={locations.map((l) => ({
                      value: l.id,
                      label: l.warehouseCode ? `${l.warehouseCode} · ${l.code} — ${l.name}` : `${l.code} — ${l.name}`,
                    }))}
                  />
                </div>
                <span className="text-xs text-slate-400">{labels.destinationHelp}</span>
              </label>

              {/* Reason (optional). */}
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-700">{labels.reason}</span>
                <textarea
                  data-testid="lp-move-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={labels.reasonPlaceholder}
                  rows={2}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
                <span className="text-xs text-slate-400">{labels.reasonHelp}</span>
              </label>
            </>
          )}

          {error && (
            <p role="alert" data-testid="lp-move-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-move-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-move-submit"
          disabled={!valid || pending || loadState !== 'ready'}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
