import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAnalyticsScreen } from './analytics-data';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FROM = new Date('2026-05-10T00:00:00.000Z');
const TO = new Date('2026-05-20T23:59:59.999Z');

type QueryCall = { sql: string; params: unknown[] };

let calls: QueryCall[];
/** Overridable so a test can serve the "no snapshots in window" shape (avg() → NULL). */
let oeeKpiRow: { oee_avg: string | null; fpq_avg: string | null };
/** Overridable per-uom output rows (U1 mixed-uom partitioning). */
let outputRows: Array<{ uom?: string; output_kg: string | null }>;
let wasteRow: { waste_kg: string | null };

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }

    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('avg(oee_pct) as oee_avg')) {
      return { rows: [oeeKpiRow], rowCount: 1 };
    }
    if (normalized.includes('group by pl.code, pl.name')) {
      return {
        rows: [{ line_label: 'LINE1', yield_pct: '0.0300' }],
        rowCount: 1,
      };
    }
    if (normalized.includes('avg(wo.yield_percent)')) {
      return { rows: [{ avg_yield: '0.0300' }], rowCount: 1 };
    }
    if (normalized.includes('from public.wo_outputs o') && normalized.includes('sum(o.qty_kg)')) {
      return { rows: outputRows, rowCount: outputRows.length };
    }
    if (normalized.includes('from public.wo_waste_log w') && normalized.includes('sum(w.qty_kg)')) {
      return { rows: [wasteRow], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

beforeEach(() => {
  calls = [];
  oeeKpiRow = { oee_avg: '80.5', fpq_avg: '92.1' };
  outputRows = [{ output_kg: '11.760' }];
  wasteRow = { waste_kg: '0.020' };
});

describe('getAnalyticsScreen OEE/FPQ — "no data" is not 0%', () => {
  it('avg() → NULL (no snapshots in window) surfaces as null, NOT 0', async () => {
    oeeKpiRow = { oee_avg: null, fpq_avg: null };
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.oeeAvgPct).toBeNull();
    expect(result.data.fpqAvgPct).toBeNull();
  });

  it('a real zero average still renders as 0, not "no data"', async () => {
    oeeKpiRow = { oee_avg: '0', fpq_avg: '0.00' };
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.oeeAvgPct).toBe(0);
    expect(result.data.fpqAvgPct).toBe(0);
  });

  it('passes real averages through unchanged', async () => {
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.oeeAvgPct).toBe(80.5);
    expect(result.data.fpqAvgPct).toBe(92.1);
  });
});

describe('getAnalyticsScreen period window', () => {
  it('uses a custom from/to window instead of hard-coded 7d/30d intervals', async () => {
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(7); // oee + yield + output + waste + trend + yield-by-line + downtime
    for (const call of calls) {
      expect(call.sql).not.toContain("interval '7 days'");
      expect(call.sql).not.toContain("interval '30 days'");
      expect(call.params).toEqual([FROM, TO]);
    }
  });
});

describe('getAnalyticsScreen yield/waste parity with Reporting', () => {
  it('derives yield from work_orders.yield_percent and waste from WO-linked output+waste sums', async () => {
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.yieldAvgPct).toBe(3);
    expect(result.data.wastePct).toBe(0.17);
    expect(result.data.yieldByLine).toEqual([{ lineId: 'LINE1', yieldPct: 3 }]);

    const yieldSql = calls.find((call) => call.sql.includes('avg(wo.yield_percent)'));
    expect(yieldSql).toBeTruthy();
    expect(yieldSql!.sql).toContain("wo.status in ('completed', 'closed')");
    expect(yieldSql!.sql).not.toContain('oee_snapshots');

    const outputSql = calls.find((call) => call.sql.includes('from public.wo_outputs o'));
    const wasteSql = calls.find((call) => call.sql.includes('from public.wo_waste_log w'));
    expect(outputSql?.sql).toContain('join public.work_orders wo');
    expect(wasteSql?.sql).toContain('join public.work_orders wo');
  });
});

describe('getAnalyticsScreen waste % — mass ratio must not eat pieces (U1)', () => {
  it('200 kg + 500 pcs output with 20 kg waste → 9.09 %, NOT 2.78 %', async () => {
    outputRows = [
      { uom: 'kg', output_kg: '200.000' },
      { uom: 'pcs', output_kg: '500.000' },
    ];
    wasteRow = { waste_kg: '20.000' };

    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 20 / (200 + 20) = 9.09 %. The blind sum gave 20 / (700 + 20) = 2.78 %.
    expect(result.data.wastePct).toBe(9.09);
    // ...and the exclusion is DECLARED, never silent.
    expect(result.data.wasteBasisExcludedUoms).toEqual(['pcs']);
  });

  it('all-kg output is unchanged and declares no exclusion', async () => {
    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.wastePct).toBe(0.17);
    expect(result.data.wasteBasisExcludedUoms).toEqual([]);
  });

  it('pcs-only output with kg waste is "no data", not a fabricated 100 %', async () => {
    outputRows = [{ uom: 'pcs', output_kg: '500.000' }];
    wasteRow = { waste_kg: '20.000' };

    const result = await getAnalyticsScreen({ window: { from: FROM, to: TO } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.wastePct).toBeNull();
    expect(result.data.wasteBasisExcludedUoms).toEqual(['pcs']);
  });
});
