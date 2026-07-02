import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelWo } from '../complete-cancel-wo';
import type { ProductionContext, QueryClient } from '../shared';
import { applyTransition } from '../wo-state-machine';

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: {
      cancelledAt: '2026-06-12T11:00:00.000Z',
    },
  })),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const TX_ID = '44444444-4444-4444-8444-444444444444';

type QueryCall = { sql: string; params: readonly unknown[] };

let queries: QueryCall[];
let executionStatus: 'in_progress' | 'paused' | 'completed';
let liveOutputs: Array<{ lp_number: string; qty: string }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: async <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.wo_executions')) {
        return { rows: [{ status: executionStatus }] as T[], rowCount: 1 };
      }
      if (normalized.includes('lp.lp_number') && normalized.includes('from public.wo_outputs o')) {
        return { rows: liveOutputs as T[], rowCount: liveOutputs.length };
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

describe('cancelWo live output LP guard', () => {
  beforeEach(() => {
    queries = [];
    executionStatus = 'in_progress';
    liveOutputs = [];
    vi.clearAllMocks();
  });

  it('blocks cancel when live output LPs remain on an in_progress WO', async () => {
    liveOutputs = [{ lp_number: 'LP-OUT-001', qty: '25.000' }];

    const result = await cancelWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCode: 'planner_cancel',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_state',
      details: {
        code: 'live_output_lps_present',
        outputs: [{ lp_number: 'LP-OUT-001', qty: '25.000' }],
      },
    });
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('allows cancel when no live output LPs remain on a paused WO', async () => {
    executionStatus = 'paused';

    const result = await cancelWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCode: 'planner_cancel',
    });

    expect(result.ok).toBe(true);
    expect(applyTransition).toHaveBeenCalled();
  });
});
