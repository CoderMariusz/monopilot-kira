import { describe, expect, it, vi } from 'vitest';

import { evaluateClosedProductionStrict } from '../../../../../../lib/production/evaluate-closed-production-strict';
import {
  recordWoCompletionSnapshot,
  type WoCompletionSnapshotResult,
} from '../../../../../../lib/production/oee-snapshot-producer';
import type {
  ProductionContext,
  QueryClient,
} from '../../../../../../lib/production/shared';

const WO_ID = '11111111-1111-4111-8111-111111111111';
const STARTED_AT = '2026-07-30T08:00:00.000Z';
const COMPLETED_AT = '2026-07-30T10:00:42.123Z';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('consumption UoM conversion SQL (PRD-039)', () => {
  it('covers every kg conversion branch and excludes unknown units from the sum', async () => {
    let capturedSql = '';
    const client: QueryClient = {
      query: vi.fn(async (sql: string) => {
        capturedSql = normalize(sql);
        return {
          rows: [
            {
              output_kg: '10',
              posted_consumption_kg: '8',
              effective_yield_pct: '80',
              expected_input_kg: '12.5',
              within_tolerance: true,
            },
          ],
        };
      }),
    } as QueryClient;

    await evaluateClosedProductionStrict(client, WO_ID);

    expect(capturedSql).toContain("when lower(c.uom) = 'kg' then c.qty_consumed::numeric");
    expect(capturedSql).toContain("lower(c.uom) in ('each', 'pcs', 'szt', 'ea')");
    expect(capturedSql).toContain(
      'c.qty_consumed::numeric * i.each_per_box::numeric * i.net_qty_per_each',
    );
    expect(capturedSql).toContain(
      "uom_mass.factor_to_base is not null and uom_mass.category = 'mass'",
    );
    expect(capturedSql).toContain(
      'c.qty_consumed::numeric * uom_mass.factor_to_base',
    );
    expect(capturedSql).toContain(
      "when lower(c.uom) = 'lb' then c.qty_consumed::numeric * 0.45359237",
    );
    expect(capturedSql).toContain('else null');
    expect(capturedSql).toContain('where conv.row_kg is not null');
    expect(capturedSql).not.toMatch(/else\s+c\.qty_consumed/);
  });
});

type SnapshotScript = {
  outputs?: { good_kg: string; rejected_kg: string };
  waste?: string;
  insertRows?: Array<{ id: string }>;
};

function makeSnapshotCtx(script: SnapshotScript = {}): {
  ctx: ProductionContext;
  calls: Array<{ sql: string; params: readonly unknown[] }>;
} {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client: QueryClient = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const query = normalize(sql);
      if (query.includes('from public.work_orders')) {
        return { rows: [{ line_id: 'line-1', site_id: null }] };
      }
      if (query.includes('shift_id is not null')) return { rows: [] };
      if (query.includes('from public.downtime_events')) return { rows: [] };
      if (query.includes('from public.wo_operations')) {
        return { rows: [{ expected_min: 120 }] };
      }
      if (query.includes('from public.wo_outputs')) {
        return { rows: [script.outputs ?? { good_kg: '90.000', rejected_kg: '5.000' }] };
      }
      if (query.includes('from public.wo_waste_log')) {
        return { rows: [{ waste_kg: script.waste ?? '5.000' }] };
      }
      if (query.startsWith('insert into public.oee_snapshots')) {
        return { rows: script.insertRows ?? [{ id: 'snapshot-1' }] };
      }
      throw new Error(`unexpected query: ${query}`);
    }),
  } as QueryClient;
  return {
    ctx: {
      userId: '22222222-2222-4222-8222-222222222222',
      orgId: '33333333-3333-4333-8333-333333333333',
      client,
    },
    calls,
  };
}

async function record(
  script: SnapshotScript = {},
): Promise<{
  result: WoCompletionSnapshotResult;
  calls: Array<{ sql: string; params: readonly unknown[] }>;
}> {
  const { ctx, calls } = makeSnapshotCtx(script);
  const result = await recordWoCompletionSnapshot(ctx, {
    woId: WO_ID,
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
  });
  return { result, calls };
}

describe('completion OEE snapshot grain and replay (PRD-106)', () => {
  it('binds completed_at to minute truncation and writes the required grain once', async () => {
    const { result, calls } = await record();

    expect(result).toEqual({ recorded: true, snapshotId: 'snapshot-1' });
    const insert = calls.find((call) =>
      normalize(call.sql).startsWith('insert into public.oee_snapshots'),
    );
    const sql = normalize(insert?.sql ?? '');
    expect(sql).toContain(
      '(org_id, site_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct, active_wo_id',
    );
    expect(sql).toContain("date_trunc('minute', $4::timestamptz)");
    expect(insert?.params[3]).toBe(COMPLETED_AT);
    expect(sql).toContain('where org_id = app.current_org_id() and active_wo_id = $8::uuid');
    expect(sql).toContain('on conflict do nothing');
  });

  it('returns a no-op when the per-WO/grain insert affects no row', async () => {
    const { result } = await record({ insertRows: [] });

    expect(result).toEqual({
      recorded: false,
      reason: 'duplicate_or_grain_conflict',
    });
  });
});

describe('quality source classification and honest NULL (PRD-109)', () => {
  it('classifies non-FAILED as good, FAILED as rejected, and includes waste', async () => {
    const { result, calls } = await record({
      outputs: { good_kg: '90.000', rejected_kg: '5.000' },
      waste: '5.000',
    });

    expect(result.recorded).toBe(true);
    const source = calls.find((call) =>
      normalize(call.sql).includes('from public.wo_outputs'),
    );
    expect(normalize(source?.sql ?? '')).toContain(
      "sum(qty_kg) filter (where qa_status <> 'failed')",
    );
    expect(normalize(source?.sql ?? '')).toContain(
      "sum(qty_kg) filter (where qa_status = 'failed')",
    );
    const insert = calls.find((call) =>
      normalize(call.sql).startsWith('insert into public.oee_snapshots'),
    );
    expect(insert?.params[6]).toBe('90.00');
    expect(insert?.params[10]).toBe('5.000');
  });

  it('persists quality_pct as NULL when outputs and waste are all zero', async () => {
    const { calls } = await record({
      outputs: { good_kg: '0', rejected_kg: '0' },
      waste: '0',
    });

    const insert = calls.find((call) =>
      normalize(call.sql).startsWith('insert into public.oee_snapshots'),
    );
    expect(insert?.params[6]).toBeNull();
  });
});
