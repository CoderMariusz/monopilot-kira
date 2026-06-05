/**
 * 08-Production E1 — PAUSE + RESUME services (T-018).
 *
 * PAUSE: in_progress → paused, with a side-effect open downtime_events row
 *   (source='wo_pause', ended_at NULL). The downtime row is atomic with the
 *   state transition (single txn). category_id is required by the schema
 *   (migration 183, downtime_events.category_id NOT NULL) so the caller must
 *   supply a downtime category (V-PROD-22: a wo_pause downtime is categorized).
 *
 * RESUME: paused → in_progress, closing the open wo_pause downtime row
 *   (set ended_at). duration_min is a GENERATED STORED column (V-PROD-06) —
 *   NEVER written directly; an operator correction sets ended_at =
 *   started_at + actual_duration_min, never duration_min.
 *
 * Both go through the state machine (append wo_events + CAS-materialize status,
 * optimistic lock T-022). work_orders.status mirrors paused→ON_HOLD,
 * in_progress→IN_PROGRESS via the state machine.
 */

import {
  EventType,
  type ProductionContext,
  type ProductionResult,
  fail,
  hasPermission,
  isPgError,
  writeOutbox,
} from './shared';
import { applyTransition } from './wo-state-machine';

export type PauseWoInput = {
  woId: string;
  transactionId: string;
  /** Required: downtime category for the wo_pause event (V-PROD-22). */
  reasonCategoryId: string;
  lineId: string;
  shiftId?: string | null;
  notes?: string | null;
};

export type PauseWoData = {
  woId: string;
  status: 'paused';
  pausedAt: string | null;
  downtimeEventId: string;
};

export async function pauseWo(
  ctx: ProductionContext,
  input: PauseWoInput,
): Promise<ProductionResult<PauseWoData>> {
  if (!(await hasPermission(ctx, 'production.wo.pause'))) return fail('forbidden');

  // State transition first (validates in_progress → paused; 409 otherwise).
  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'pause',
    transactionId: input.transactionId,
    reason: input.notes ?? null,
    context: { reasonCategoryId: input.reasonCategoryId, lineId: input.lineId },
  });
  if (!transition.ok) return transition;

  // Side-effect: open a wo_pause downtime row (atomic with the transition).
  let downtimeEventId: string;
  try {
    const dt = await ctx.client.query<{ id: string }>(
      `insert into public.downtime_events
         (org_id, line_id, wo_id, category_id, source, started_at, shift_id, operator_id, reason_notes, recorded_by)
       values (app.current_org_id(), $1, $2::uuid, $3::uuid, 'wo_pause', pg_catalog.now(),
               $4, $5::uuid, $6, $5::uuid)
       returning id`,
      [input.lineId, input.woId, input.reasonCategoryId, input.shiftId ?? null, ctx.userId, input.notes ?? null],
    );
    downtimeEventId = String(dt.rows[0]!.id);
  } catch (err) {
    if (isPgError(err) && err.code === '23503') {
      // FK violation — the category_id does not resolve in this org.
      return fail('invalid_input', { message: 'reasonCategoryId not found', details: { code: 'invalid_category' } });
    }
    return fail('persistence_failed', { message: err instanceof Error ? err.message : String(err) });
  }

  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_DOWNTIME_RECORDED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: { woId: input.woId, downtimeEventId, source: 'wo_pause', state: 'opened' },
  });

  return {
    ok: true,
    data: { woId: input.woId, status: 'paused', pausedAt: transition.data.pausedAt, downtimeEventId },
  };
}

export type ResumeWoInput = {
  woId: string;
  transactionId: string;
  /** Operator correction: set ended_at = started_at + actual_duration_min. */
  actualDurationMin?: number | null;
};

export type ResumeWoData = {
  woId: string;
  status: 'in_progress';
  resumedAt: string | null;
  downtimeEventId: string | null;
  durationMin: number | null;
};

export async function resumeWo(
  ctx: ProductionContext,
  input: ResumeWoInput,
): Promise<ProductionResult<ResumeWoData>> {
  if (!(await hasPermission(ctx, 'production.wo.resume'))) return fail('forbidden');

  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'resume',
    transactionId: input.transactionId,
    context: { actualDurationMin: input.actualDurationMin ?? null },
  });
  if (!transition.ok) return transition;

  // Close the single open wo_pause downtime row. duration_min is GENERATED — we
  // only set ended_at (V-PROD-06). actual_duration_min override resolves ended_at
  // to started_at + N minutes; otherwise now().
  const closed = await ctx.client.query<{ id: string; duration_min: number | null }>(
    `update public.downtime_events
        set ended_at = case
                          when $2::integer is not null
                            then started_at + make_interval(mins => $2::integer)
                          else pg_catalog.now()
                        end
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and source = 'wo_pause'
        and ended_at is null
      returning id, duration_min`,
    [input.woId, input.actualDurationMin ?? null],
  );
  const row = closed.rows[0] ?? null;

  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_DOWNTIME_RECORDED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: {
      woId: input.woId,
      downtimeEventId: row ? String(row.id) : null,
      source: 'wo_pause',
      state: 'closed',
      durationMin: row?.duration_min ?? null,
    },
  });

  return {
    ok: true,
    data: {
      woId: input.woId,
      status: 'in_progress',
      resumedAt: transition.data.resumedAt,
      downtimeEventId: row ? String(row.id) : null,
      durationMin: row?.duration_min ?? null,
    },
  };
}
