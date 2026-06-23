import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext, QueryClient } from '../shared';

vi.mock('../holds-guard', () => ({
  holdsGuard: vi.fn(async () => null),
}));

vi.mock('../oee-snapshot-producer', () => ({
  recordWoCompletionSnapshot: vi.fn(async () => undefined),
}));

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: {
      startedAt: '2026-06-12T08:00:00.000Z',
      completedAt: '2026-06-12T10:00:00.000Z',
    },
  })),
}));

import { holdsGuard } from '../holds-guard';
import { completeWo } from '../complete-cancel-wo';
import { recordWoCompletionSnapshot } from '../oee-snapshot-producer';
import { applyTransition } from '../wo-state-machine';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const OUTPUT_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const TX_ID = '66666666-6666-4666-8666-666666666666';

type QueryCall = { sql: string; params: readonly unknown[] };

let queries: QueryCall[];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function activePrimaryVisibleTo(sql: string): boolean {
  const normalized = normalize(sql);
  expect(normalized).toContain('o.correction_of_id is null');

  // The ledger shape is one positive original plus one counter-entry pointing
  // back to it. The original is only excluded when the query anti-joins the
  // correction row.
  return !normalized.includes('correction.correction_of_id = o.id');
}

function makeClient(): QueryClient {
  return {
    query: async <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('select o.id') && normalized.includes('from public.wo_outputs o')) {
        const rows = activePrimaryVisibleTo(sql)
          ? [{ id: OUTPUT_ID, output_type: 'primary', lp_id: LP_ID }]
          : [];
        return { rows: rows as T[], rowCount: rows.length };
      }

      if (normalized.startsWith('select exists') && normalized.includes('from public.wo_outputs o')) {
        return { rows: [{ green: activePrimaryVisibleTo(sql) }] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [] as T[], rowCount: 1 };
      }

      throw new Error(`unexpected query: ${normalized}`);
    },
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
}

describe('completeWo yield gate', () => {
  beforeEach(() => {
    queries = [];
    vi.clearAllMocks();
  });

  it('fails when the only primary output is voided by a correction counter-entry', async () => {
    const result = await completeWo(makeCtx(), { woId: WO_ID, transactionId: TX_ID });

    expect(result).toMatchObject({
      ok: false,
      error: 'closed_production_strict_failed',
      details: {
        code: 'output_yield_gate_failed',
        outputsRegistered: 0,
      },
    });

    const outputQueries = queries.filter((q) => normalize(q.sql).includes('from public.wo_outputs'));
    expect(outputQueries).toHaveLength(2);
    for (const query of outputQueries) {
      const normalized = normalize(query.sql);
      expect(normalized).toContain('o.correction_of_id is null');
      expect(normalized).toContain('correction.correction_of_id = o.id');
    }

    expect(holdsGuard).not.toHaveBeenCalled();
    expect(applyTransition).not.toHaveBeenCalled();
    expect(recordWoCompletionSnapshot).not.toHaveBeenCalled();
  });
});
