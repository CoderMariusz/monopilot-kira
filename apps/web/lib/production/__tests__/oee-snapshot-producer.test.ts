/**
 * 08-Production — WO-complete OEE snapshot producer unit tests (D-OEE-1 producer side).
 *
 * Pure math: availability with overlapping/open/clipped downtime, performance honesty
 * (NULL without a standard-time source; clamp at 100), quality (waste in denominator;
 * NULL on zero denominator), composite NULL propagation.
 *
 * Writer: scripted fake client — asserts the inserted A/P/Q params, the honest
 * fallbacks (line 'unassigned' / shift 'unspecified'), the idempotency guards in the
 * INSERT SQL (NOT EXISTS + ON CONFLICT DO NOTHING), and the skip paths (missing
 * window / zero runtime / replay returning no row).
 */
import { describe, expect, it } from 'vitest';

import type { ProductionContext } from '../shared';
import {
  computeAvailabilityPct,
  computeOeePct,
  computePerformancePct,
  computeQualityPct,
  recordWoCompletionSnapshot,
  totalDowntimeMinutes,
} from '../oee-snapshot-producer';

const T0 = '2026-06-11T08:00:00.000Z';
const T_END = '2026-06-11T10:00:00.000Z'; // 120 min window

describe('totalDowntimeMinutes (merge + clip)', () => {
  it('sums disjoint events clipped to the window', () => {
    expect(
      totalDowntimeMinutes(
        [
          { startedAt: '2026-06-11T08:10:00Z', endedAt: '2026-06-11T08:20:00Z' }, // 10
          { startedAt: '2026-06-11T09:00:00Z', endedAt: '2026-06-11T09:15:00Z' }, // 15
        ],
        T0,
        T_END,
      ),
    ).toBe(25);
  });

  it('MERGES overlapping events instead of double-counting', () => {
    expect(
      totalDowntimeMinutes(
        [
          { startedAt: '2026-06-11T08:10:00Z', endedAt: '2026-06-11T08:40:00Z' }, // 30
          { startedAt: '2026-06-11T08:30:00Z', endedAt: '2026-06-11T08:50:00Z' }, // overlaps 10
        ],
        T0,
        T_END,
      ),
    ).toBe(40); // 08:10→08:50 merged, NOT 30+20=50
  });

  it('clips an open event (ended_at NULL) at the window end', () => {
    expect(
      totalDowntimeMinutes([{ startedAt: '2026-06-11T09:30:00Z', endedAt: null }], T0, T_END),
    ).toBe(30);
  });

  it('ignores events fully outside the window', () => {
    expect(
      totalDowntimeMinutes(
        [{ startedAt: '2026-06-11T11:00:00Z', endedAt: '2026-06-11T11:30:00Z' }],
        T0,
        T_END,
      ),
    ).toBe(0);
  });
});

describe('computeAvailabilityPct', () => {
  it('(runtime − downtime)/runtime', () => {
    expect(computeAvailabilityPct(120, 30)).toBe(75);
  });
  it('caps downtime at runtime → 0, never negative', () => {
    expect(computeAvailabilityPct(60, 90)).toBe(0);
  });
  it('null on non-positive runtime (snapshot skipped)', () => {
    expect(computeAvailabilityPct(0, 0)).toBeNull();
    expect(computeAvailabilityPct(-5, 0)).toBeNull();
  });
});

describe('computePerformancePct (honesty)', () => {
  it('standard/actual run time', () => {
    expect(computePerformancePct(90, 100)).toBe(90);
  });
  it('NULL when no standard-time source — NEVER fabricated', () => {
    expect(computePerformancePct(null, 100)).toBeNull();
    expect(computePerformancePct(0, 100)).toBeNull();
  });
  it('NULL when actual run time is zero', () => {
    expect(computePerformancePct(60, 0)).toBeNull();
  });
  it('clamps faster-than-standard to 100 (DDL CHECK 0..100)', () => {
    expect(computePerformancePct(120, 100)).toBe(100);
  });
});

describe('computeQualityPct', () => {
  it('good/(good+rejected+waste) — waste counts against quality', () => {
    expect(computeQualityPct(90, 5, 5)).toBe(90);
  });
  it('NULL on zero denominator (no outputs, no waste)', () => {
    expect(computeQualityPct(0, 0, 0)).toBeNull();
  });
  it('100 when everything is good', () => {
    expect(computeQualityPct(50, 0, 0)).toBe(100);
  });
});

describe('computeOeePct (NULL propagation, mirrors GENERATED column)', () => {
  it('A×P×Q/10000', () => {
    expect(computeOeePct(90, 80, 95)).toBe(68.4);
  });
  it('NULL if ANY component is NULL', () => {
    expect(computeOeePct(90, null, 95)).toBeNull();
    expect(computeOeePct(90, 80, null)).toBeNull();
    expect(computeOeePct(null, 80, 95)).toBeNull();
  });
});

// ── Writer (fake client) ─────────────────────────────────────────────────────

type Call = { sql: string; params: readonly unknown[] };

function makeCtx(script: {
  wo?: Array<{ line_id: string | null; site_id: string | null }>;
  shift?: Array<{ shift_id: string }>;
  downtime?: Array<{ started_at: string; ended_at: string | null }>;
  expected?: Array<{ expected_min: number | null }>;
  outputs?: Array<{ good_kg: string; rejected_kg: string }>;
  waste?: Array<{ waste_kg: string }>;
  insert?: Array<{ id: string }>;
}): { ctx: ProductionContext; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    query: async (
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<{ rows: Record<string, unknown>[] }> => {
      calls.push({ sql, params });
      if (sql.includes('from public.work_orders')) return { rows: script.wo ?? [] };
      if (sql.includes('shift_id is not null')) return { rows: script.shift ?? [] };
      if (sql.includes('from public.downtime_events')) return { rows: script.downtime ?? [] };
      if (sql.includes('from public.wo_operations')) {
        return { rows: script.expected ?? [{ expected_min: null }] };
      }
      if (sql.includes('from public.wo_outputs')) {
        return { rows: script.outputs ?? [{ good_kg: '0', rejected_kg: '0' }] };
      }
      if (sql.includes('from public.wo_waste_log')) {
        return { rows: script.waste ?? [{ waste_kg: '0' }] };
      }
      if (sql.includes('insert into public.oee_snapshots')) return { rows: script.insert ?? [] };
      throw new Error(`unexpected SQL in fake client: ${sql}`);
    },
  };
  return { ctx: { userId: 'u-1', orgId: 'o-1', client } as ProductionContext, calls };
}

const WO_ID = '00000000-0000-4000-8000-000000000001';

describe('recordWoCompletionSnapshot (writer)', () => {
  it('inserts the computed A/P/Q row with exact-text kg deltas', async () => {
    const { ctx, calls } = makeCtx({
      wo: [{ line_id: 'line-uuid-1', site_id: 'site-1' }],
      shift: [{ shift_id: 'S1' }],
      downtime: [{ started_at: '2026-06-11T08:10:00Z', ended_at: '2026-06-11T08:40:00Z' }], // 30 min
      expected: [{ expected_min: 81 }],
      outputs: [{ good_kg: '90.000', rejected_kg: '5.000' }],
      waste: [{ waste_kg: '5.000' }],
      insert: [{ id: '42' }],
    });

    const res = await recordWoCompletionSnapshot(ctx, {
      woId: WO_ID,
      startedAt: T0,
      completedAt: T_END, // 120 min runtime → 90 run minutes
    });

    expect(res).toEqual({ recorded: true, snapshotId: '42' });
    const insert = calls.find((c) => c.sql.includes('insert into public.oee_snapshots'))!;
    // idempotency guards baked into the SQL
    expect(insert.sql).toContain('where not exists');
    expect(insert.sql).toContain('on conflict do nothing');
    // [site, line, shift, completedAt, A, P, Q, wo, goodKg, downtimeMin, wasteKg]
    expect(insert.params[0]).toBe('site-1');
    expect(insert.params[1]).toBe('line-uuid-1');
    expect(insert.params[2]).toBe('S1');
    expect(insert.params[3]).toBe(T_END);
    expect(insert.params[4]).toBe('75.00'); // (120−30)/120
    expect(insert.params[5]).toBe('90.00'); // 81 std / 90 run
    expect(insert.params[6]).toBe('90.00'); // 90/(90+5+5)
    expect(insert.params[7]).toBe(WO_ID);
    expect(insert.params[8]).toBe('90.000'); // exact NUMERIC text, no float roundtrip
    expect(insert.params[9]).toBe(30);
    expect(insert.params[10]).toBe('5.000');
  });

  it('performance is HONEST NULL without a standard-time source', async () => {
    const { ctx, calls } = makeCtx({
      wo: [{ line_id: 'line-uuid-1', site_id: null }],
      expected: [{ expected_min: null }],
      outputs: [{ good_kg: '10.000', rejected_kg: '0' }],
      insert: [{ id: '7' }],
    });
    const res = await recordWoCompletionSnapshot(ctx, {
      woId: WO_ID,
      startedAt: T0,
      completedAt: T_END,
    });
    expect(res.recorded).toBe(true);
    const insert = calls.find((c) => c.sql.includes('insert into public.oee_snapshots'))!;
    expect(insert.params[5]).toBeNull(); // performance_pct
    expect(insert.params[6]).toBe('100.00'); // quality still computed
  });

  it('quality is HONEST NULL on a zero denominator (no outputs, no waste)', async () => {
    const { ctx, calls } = makeCtx({
      wo: [{ line_id: null, site_id: null }],
      insert: [{ id: '8' }],
    });
    const res = await recordWoCompletionSnapshot(ctx, {
      woId: WO_ID,
      startedAt: T0,
      completedAt: T_END,
    });
    expect(res.recorded).toBe(true);
    const insert = calls.find((c) => c.sql.includes('insert into public.oee_snapshots'))!;
    expect(insert.params[1]).toBe('unassigned'); // line fallback
    expect(insert.params[2]).toBe('unspecified'); // shift fallback
    expect(insert.params[5]).toBeNull(); // performance
    expect(insert.params[6]).toBeNull(); // quality
  });

  it('skips without a runtime window (no fabricated rows)', async () => {
    const { ctx, calls } = makeCtx({});
    expect(
      await recordWoCompletionSnapshot(ctx, { woId: WO_ID, startedAt: null, completedAt: T_END }),
    ).toEqual({ recorded: false, reason: 'missing_window' });
    expect(
      await recordWoCompletionSnapshot(ctx, { woId: WO_ID, startedAt: T_END, completedAt: T0 }),
    ).toEqual({ recorded: false, reason: 'zero_runtime' });
    expect(calls.length).toBe(0); // nothing queried, nothing written
  });

  it('idempotent re-complete: insert affects no row → recorded:false, NO error', async () => {
    const { ctx } = makeCtx({
      wo: [{ line_id: 'line-uuid-1', site_id: null }],
      outputs: [{ good_kg: '10.000', rejected_kg: '0' }],
      insert: [], // NOT EXISTS / ON CONFLICT swallowed the row
    });
    const res = await recordWoCompletionSnapshot(ctx, {
      woId: WO_ID,
      startedAt: T0,
      completedAt: T_END,
    });
    expect(res).toEqual({ recorded: false, reason: 'duplicate_or_grain_conflict' });
  });
});
