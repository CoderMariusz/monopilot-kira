'use client';

/**
 * WAVE E2B — Delivery-condition temperature control for a received GRN line.
 *
 * Spec-driven (cold chain — no prototype JSX). Sits in the GRN detail receipt-line
 * action cell, mirroring the per-line affordance pattern (Release-QC / Print
 * labels): a compact numeric °C input + a Record button calling
 * submitConditionCheck({ grnItemId, lpId, itemId, measuredTempC }). The result
 * renders green "in range" or red "out of range → quality hold created" with the
 * hold reference; the parent router.refresh()es on success so the new condition
 * state + any hold are reflected.
 *
 * RBAC (quality.coldchain.record) is re-enforced server-side by the action; this
 * control only governs the disabled affordance via `canRecord`. No raw UUIDs —
 * the hold reference renders the hold NUMBER, never its id.
 */

import { useState } from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type SubmitTempCheckInput = {
  grnItemId?: string | null;
  lpId?: string | null;
  itemId: string;
  measuredTempC: number;
};

export type SubmitTempCheckResult =
  | { ok: true; inRange: boolean; holdId?: string | null; holdNumber?: string | null }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'no_range_configured' | 'persistence_failed' };

export type GrnTempCheckLabels = {
  /** Field/affordance label ("Record delivery temperature"). */
  action: string;
  recording: string;
  /** Accessible label for the °C input. */
  inputLabel: string;
  inputPlaceholder: string;
  inRange: string;
  /** "{holdNumber}" is interpolated with the created hold reference. */
  outOfRange: string;
  outOfRangeNoHold: string;
  forbidden: string;
  invalidInput: string;
  noRange: string;
  error: string;
};

export function GrnTempCheck({
  itemId,
  grnItemId,
  lpId,
  labels,
  canRecord,
  submitConditionCheck,
  onRecorded,
}: {
  itemId: string;
  grnItemId?: string | null;
  lpId?: string | null;
  labels: GrnTempCheckLabels;
  canRecord: boolean;
  submitConditionCheck: (input: SubmitTempCheckInput) => Promise<SubmitTempCheckResult>;
  /** Called after a successful record so the parent can router.refresh(). */
  onRecorded: () => void;
}) {
  const [temp, setTemp] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Extract<SubmitTempCheckResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    if (!canRecord || pending) return;
    const measured = Number(temp);
    if (temp.trim() === '' || !Number.isFinite(measured)) {
      setError(labels.invalidInput);
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await submitConditionCheck({
        grnItemId: grnItemId ?? null,
        lpId: lpId ?? null,
        itemId,
        measuredTempC: measured,
      });
      if (!res.ok) {
        setError(
          res.error === 'forbidden'
            ? labels.forbidden
            : res.error === 'invalid_input'
              ? labels.invalidInput
              : res.error === 'no_range_configured'
                ? labels.noRange
                : labels.error,
        );
        return;
      }
      setResult(res);
      onRecorded();
    } catch {
      setError(labels.error);
    } finally {
      setPending(false);
    }
  }

  const outOfRangeText = (holdNumber: string | null | undefined): string =>
    holdNumber
      ? labels.outOfRange.replace('{holdNumber}', holdNumber)
      : labels.outOfRangeNoHold;

  return (
    <div className="flex flex-col items-end gap-1" data-testid={`grn-temp-check-${grnItemId ?? lpId ?? itemId}`}>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          aria-label={labels.inputLabel}
          placeholder={labels.inputPlaceholder}
          value={temp}
          disabled={!canRecord || pending}
          onChange={(event) => setTemp(event.currentTarget.value)}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <span aria-hidden="true" className="text-xs text-slate-500">
          °C
        </span>
        <Button
          type="button"
          data-testid={`grn-temp-check-submit-${grnItemId ?? lpId ?? itemId}`}
          disabled={!canRecord || pending}
          title={canRecord ? undefined : labels.forbidden}
          aria-label={canRecord ? labels.action : `${labels.action} — ${labels.forbidden}`}
          onClick={() => void record()}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? labels.recording : labels.action}
        </Button>
      </div>

      {result ? (
        result.inRange ? (
          <p
            role="status"
            data-testid={`grn-temp-check-in-range-${grnItemId ?? lpId ?? itemId}`}
            data-in-range="true"
            className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
          >
            {labels.inRange}
          </p>
        ) : (
          <p
            role="alert"
            data-testid={`grn-temp-check-out-of-range-${grnItemId ?? lpId ?? itemId}`}
            data-in-range="false"
            data-hold-number={result.holdNumber ?? undefined}
            className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700"
          >
            {outOfRangeText(result.holdNumber)}
          </p>
        )
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid={`grn-temp-check-error-${grnItemId ?? lpId ?? itemId}`}
          className="text-[11px] text-red-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default GrnTempCheck;
