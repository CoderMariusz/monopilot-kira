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

import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { signEvent } from '@monopilot/e-sign';

import { computeWacReversalDelta, upsertWac } from '../finance/upsert-wac';
import { assertWoNotOnHold, holdsGuard } from './holds-guard';
import { recordWoCompletionSnapshot } from './oee-snapshot-producer';
import {
  EventType,
  QualityHoldError,
  type ProductionContext,
  type ProductionResult,
  fail,
  hasPermission,
  readWoExecutionStatus,
  writeOutbox,
} from './shared';
import { applyTransition } from './wo-state-machine';
import {
  assertUpstreamWipReady,
  upstreamWipNotReadyMessage,
} from '../planning/upstream-wip-dependency-gate';
import {
  isYieldGateOverrideReasonCode,
  YIELD_GATE_OVERRIDE_REASON_CODES,
} from './yield-gate-override';
import { evaluateClosedProductionStrict } from './evaluate-closed-production-strict';

export type CompleteWoInput = {
  woId: string;
  transactionId: string;
  overrideReasonCode?: string | null;
  /** CFR-21 e-sign for yield-gate override (required when override path is taken). */
  overrideSignerUserId?: string;
  overridePin?: string;
  overrideEsignReason?: string;
  overrideNonce?: string;
};

async function writeYieldGateOverrideAudit(
  ctx: ProductionContext,
  params: { woId: string; overrideReasonCode: string; transactionId: string },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events (
       org_id,
       actor_user_id,
       actor_type,
       action,
       resource_type,
       resource_id,
       before_state,
       after_state,
       request_id,
       retention_class
     )
     values (
       app.current_org_id(),
       $1::uuid,
       'user',
       'production.wo.yield_gate_overridden',
       'work_order',
       $2,
       '{}'::jsonb,
       $3::jsonb,
       $4::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      params.woId,
      JSON.stringify({
        overrideReasonCode: params.overrideReasonCode,
        overriddenByUserId: ctx.userId,
        transactionId: params.transactionId,
      }),
      params.transactionId,
    ],
  );
}

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

  const woHoldGate = await assertWoNotOnHold(input.woId, { client });
  if (!woHoldGate.ok) {
    throw new QualityHoldError({
      hold: woHoldGate.hold,
      woId: input.woId,
      blockedPath: 'complete',
      transactionId: input.transactionId,
      lpId: null,
      lotId: null,
    });
  }

  const upstreamGate = await assertUpstreamWipReady(client, input.woId, 'complete');
  if (upstreamGate) {
    return fail('upstream_wip_not_ready', {
      message: upstreamWipNotReadyMessage(upstreamGate),
      details: upstreamGate,
    });
  }

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
  const strictGate = await evaluateClosedProductionStrict(client, input.woId);
  const consumptionWithinTolerance = strictGate?.within_tolerance !== false;
  const yieldGateGreen = primaryGreen && consumptionWithinTolerance;
  let persistedOverrideReasonCode: string | null = null;
  let yieldOverrideSignatureId: string | null = null;
  if (!yieldGateGreen) {
    const overrideCode = input.overrideReasonCode?.trim() ?? '';
    if (!overrideCode) {
      const failureCode = !primaryGreen
        ? 'output_yield_gate_failed'
        : 'consumption_yield_out_of_tolerance';
      return fail('closed_production_strict_failed', {
        message: !primaryGreen
          ? 'output yield gate not green — no primary output registered'
          : 'actual consumption/yield is outside configured tolerance — supervisor override required',
        details: {
          code: failureCode,
          outputsRegistered: outputs.rows.length,
          strictGate,
        },
      });
    }
    if (!isYieldGateOverrideReasonCode(overrideCode)) {
      return fail('invalid_input', {
        message: 'yield-gate override reason code is not in the controlled taxonomy',
        details: {
          code: 'invalid_yield_gate_override_reason',
          allowed: [...YIELD_GATE_OVERRIDE_REASON_CODES],
        },
      });
    }
    if (!(await hasPermission(ctx, 'production.wo.override_yield'))) {
      return fail('forbidden');
    }

    const esignReason = input.overrideEsignReason?.trim() ?? '';
    const esignPin = input.overridePin?.trim() ?? '';
    if (!esignReason) {
      return fail('invalid_input', {
        message: 'e-sign reason is required for yield-gate override (CFR-21 Part 11)',
      });
    }
    if (!esignPin) {
      return fail('invalid_input', { message: 'e-sign PIN is required for yield-gate override' });
    }

    const signerUserId = input.overrideSignerUserId?.trim() || ctx.userId;
    try {
      const receipt = await signEvent(
        {
          signerUserId,
          pin: esignPin,
          intent: 'prod.wo.yield_override',
          subject: {
            woId: input.woId,
            transactionId: input.transactionId,
            overrideReasonCode: overrideCode,
          },
          nonce: input.overrideNonce,
          reason: esignReason,
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );
      yieldOverrideSignatureId = receipt.signatureId;
    } catch (err) {
      return fail('esign_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    persistedOverrideReasonCode = overrideCode;
  }

  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'complete',
    transactionId: input.transactionId,
    context: {
      overrideReasonCode: persistedOverrideReasonCode,
      outputsRegistered: outputs.rows.length,
      ...(yieldOverrideSignatureId
        ? {
            yieldOverrideSignatureId,
            yieldOverrideSignerUserId: input.overrideSignerUserId?.trim() || ctx.userId,
          }
        : {}),
    },
  });
  if (!transition.ok) {
    if (yieldOverrideSignatureId) {
      throw new Error(
        `complete transition failed after yield-override e-sign was persisted (${transition.error}) — rolling back the signature to preserve CFR-21 atomicity`,
      );
    }
    return transition;
  }

  if (persistedOverrideReasonCode) {
    await writeYieldGateOverrideAudit(ctx, {
      woId: input.woId,
      overrideReasonCode: persistedOverrideReasonCode,
      transactionId: input.transactionId,
    });
  }

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
      overrideReasonCode: persistedOverrideReasonCode,
      ...(yieldOverrideSignatureId ? { yieldOverrideSignatureId } : {}),
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

type CancelAffectedOutputLp = {
  output_id: string;
  lp_id: string;
  site_id: string | null;
  status: string;
  product_id: string;
  qty_kg: string;
  fallback_wac_value: string;
  ext_jsonb: unknown;
};

type LiveOutputLp = {
  lp_number: string;
  qty: string;
};

async function loadLiveOutputLps(ctx: ProductionContext, woId: string): Promise<LiveOutputLp[]> {
  const { rows } = await ctx.client.query<LiveOutputLp>(
    `select lp.lp_number,
            o.qty_kg::text as qty
       from public.wo_outputs o
       join public.license_plates lp
         on lp.org_id = o.org_id
        and lp.id = o.lp_id
      where o.org_id = app.current_org_id()
        and o.wo_id = $1::uuid
        and o.correction_of_id is null
        and o.lp_id is not null
        and o.qty_kg > 0
        and lp.status not in ('destroyed', 'consumed')
        and not exists (
          select 1
            from public.wo_outputs correction
           where correction.org_id = o.org_id
             and correction.correction_of_id = o.id
        )
      order by lp.lp_number asc`,
    [woId],
  );
  return rows;
}

export async function cancelWo(
  ctx: ProductionContext,
  input: CancelWoInput,
): Promise<ProductionResult<CancelWoData>> {
  if (!(await hasPermission(ctx, 'production.wo.cancel'))) return fail('forbidden');
  if (!input.reasonCode || input.reasonCode.trim().length === 0) {
    return fail('invalid_input', { message: 'reasonCode is required' });
  }

  const previousStatus = await readWoExecutionStatus(ctx, input.woId);

  if (previousStatus === 'in_progress' || previousStatus === 'paused') {
    const liveOutputs = await loadLiveOutputLps(ctx, input.woId);
    if (liveOutputs.length > 0) {
      return fail('invalid_state', {
        message:
          'Registered output license plates are still live — void each output before cancelling this work order.',
        details: {
          code: 'live_output_lps_present',
          outputs: liveOutputs,
        },
      });
    }
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
  const voidedOutputLpIds: string[] = [];

  if (previousStatus === 'completed') {
    const affectedOutputLps = await ctx.client.query<CancelAffectedOutputLp>(
      `select o.id::text as output_id,
              lp.id::text as lp_id,
              lp.site_id::text as site_id,
              lp.status,
              o.product_id::text as product_id,
              o.qty_kg::text as qty_kg,
              (o.qty_kg * coalesce(i.cost_per_kg, 0))::text as fallback_wac_value,
              o.ext_jsonb
         from public.wo_outputs o
         join public.license_plates lp
           on lp.org_id = o.org_id
          and lp.id = o.lp_id
         left join public.items i
           on i.org_id = o.org_id
          and i.id = o.product_id
        where o.org_id = app.current_org_id()
          and o.wo_id = $1::uuid
          and o.correction_of_id is null
          and lp.status not in ('destroyed', 'consumed')
          and not exists (
            select 1
              from public.wo_outputs correction
             where correction.org_id = o.org_id
               and correction.correction_of_id = o.id
          )
        for update of o, lp`,
      [input.woId],
    );

    const affectedLpRows = new Map<string, { site_id: string | null; status: string }>();
    for (const output of affectedOutputLps.rows) {
      affectedLpRows.set(output.lp_id, { site_id: output.site_id, status: output.status });

      const wacReversal = computeWacReversalDelta({
        extJsonb: output.ext_jsonb,
        fallbackQtyKg: output.qty_kg,
        fallbackValue: output.fallback_wac_value,
      });
      if (wacReversal.source === 'fallback') {
        console.warn('[wac] reversal_fallback', { woOutputId: output.output_id });
      }
      await upsertWac(ctx.client, {
        orgId: ctx.orgId,
        siteId: output.site_id,
        itemId: output.product_id,
        deltaQtyKg: wacReversal.deltaQtyKg,
        deltaValue: wacReversal.deltaValue,
        updatedBy: ctx.userId,
      });
    }

    for (const [lpId, lp] of affectedLpRows) {
      await ctx.client.query(
        `insert into public.lp_state_history (
           org_id,
           site_id,
           lp_id,
           from_state,
           to_state,
           reason_code,
           reason_text,
           wo_id,
           transaction_id,
           ext_jsonb,
           created_by
         )
         values (
           app.current_org_id(),
           $1::uuid,
           $2::uuid,
           $3,
           'destroyed',
           'wo_cancelled',
           $4,
           $5::uuid,
           $6::uuid,
           $7::jsonb,
           $8::uuid
         )`,
        [
          lp.site_id,
          lpId,
          lp.status,
          input.notes ?? null,
          input.woId,
          randomUUID(),
          JSON.stringify({
            cancellation_reason_code: input.reasonCode,
            transaction_id: input.transactionId,
          }),
          ctx.userId,
        ],
      );
    }

    voidedOutputLpIds.push(...affectedLpRows.keys());

    if (voidedOutputLpIds.length > 0) {
      await ctx.client.query(
        `update public.license_plates lp
            set status = 'destroyed',
                quantity = 0,
                reserved_qty = 0,
                updated_by = $2::uuid,
                updated_at = now()
          where lp.org_id = app.current_org_id()
            and lp.id = any($1::uuid[])`,
        [voidedOutputLpIds, ctx.userId],
      );
    }
  }

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
      voidedOutputLpIds,
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
