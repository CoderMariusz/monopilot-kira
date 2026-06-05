/**
 * 08-Production E1 — CLOSE service (T-021/T-022): supervisor e-sign + financial close.
 *
 * completed → closed. The financial-close transition is a CFR-21 Part 11
 * attestation surface (MON-domain-production §e-sign "WO close"): a supervisor
 * e-signs (PIN via foundation T-124 `signEvent`) BEFORE the state mutation. The
 * signature is recorded in `e_sign_log` + a paired security `audit_events` row;
 * the transition references the signature id on the wo_events context.
 *
 * On close: emit production.wo.closed (10-finance cost-per-kg actual, 12-reporting,
 * 14-multi-site). D365 financial-close dispatch is async outbox + DLQ only
 * (never inline) — the outbox event is the seam.
 *
 * closed is terminal: the state machine rejects any further verb.
 */

import type pg from 'pg';

import { signEvent } from '@monopilot/e-sign';

import {
  EventType,
  type ProductionContext,
  type ProductionResult,
  fail,
  hasPermission,
  writeOutbox,
} from './shared';
import { applyTransition } from './wo-state-machine';

export type CloseWoInput = {
  woId: string;
  transactionId: string;
  /** Supervisor e-sign (CFR-21 Part 11) — PIN + mandatory reason. */
  signerUserId: string;
  pin: string;
  reason: string;
  nonce?: string;
};

export type CloseWoData = {
  woId: string;
  status: 'closed';
  closedAt: string | null;
  signatureId: string;
};

export async function closeWo(
  ctx: ProductionContext,
  input: CloseWoInput,
): Promise<ProductionResult<CloseWoData>> {
  // Supervisor authority: the full production.* set (incl. close) is the
  // supervisor/admin family in the migration-185 seed. wo.complete is the
  // closest granular supervisor-tier string present in the enum.
  if (!(await hasPermission(ctx, 'production.wo.complete'))) return fail('forbidden');
  if (!input.reason || input.reason.trim().length === 0) {
    return fail('invalid_input', { message: 'e-sign reason is required (CFR-21 Part 11)' });
  }

  // (1) Supervisor e-sign BEFORE the state change. signEvent verifies the PIN
  // server-side, writes e_sign_log + paired security audit_events, guards replay.
  let signatureId: string;
  try {
    const receipt = await signEvent(
      {
        signerUserId: input.signerUserId,
        pin: input.pin,
        intent: 'production.wo.close',
        subject: { woId: input.woId, transactionId: input.transactionId },
        nonce: input.nonce,
        reason: input.reason,
      },
      // ProductionContext.client is the structural QueryClient seam; at runtime
      // withOrgContext supplies a real pg.PoolClient (signEvent's required type).
      { client: ctx.client as unknown as pg.PoolClient },
    );
    signatureId = receipt.signatureId;
  } catch (err) {
    return fail('esign_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // (2) Apply the transition (append wo_events + CAS-materialize closed).
  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'close',
    transactionId: input.transactionId,
    reason: input.reason,
    context: { signatureId, signerUserId: input.signerUserId },
  });
  if (!transition.ok) return transition;

  // (3) Emit production.wo.closed (10-finance / 12-reporting / 14-multi-site).
  // D365 close-dispatch is async outbox + DLQ only — never inline.
  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_WO_CLOSED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: {
      woId: input.woId,
      terminal: 'closed',
      closedAt: transition.data.closedAt,
      signatureId,
    },
  });

  return {
    ok: true,
    data: {
      woId: input.woId,
      status: 'closed',
      closedAt: transition.data.closedAt,
      signatureId,
    },
  };
}
