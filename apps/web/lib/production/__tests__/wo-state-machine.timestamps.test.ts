import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext, QueryClient } from '../shared';
import { applyTransition } from '../wo-state-machine';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const EXEC_ID = '44444444-4444-4444-8444-444444444444';
const TXN_ID = '55555555-5555-4555-8555-555555555555';

let queries: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: async <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.wo_events') && q.startsWith('select')) {
        return { rows: [] as T[] };
      }
      if (q.includes('from public.work_orders') && q.startsWith('select id')) {
        return { rows: [{ id: WO_ID }] as T[] };
      }
      if (q.includes('from public.wo_executions') && q.startsWith('select')) {
        return {
          rows: [{
            id: EXEC_ID,
            wo_id: WO_ID,
            status: 'planned',
            version: 0,
            started_at: null,
            paused_at: null,
            resumed_at: null,
            completed_at: null,
            closed_at: null,
            cancelled_at: null,
          }] as T[],
        };
      }
      if (q.startsWith('insert into public.wo_events')) {
        return { rows: [] as T[] };
      }
      if (q.startsWith('update public.wo_executions')) {
        return {
          rows: [{
            id: EXEC_ID,
            wo_id: WO_ID,
            status: 'in_progress',
            version: 1,
            started_at: '2026-07-12T10:00:00.000Z',
            paused_at: null,
            resumed_at: null,
            completed_at: null,
            closed_at: null,
            cancelled_at: null,
          }] as T[],
        };
      }
      if (q.startsWith('update public.work_orders')) {
        return { rows: [] as T[] };
      }
      throw new Error(`unexpected query: ${q}`);
    },
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
}

describe('wo_state_machine work_orders timestamps (S8)', () => {
  beforeEach(() => {
    queries = [];
  });

  it('sets work_orders.started_at in the same transaction as the start transition', async () => {
    const result = await applyTransition(makeCtx(), {
      woId: WO_ID,
      verb: 'start',
      transactionId: TXN_ID,
    });

    expect(result.ok).toBe(true);
    const woUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.work_orders'));
    expect(woUpdate).toBeDefined();
    expect(normalize(woUpdate!.sql)).toContain('started_at = pg_catalog.now()');
    expect(normalize(woUpdate!.sql)).toContain("status = $2");
    expect(woUpdate!.params).toContain('IN_PROGRESS');
  });

  it('sets work_orders.completed_at in the same transaction as the complete transition', async () => {
    const client = makeClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      const q = normalize(sql);
      if (q.includes('from public.wo_executions') && q.startsWith('select')) {
        return {
          rows: [{
            id: EXEC_ID,
            wo_id: WO_ID,
            status: 'in_progress',
            version: 2,
            started_at: '2026-07-12T08:00:00.000Z',
            paused_at: null,
            resumed_at: null,
            completed_at: null,
            closed_at: null,
            cancelled_at: null,
          }],
        };
      }
      if (q.startsWith('update public.wo_executions')) {
        return {
          rows: [{
            id: EXEC_ID,
            wo_id: WO_ID,
            status: 'completed',
            version: 3,
            started_at: '2026-07-12T08:00:00.000Z',
            paused_at: null,
            resumed_at: null,
            completed_at: '2026-07-12T10:00:00.000Z',
            closed_at: null,
            cancelled_at: null,
          }],
        };
      }
      return originalQuery(sql, params);
    };

    const result = await applyTransition(
      { userId: USER_ID, orgId: ORG_ID, client },
      { woId: WO_ID, verb: 'complete', transactionId: TXN_ID },
    );

    expect(result.ok).toBe(true);
    const woUpdate = queries.find(
      (q) => normalize(q.sql).startsWith('update public.work_orders') && normalize(q.sql).includes('completed_at'),
    );
    expect(woUpdate).toBeDefined();
    expect(woUpdate!.params).toContain('COMPLETED');
  });

  it('treats wo_events_transaction_id_unique replay as idempotent success', async () => {
    const client = makeClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      const q = normalize(sql);
      if (q.startsWith('insert into public.wo_events')) {
        const err = Object.assign(new Error('duplicate transaction_id'), {
          code: '23505',
          constraint: 'wo_events_transaction_id_unique',
        });
        throw err;
      }
      return originalQuery(sql, params);
    };

    const result = await applyTransition({ userId: USER_ID, orgId: ORG_ID, client }, {
      woId: WO_ID,
      verb: 'start',
      transactionId: TXN_ID,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.status).toBe('planned');
  });

  it('throws on non-replay 23505 after wo_events insert (no false idempotent success)', async () => {
    const client = makeClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      const q = normalize(sql);
      if (q.startsWith('update public.work_orders')) {
        const err = Object.assign(new Error('duplicate work order key'), {
          code: '23505',
          constraint: 'work_orders_pkey',
        });
        throw err;
      }
      return originalQuery(sql, params);
    };

    await expect(
      applyTransition({ userId: USER_ID, orgId: ORG_ID, client }, {
        woId: WO_ID,
        verb: 'start',
        transactionId: TXN_ID,
      }),
    ).rejects.toMatchObject({ code: '23505', constraint: 'work_orders_pkey' });
  });

  it('throws after wo_events insert when work_orders mirroring fails (no partial commit)', async () => {
    const client = makeClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      const q = normalize(sql);
      if (q.startsWith('update public.work_orders')) {
        throw new Error('work_orders mirror failed');
      }
      return originalQuery(sql, params);
    };

    await expect(
      applyTransition({ userId: USER_ID, orgId: ORG_ID, client }, {
        woId: WO_ID,
        verb: 'start',
        transactionId: TXN_ID,
      }),
    ).rejects.toThrow('work_orders mirror failed');
  });
});
