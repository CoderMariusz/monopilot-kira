import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelWo } from '../complete-cancel-wo';
import type { ProductionContext, QueryClient } from '../shared';
import { applyTransition } from '../wo-state-machine';

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: {
      woId: '33333333-3333-4333-8333-333333333333',
      status: 'cancelled',
      startedAt: '2026-06-12T08:00:00.000Z',
      completedAt: '2026-06-12T10:00:00.000Z',
      cancelledAt: '2026-06-12T11:00:00.000Z',
    },
  })),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const TX_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const SITE_ID = '66666666-6666-4666-8666-666666666666';

type QueryCall = { sql: string; params: readonly unknown[] };

let queries: QueryCall[];
let executionStatus: 'completed' | 'in_progress';

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

      if (normalized.startsWith('select lp.id') && normalized.includes('from public.license_plates lp')) {
        const rows =
          executionStatus === 'completed'
            ? [{ id: LP_ID, site_id: SITE_ID, status: 'available' }]
            : [];
        return { rows: rows as T[], rowCount: rows.length };
      }

      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.license_plates')) {
        return { rows: [] as T[], rowCount: 1 };
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

describe('cancelWo completed-output LP handling', () => {
  beforeEach(() => {
    queries = [];
    executionStatus = 'completed';
    vi.clearAllMocks();
  });

  it('voids production output LPs when cancelling a completed WO', async () => {
    const result = await cancelWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCode: 'planner_cancel',
      notes: 'planner cancelled after completion',
    });

    expect(result.ok).toBe(true);
    expect(applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ woId: WO_ID, verb: 'cancel', transactionId: TX_ID }),
    );

    const lpSelect = queries.find((query) => normalize(query.sql).startsWith('select lp.id'));
    expect(lpSelect).toBeDefined();
    expect(normalize(lpSelect!.sql)).toContain("lp.status not in ('destroyed', 'consumed')");
    expect(normalize(lpSelect!.sql)).toContain('from public.wo_outputs o');
    expect(normalize(lpSelect!.sql)).toContain('o.lp_id = lp.id');
    expect(normalize(lpSelect!.sql)).toContain('o.correction_of_id is null');
    expect(lpSelect!.params).toEqual([WO_ID]);

    const history = queries.find((query) => normalize(query.sql).startsWith('insert into public.lp_state_history'));
    expect(history).toBeDefined();
    expect(normalize(history!.sql)).toContain('from_state');
    expect(normalize(history!.sql)).toContain('to_state');
    expect(normalize(history!.sql)).toContain("'destroyed'");
    expect(normalize(history!.sql)).toContain("'wo_cancelled'");
    expect(normalize(history!.sql)).toContain('wo_id');
    expect(normalize(history!.sql)).toContain('created_by');
    expect(history!.params).toEqual([
      SITE_ID,
      LP_ID,
      'available',
      'planner cancelled after completion',
      WO_ID,
      expect.any(String),
      JSON.stringify({
        cancellation_reason_code: 'planner_cancel',
        transaction_id: TX_ID,
      }),
      USER_ID,
    ]);

    const lpUpdate = queries.find((query) => normalize(query.sql).startsWith('update public.license_plates'));
    expect(lpUpdate).toBeDefined();
    expect(normalize(lpUpdate!.sql)).toContain("set status = 'destroyed'");
    expect(normalize(lpUpdate!.sql)).toContain('quantity = 0');
    expect(normalize(lpUpdate!.sql)).toContain('reserved_qty = 0');
    expect(lpUpdate!.params).toEqual([[LP_ID], USER_ID]);

    const outbox = queries.find((query) => normalize(query.sql).startsWith('insert into public.outbox_events'));
    expect(outbox).toBeDefined();
    expect(JSON.parse(String(outbox!.params[3]))).toMatchObject({
      woId: WO_ID,
      reasonCode: 'planner_cancel',
      voidedOutputLpIds: [LP_ID],
    });
  });

  it('leaves LPs untouched when cancelling before completion', async () => {
    executionStatus = 'in_progress';

    const result = await cancelWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCode: 'planner_cancel',
    });

    expect(result.ok).toBe(true);
    expect(queries.some((query) => normalize(query.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((query) => normalize(query.sql).startsWith('insert into public.lp_state_history'))).toBe(false);
  });
});
