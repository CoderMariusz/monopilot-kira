/**
 * 08-Production — WO-complete OEE snapshot producer (D-OEE-1: 08-production is the
 * SOLE writer of `oee_snapshots`; 15-OEE consumes READ-ONLY).
 *
 * Called from `completeWo` (complete-cancel-wo.ts) INSIDE the completion transaction,
 * immediately after the state machine materializes `completed`. Writes exactly ONE
 * WO-grain snapshot row per completed WO:
 *
 *   grain          (org_id, line_id, shift_id, snapshot_minute) — V-PROD-10 quad-unique
 *                  (mig 184). snapshot_minute = date_trunc('minute', completed_at).
 *                  Per-WO idempotency on top: partial unique (org_id, active_wo_id)
 *                  (mig 286) + WHERE NOT EXISTS + ON CONFLICT DO NOTHING — an R14
 *                  replayed COMPLETE is a silent no-op, never an error in the txn.
 *
 *   availability   (runtime − downtime) / runtime × 100, where runtime is the
 *                  wo_executions started_at → completed_at window in minutes and
 *                  downtime is the merged overlap of this WO's downtime_events with
 *                  that window (overlapping events are MERGED, never double-counted;
 *                  open events are clipped at the window end). Clamped to [0, 100].
 *                  If the window is missing/zero, NO row is written (skip — honest).
 *
 *   performance    standard time / actual run time × 100, where standard time =
 *                  SUM(wo_operations.expected_duration_minutes) for the WO and actual
 *                  run time = runtime − downtime. HONEST NULL when the WO has no
 *                  expected-duration rows (we NEVER fabricate an ideal rate) or when
 *                  actual run time is zero. Values > 100 (ran faster than standard)
 *                  clamp to 100 per the DDL CHECK (V-PROD-25, 0..100).
 *
 *   quality        good / (good + rejected + waste) × 100 with
 *                    good     = SUM(wo_outputs.qty_kg) WHERE qa_status <> 'FAILED'
 *                               (PENDING/PASSED/RELEASED/ON_HOLD count as good until
 *                               QA actually fails them — documented choice),
 *                    rejected = SUM(wo_outputs.qty_kg) WHERE qa_status = 'FAILED',
 *                    waste    = SUM(wo_waste_log.qty_kg).
 *                  HONEST NULL when the denominator is zero (e.g. override-completed
 *                  WO with no outputs and no waste).
 *
 *   oee_pct        GENERATED column (A×P×Q/10000, mig 184) — NULL whenever any
 *                  component is NULL. The producer never writes it.
 *
 *   context        line_id   = work_orders.production_line_id::text, fallback
 *                              'unassigned' (line is nullable on the WO);
 *                  shift_id  = most recent non-null downtime_events.shift_id for the
 *                              WO, fallback 'unspecified' (no shift calendar wired to
 *                              the completion path yet — 15-OEE T-003 shift_configs is
 *                              an aggregation-time concern, not a producer concern);
 *                  site_id   = work_orders.site_id; org via app.current_org_id().
 *
 * Percentages are computed in JS at 2-dp display precision (metrics, not money);
 * qty deltas (output/waste kg) pass through as NUMERIC text — no JS float roundtrip.
 */

import type { ProductionContext } from './shared';

// ── Pure math (unit-tested in __tests__/oee-snapshot-producer.test.ts) ────────

const MS_PER_MIN = 60_000;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clampPct(v: number): number {
  return round2(Math.min(100, Math.max(0, v)));
}

export type DowntimeInterval = {
  startedAt: string | Date;
  /** Null = still open — clipped at the window end. */
  endedAt: string | Date | null;
};

/**
 * Total downtime minutes inside [windowStart, windowEnd]: events are clipped to the
 * window, MERGED where they overlap (no double counting), then summed.
 */
export function totalDowntimeMinutes(
  events: readonly DowntimeInterval[],
  windowStart: string | Date,
  windowEnd: string | Date,
): number {
  const ws = new Date(windowStart).getTime();
  const we = new Date(windowEnd).getTime();
  if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return 0;

  const clipped = events
    .map((e) => {
      const s = Math.max(new Date(e.startedAt).getTime(), ws);
      const en = Math.min(e.endedAt == null ? we : new Date(e.endedAt).getTime(), we);
      return { s, e: en };
    })
    .filter((iv) => Number.isFinite(iv.s) && Number.isFinite(iv.e) && iv.e > iv.s)
    .sort((a, b) => a.s - b.s);

  let total = 0;
  let curS = Number.NaN;
  let curE = Number.NaN;
  for (const iv of clipped) {
    if (Number.isNaN(curS)) {
      curS = iv.s;
      curE = iv.e;
    } else if (iv.s <= curE) {
      curE = Math.max(curE, iv.e); // overlap/adjacent → merge
    } else {
      total += curE - curS;
      curS = iv.s;
      curE = iv.e;
    }
  }
  if (!Number.isNaN(curS)) total += curE - curS;
  return total / MS_PER_MIN;
}

/** Availability % — null when runtime is non-positive (snapshot is then skipped). */
export function computeAvailabilityPct(runtimeMin: number, downtimeMin: number): number | null {
  if (!Number.isFinite(runtimeMin) || runtimeMin <= 0) return null;
  const dt = Math.min(Math.max(downtimeMin, 0), runtimeMin);
  return clampPct(((runtimeMin - dt) / runtimeMin) * 100);
}

/**
 * Performance % — standard time / actual run time. HONEST NULL when no standard time
 * exists or actual run time is zero. >100 clamps to 100 (DDL CHECK V-PROD-25).
 */
export function computePerformancePct(
  expectedMinutes: number | null,
  actualRunMinutes: number,
): number | null {
  if (expectedMinutes == null || !Number.isFinite(expectedMinutes) || expectedMinutes <= 0) {
    return null;
  }
  if (!Number.isFinite(actualRunMinutes) || actualRunMinutes <= 0) return null;
  return clampPct((expectedMinutes / actualRunMinutes) * 100);
}

/** Quality % — good/(good+rejected+waste). HONEST NULL on a zero denominator. */
export function computeQualityPct(
  goodKg: number,
  rejectedKg: number,
  wasteKg: number,
): number | null {
  const good = Math.max(goodKg, 0);
  const denom = good + Math.max(rejectedKg, 0) + Math.max(wasteKg, 0);
  if (!Number.isFinite(denom) || denom <= 0) return null;
  return clampPct((good / denom) * 100);
}

/** Composite OEE (mirrors the GENERATED column for tests) — NULL if ANY component is. */
export function computeOeePct(
  a: number | null,
  p: number | null,
  q: number | null,
): number | null {
  if (a == null || p == null || q == null) return null;
  return round2((a * p * q) / 10000);
}

// ── Writer ────────────────────────────────────────────────────────────────────

export type WoCompletionSnapshotInput = {
  woId: string;
  /** wo_executions.started_at (ISO) — the runtime window start. */
  startedAt: string | null;
  /** wo_executions.completed_at (ISO) — window end + snapshot_minute source. */
  completedAt: string | null;
};

export type WoCompletionSnapshotResult =
  | { recorded: true; snapshotId: string }
  | {
      recorded: false;
      reason: 'missing_window' | 'zero_runtime' | 'wo_not_found' | 'duplicate_or_grain_conflict';
    };

/**
 * Compute + INSERT the WO-grain oee_snapshots row. Runs on the caller's txn client
 * (the completion transaction). Designed to never throw on the idempotent paths:
 * replays/grain collisions resolve to `recorded: false`, not an aborted txn.
 */
export async function recordWoCompletionSnapshot(
  ctx: ProductionContext,
  input: WoCompletionSnapshotInput,
): Promise<WoCompletionSnapshotResult> {
  const client = ctx.client;

  if (!input.startedAt || !input.completedAt) return { recorded: false, reason: 'missing_window' };
  const runtimeMin =
    (new Date(input.completedAt).getTime() - new Date(input.startedAt).getTime()) / MS_PER_MIN;
  if (!Number.isFinite(runtimeMin) || runtimeMin <= 0) {
    return { recorded: false, reason: 'zero_runtime' };
  }

  // WO context: line (nullable on the WO) + site.
  const woRes = await client.query<{ line_id: string | null; site_id: string | null }>(
    `select production_line_id::text as line_id, site_id
       from public.work_orders
      where org_id = app.current_org_id() and id = $1::uuid`,
    [input.woId],
  );
  if (woRes.rows.length === 0) return { recorded: false, reason: 'wo_not_found' };
  const lineId = woRes.rows[0]!.line_id ?? 'unassigned';
  const siteId = woRes.rows[0]!.site_id ?? null;

  // Shift: most recent non-null shift on this WO's downtime events; honest fallback.
  const shiftRes = await client.query<{ shift_id: string }>(
    `select shift_id
       from public.downtime_events
      where org_id = app.current_org_id() and wo_id = $1::uuid and shift_id is not null
      order by started_at desc
      limit 1`,
    [input.woId],
  );
  const shiftId = shiftRes.rows[0]?.shift_id ?? 'unspecified';

  // Downtime events for this WO — overlap merged/clipped in TS (pure, unit-tested).
  const dtRes = await client.query<{ started_at: string; ended_at: string | null }>(
    `select started_at, ended_at
       from public.downtime_events
      where org_id = app.current_org_id() and wo_id = $1::uuid`,
    [input.woId],
  );
  const downtimeMin = totalDowntimeMinutes(
    dtRes.rows.map((r) => ({ startedAt: r.started_at, endedAt: r.ended_at })),
    input.startedAt,
    input.completedAt,
  );

  // Standard time: SUM(wo_operations.expected_duration_minutes); NULL when absent.
  const expRes = await client.query<{ expected_min: number | null }>(
    `select sum(expected_duration_minutes)::int as expected_min
       from public.wo_operations
      where org_id = app.current_org_id() and wo_id = $1::uuid`,
    [input.woId],
  );
  const expectedMin =
    expRes.rows[0]?.expected_min == null ? null : Number(expRes.rows[0].expected_min);

  // Quality inputs — SQL NUMERIC sums returned as text; converted only for the
  // percentage (display-grade metric); the kg deltas are inserted as the exact text.
  const outRes = await client.query<{ good_kg: string; rejected_kg: string }>(
    `select coalesce(sum(qty_kg) filter (where qa_status <> 'FAILED'), 0)::text as good_kg,
            coalesce(sum(qty_kg) filter (where qa_status = 'FAILED'), 0)::text as rejected_kg
       from public.wo_outputs
      where org_id = app.current_org_id() and wo_id = $1::uuid`,
    [input.woId],
  );
  const goodKgText = outRes.rows[0]?.good_kg ?? '0';
  const rejectedKgText = outRes.rows[0]?.rejected_kg ?? '0';

  const wasteRes = await client.query<{ waste_kg: string }>(
    `select coalesce(sum(qty_kg), 0)::text as waste_kg
       from public.wo_waste_log
      where org_id = app.current_org_id() and wo_id = $1::uuid`,
    [input.woId],
  );
  const wasteKgText = wasteRes.rows[0]?.waste_kg ?? '0';

  const availabilityPct = computeAvailabilityPct(runtimeMin, downtimeMin);
  if (availabilityPct == null) return { recorded: false, reason: 'zero_runtime' };
  const performancePct = computePerformancePct(expectedMin, runtimeMin - downtimeMin);
  const qualityPct = computeQualityPct(
    Number(goodKgText),
    Number(rejectedKgText),
    Number(wasteKgText),
  );

  // Idempotent insert: NOT EXISTS (per-WO replay) + ON CONFLICT DO NOTHING (covers
  // both the mig-286 per-WO partial unique and the V-PROD-10 quad-unique grain).
  const ins = await client.query<{ id: string }>(
    `insert into public.oee_snapshots
       (org_id, site_id, line_id, shift_id, snapshot_minute,
        availability_pct, performance_pct, quality_pct,
        active_wo_id, output_qty_delta, downtime_min_delta, waste_qty_delta)
     select app.current_org_id(), $1::uuid, $2, $3, date_trunc('minute', $4::timestamptz),
            $5::numeric, $6::numeric, $7::numeric,
            $8::uuid, $9::numeric, $10::int, $11::numeric
      where not exists (
        select 1 from public.oee_snapshots
         where org_id = app.current_org_id() and active_wo_id = $8::uuid)
     on conflict do nothing
     returning id::text as id`,
    [
      siteId,
      lineId,
      shiftId,
      input.completedAt,
      availabilityPct.toFixed(2),
      performancePct == null ? null : performancePct.toFixed(2),
      qualityPct == null ? null : qualityPct.toFixed(2),
      input.woId,
      goodKgText,
      Math.round(downtimeMin),
      wasteKgText,
    ],
  );

  const row = ins.rows[0];
  if (!row) return { recorded: false, reason: 'duplicate_or_grain_conflict' };
  return { recorded: true, snapshotId: String(row.id) };
}
