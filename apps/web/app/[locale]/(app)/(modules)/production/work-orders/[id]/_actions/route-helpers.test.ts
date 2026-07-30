import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  QualityHoldError,
  type ProductionResult,
} from '../../../../../../../../lib/production/shared';

const withOrgContextMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (...args: unknown[]) => withOrgContextMock(...args),
}));

import { formatProductionFailureBody, runTransition, toResponse } from './route-helpers';

const WO_ID = '11111111-1111-4111-8111-111111111111';
const LP_ID = '22222222-2222-4222-8222-222222222222';
const HOLD_ID = '33333333-3333-4333-8333-333333333333';
const TX_ID = '44444444-4444-4444-8444-444444444444';
let queryCalls: Array<{ sql: string; params: readonly unknown[] }>;

beforeEach(() => {
  queryCalls = [];
  withOrgContextMock.mockReset();
  withOrgContextMock.mockImplementation(
    async (
      action: (ctx: {
        userId: string;
        orgId: string;
        client: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: [] }> };
      }) => Promise<unknown>,
    ) =>
      action({
        userId: '55555555-5555-4555-8555-555555555555',
        orgId: '66666666-6666-4666-8666-666666666666',
        client: {
          query: async (sql: string, params: readonly unknown[] = []) => {
            queryCalls.push({ sql, params });
            return { rows: [] };
          },
        },
      }),
  );
});

describe('formatProductionFailureBody (C078)', () => {
  it('backfills upstream_wip_not_ready message from blocker details when message is omitted', () => {
    const result: ProductionResult<void> = {
      ok: false,
      error: 'upstream_wip_not_ready',
      status: 409,
      details: {
        code: 'upstream_wip_not_ready',
        mode: 'start',
        blockers: [
          {
            child_wo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            child_wo_number: 'WO-202607-0026-W1',
            child_status: 'RELEASED',
            required_qty: '1260',
            posted_output_kg: '0',
            release_blocked: false,
            start_complete_blocked: true,
          },
        ],
      },
    };

    const body = formatProductionFailureBody(result);

    expect(body).toMatchObject({
      ok: false,
      error: 'upstream_wip_not_ready',
      message: expect.stringContaining('WO-202607-0026-W1'),
    });
    expect(body.message).toContain('finish producing required output');
  });

  it('preserves an explicit upstream_wip_not_ready message from the service', () => {
    const explicit =
      'Upstream WIP work order(s) must finish producing required output before this order can proceed: WO-CHILD.';
    const result: ProductionResult<void> = {
      ok: false,
      error: 'upstream_wip_not_ready',
      status: 409,
      message: explicit,
      details: {
        code: 'upstream_wip_not_ready',
        mode: 'start',
        blockers: [],
      },
    };

    expect(formatProductionFailureBody(result).message).toBe(explicit);
  });
});

describe('toResponse', () => {
  it('serializes upstream_wip_not_ready with a precise operator message', async () => {
    const response = toResponse({
      ok: false,
      error: 'upstream_wip_not_ready',
      status: 409,
      details: {
        code: 'upstream_wip_not_ready',
        mode: 'start',
        blockers: [
          {
            child_wo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            child_wo_number: 'WO-ROOT-W1',
            child_status: 'IN_PROGRESS',
            required_qty: '100',
            posted_output_kg: '10',
            release_blocked: false,
            start_complete_blocked: true,
          },
        ],
      },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'upstream_wip_not_ready',
      message: expect.stringContaining('WO-ROOT-W1'),
    });
  });
});

describe('runTransition quality-hold completion contract (PRD-019)', () => {
  const schema = z.object({ transactionId: z.string().uuid() });

  it('returns the output-LP hold body and commits production.consume.blocked on a fresh context', async () => {
    const response = await runTransition(
      new Request('http://test.local/complete', {
        method: 'POST',
        body: JSON.stringify({ transactionId: TX_ID }),
      }),
      schema,
      async () => {
        throw new QualityHoldError({
          hold: { holdId: HOLD_ID, lpId: LP_ID, lotId: null },
          woId: WO_ID,
          blockedPath: 'complete',
          transactionId: TX_ID,
          lpId: LP_ID,
          lotId: null,
        });
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'quality_hold_active',
      details: { holdId: HOLD_ID, lpId: LP_ID },
    });
    expect(withOrgContextMock).toHaveBeenCalledTimes(2);
    const blocked = queryCalls.find((call) =>
      call.sql.replace(/\s+/g, ' ').includes('insert into public.outbox_events'),
    );
    expect(blocked?.params[0]).toBe('production.consume.blocked');
    expect(String(blocked?.params[3])).toContain(`"hold_id":"${HOLD_ID}"`);
    expect(String(blocked?.params[3])).toContain(`"lp_id":"${LP_ID}"`);
    expect(blocked?.params[5]).toBe(`production.consume.blocked:${TX_ID}`);
  });

  it('does not emit a blocked event when completion succeeds', async () => {
    const response = await runTransition(
      new Request('http://test.local/complete', {
        method: 'POST',
        body: JSON.stringify({ transactionId: TX_ID }),
      }),
      schema,
      async () => ({ ok: true as const, data: { status: 'completed' } }),
    );

    expect(response.status).toBe(200);
    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    expect(queryCalls).toHaveLength(0);
  });
});
