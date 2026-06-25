'use client';

/**
 * P2-MODALS — the action runner: the ONE place that talks to the EXISTING WO
 * route handlers. Modals stay pure; this hook owns transport + idempotency +
 * error mapping + the post-success refresh.
 *
 * URL composition — the route handlers live UNDER the [locale] segment
 * (apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/<action>/route.ts),
 * so a request must carry the locale prefix: `/${locale}/production/work-orders/
 * ${woId}/<action>`. The locale is resolved server-side from the route params and
 * threaded down (never read from a client guess).
 *
 * Idempotency (R14): a FRESH crypto.randomUUID() transactionId is minted per
 * attempt by the caller's body — the route's zod schema requires `transactionId`
 * (lifecycle) / `transaction_id` (output/waste). A user re-trying after a network
 * blip therefore gets a NEW id (a genuine retry), while the server's own
 * UNIQUE(transaction_id) guards a double-submit of the SAME id.
 *
 * Error mapping — two response shapes exist:
 *   - lifecycle routes (start/pause/resume/cancel/complete/close) return
 *     { ok:false, error:<code>, ... } via route-helpers.runTransition,
 *   - output/waste routes return { error:<code>, ... } (no `ok` envelope).
 * Both surface the VERBATIM `error` string; we read whichever is present and pass
 * it back so the modal renders the exact handler code.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import type { RunWoAction, WoActionData, WoActionKind, WoActionResult } from './types';

/** action verb → route-handler path segment. */
const ROUTE_SEGMENT: Record<WoActionKind, string> = {
  start: 'start',
  pause: 'pause',
  resume: 'resume',
  cancel: 'cancel',
  complete: 'complete',
  close: 'close',
  output: 'outputs',
  waste: 'waste',
};

export function useWoAction(locale: string, woId: string): { run: RunWoAction } {
  const router = useRouter();

  const run = useCallback<RunWoAction>(
    async (kind, body) => {
      const segment = ROUTE_SEGMENT[kind];
      let res: Response;
      try {
        res = await fetch(`/${locale}/production/work-orders/${woId}/${segment}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, errorCode: 'network_error', httpStatus: 0 };
      }

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (res.ok) {
        // Re-fetch the server components so the new event/output/waste row + the
        // refreshed lifecycle status appear without a full reload.
        router.refresh();
        // E1 — pass through the route's success body (the `outputs` route returns
        // `{ data: { lp_id, lp_number, ... } }`) so the Register-output modal can
        // offer a [Print FG label] for the created LP. Other routes carry no
        // `data`, so this stays a plain `{ ok: true }` for them.
        const data =
          payload && typeof payload === 'object' && 'data' in payload
            ? (payload as { data: unknown }).data
            : null;
        if (data && typeof data === 'object') {
          const d = data as { lp_id?: unknown; lp_number?: unknown; mass_balance_warning?: unknown };
          const lpId = typeof d.lp_id === 'string' ? d.lp_id : null;
          const lpNumber = typeof d.lp_number === 'string' ? d.lp_number : null;
          const massBalanceWarning = isMassBalanceWarning(d.mass_balance_warning)
            ? d.mass_balance_warning
            : null;
          if (lpId || lpNumber || massBalanceWarning) {
            return { ok: true, data: { lpId, lpNumber, massBalanceWarning } };
          }
        }
        return { ok: true };
      }

      const errorCode =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : null) ?? 'persistence_failed';
      const reason =
        payload && typeof payload === 'object' && 'reason' in payload
          ? (payload as { reason: unknown }).reason
          : null;
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? (payload as { message: unknown }).message
          : null;

      return {
        ok: false,
        errorCode,
        httpStatus: res.status,
        ...(typeof reason === 'string' ? { reason } : {}),
        ...(typeof message === 'string' ? { message } : {}),
      };
    },
    [locale, woId, router],
  );

  return { run };
}

/** Mint a fresh idempotency id per attempt (crypto.randomUUID per the lane spec). */
export function freshTransactionId(): string {
  return crypto.randomUUID();
}

function isMassBalanceWarning(value: unknown): value is NonNullable<WoActionData['massBalanceWarning']> {
  if (!value || typeof value !== 'object') return false;
  const warning = value as Record<string, unknown>;
  return (
    typeof warning.expected_input_kg === 'string' &&
    typeof warning.posted_consumption_kg === 'string' &&
    typeof warning.effective_yield_pct === 'string' &&
    typeof warning.warn_pct === 'number'
  );
}

export type { WoActionResult };
