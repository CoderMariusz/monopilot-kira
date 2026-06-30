/**
 * 08-Production E1 — COMPLETE (T-019) + CANCEL (T-020) services.
 *
 * COMPLETE: in_progress → completed. Output yield gate must be GREEN — every
 *   primary output for the WO must be registered with qty_kg > 0 (the §10.3
 *   completion precondition). The 09-quality T-064 consume gate (holdsGuard) is
 *   checked against each registered output's LP/lot before completion is allowed
 *   to mutate state — an active hold returns 409 quality_hold_active + emits
 *   production.consume.blocked (PRD §16.4 V-PROD-02/V-PROD-16). On green:
 *   transition + emit production.wo.completed.
 *
 * CANCEL: planned/in_progress/paused/completed → cancelled (terminal branch from
 *   any non-closed, non-cancelled state). reason_code mandatory (audit). A
 *   reservation-release side-effect is the documented 05-warehouse seam (no LP
 *   module yet) — recorded on the event payload.
 *
 * Both transition through the state machine (optimistic lock T-022). closed and
 * cancelled are terminal; the state machine rejects further verbs.
 */

import { holdsGuard } from './holds-guard';
import { recordWoCompletionSnapshot } from './oee-snapshot-producer';
import {
  EventType,
  QualityHoldError,
  type ProductionContext,
  type ProductionResult,
  fail,
  hasPermission,
  writeOutbox,
} from './shared';
import { applyTransition } from './wo-state-machine';

export type CompleteWoInput = {
  woId: string;
  transactionId: string;
  overrideReasonCode?: string | null;
};

export type CompleteWoData = {
  woId: string;
  status: 'completed';
  completedAt: string | null;
  outputsRegistered: number;
};

export async function completeWo(
  ctx: ProductionContext,
  input: CompleteWoInput,
): Promise<ProductionResult<CompleteWoData>> {
  if (!(await hasPermission(ctx, 'production.wo.complete'))) return fail('forbidden');

  const client = ctx.client;

  // Output yield gate: collect the WO's registered outputs (with their LP/lot).
  const outputs = await client.query<{
    id: string;
    output_type: string;
    lp_id: string | null;
  }>(
    `select o.id, o.output_type, o.lp_id
       from public.wo_outputs o
      where o.org_id = app.current_org_id()
        and o.wo_id = $1::uuid
        and o.correction_of_id is null
        and not exists (
          select 1
            from public.wo_outputs correction
           where correction.org_id = o.org_id
             and correction.correction_of_id = o.id
        )`,
    [input.woId],
  );

  // holdsGuard (T-064): every output path checks for an active quality hold on
  // the output LP/lot BEFORE the completion state mutation. On an active hold we
  // THROW QualityHoldError — the route handler emits production.consume.blocked on
  // a FRESH committed connection and rolls back this txn (consistent blocked-audit
  // semantics with register-output / record-waste; the in-txn writeOutbox could
  // previously commit a blocked event even though the failed txn rolled back).
  for (const out of outputs.rows) {
    const hold = await holdsGuard(ctx, { lpId: out.lp_id });
    if (hold) {
      throw new QualityHoldError({
        hold,
        woId: input.woId,
        blockedPath: 'complete',
        transactionId: input.transactionId,
        lpId: out.lp_id ?? null,
        lotId: null,
      });
    }
  }

  // Yield gate GREEN check: at least one primary output registered with qty_kg>0,
  // unless an override reason code is supplied (production-manager override path).
  // The qty_kg>0 comparison runs in SQL as NUMERIC — never coerced to JS float.
  const greenRes = await client.query<{ green: boolean }>(
    `select exists(
              select 1 from public.wo_outputs o
               where o.org_id = app.current_org_id()
                 and o.wo_id = $1::uuid
                 and o.output_type = 'primary'
                 and o.qty_kg > 0
                 and o.correction_of_id is null
                 and not exists (
                   select 1
                     from public.wo_outputs correction
                    where correction.org_id = o.org_id
                      and correction.correction_of_id = o.id
                 )
            ) as green`,
    [input.woId],
  );
  const primaryGreen = greenRes.rows[0]?.green === true;
  if (!primaryGreen && !input.overrideReasonCode) {
    return fail('closed_production_strict_failed', {
      message: 'output yield gate not green — no primary output registered',
      details: { code: 'output_yield_gate_failed', outputsRegistered: outputs.rows.length },
    });
  }

  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'complete',
    transactionId: input.transactionId,
    context: {
      overrideReasonCode: input.overrideReasonCode ?? null,
      outputsRegistered: outputs.rows.length,
    },
  });
  if (!transition.ok) return transition;

  // Persist actual_qty + produced_quantity from primary outputs so yield_percent
  // (generated column, mig 176) is no longer permanently NULL.
  await client.query(
    `update public.work_orders
        set actual_qty = (
              select coalesce(sum(o.qty_kg), 0)
                from public.wo_outputs o
               where o.org_id = app.current_org_id()
                 and o.wo_id = $1::uuid
                 and o.output_type = 'primary'
                 and o.correction_of_id is null
                 and not exists (
                   select 1 from public.wo_outputs c
                    where c.org_id = o.org_id and c.correction_of_id = o.id
                 )
            ),
            produced_quantity = (
              select coalesce(sum(o.qty_kg), 0)
                from public.wo_outputs o
               where o.org_id = app.current_org_id()
                 and o.wo_id = $1::uuid
                 and o.output_type = 'primary'
                 and o.correction_of_id is null
                 and not exists (
                   select 1 from public.wo_outputs c
                    where c.org_id = o.org_id and c.correction_of_id = o.id
                 )
            )
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [input.woId],
  );

  // D-OEE-1: 08-production is the SOLE producer of oee_snapshots — write the WO-grain
  // snapshot INSIDE the completion txn, right after the state materializes. Idempotent
  // (R14 replay / grain collision → recorded:false, no error, no second row).
  await recordWoCompletionSnapshot(ctx, {
    woId: input.woId,
    startedAt: transition.data.startedAt,
    completedAt: transition.data.completedAt,
  });

  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_WO_COMPLETED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: {
      woId: input.woId,
      completedAt: transition.data.completedAt,
      outputsRegistered: outputs.rows.length,
      overrideReasonCode: input.overrideReasonCode ?? null,
    },
  });

  return {
    ok: true,
    data: {
      woId: input.woId,
      status: 'completed',
      completedAt: transition.data.completedAt,
      outputsRegistered: outputs.rows.length,
    },
  };
}

export type CancelWoInput = {
  woId: string;
  transactionId: string;
  reasonCode: string;
  notes?: string | null;
};

export type CancelWoData = {
  woId: string;
  status: 'cancelled';
  cancelledAt: string | null;
  reservationsReleased: string[];
};

export async function cancelWo(
  ctx: ProductionContext,
  input: CancelWoInput,
): Promise<ProductionResult<CancelWoData>> {
  if (!(await hasPermission(ctx, 'production.wo.cancel'))) return fail('forbidden');
  if (!input.reasonCode || input.reasonCode.trim().length === 0) {
    return fail('invalid_input', { message: 'reasonCode is required' });
  }

  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'cancel',
    transactionId: input.transactionId,
    reason: input.reasonCode,
    context: { reasonCode: input.reasonCode, notes: input.notes ?? null },
  });
  if (!transition.ok) return transition;

  // 05-warehouse reservation-release seam (no LP module yet) — recorded on the
  // event payload so the warehouse consumer can release on receipt.
  const reservationsReleased: string[] = [];

  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_WO_CLOSED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: {
      woId: input.woId,
      terminal: 'cancelled',
      cancelledAt: transition.data.cancelledAt,
      reasonCode: input.reasonCode,
      reservationsReleased,
    },
  });

  return {
    ok: true,
    data: {
      woId: input.woId,
      status: 'cancelled',
      cancelledAt: transition.data.cancelledAt,
      reservationsReleased,
    },
  };
}
