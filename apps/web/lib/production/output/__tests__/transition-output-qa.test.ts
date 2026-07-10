import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext, QueryClient } from '../../shared';
import {
  applyWoOutputHoldForContext,
  restoreWoOutputsAfterWoHoldReleaseForContext,
  transitionWoOutputQaForContext,
} from '../transition-output-qa';

const OUTPUT_ID = '33333333-3333-4333-8333-333333333333';
const OUTPUT_ID_2 = '33333333-3333-4333-8333-333333333334';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const WO_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

let client: QueryClient;
let outputQaStatus = 'PENDING';
let lpQaStatus = 'pending';
let lpStatus = 'received';
let activeHold = false;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);

      if (normalized.startsWith('select id::text, qa_status, lp_id::text from public.wo_outputs')) {
        return {
          rows: [{ id: OUTPUT_ID, qa_status: outputQaStatus, lp_id: LP_ID }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('update public.wo_outputs')) {
        outputQaStatus = String(params?.[1] ?? outputQaStatus);
        return {
          rows: [{ id: OUTPUT_ID, qa_status: params?.[1], lp_id: LP_ID }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('select id::text, status, qa_status from public.license_plates')) {
        return {
          rows: [{ id: LP_ID, status: lpStatus, qa_status: lpQaStatus }],
          rowCount: 1,
        };
      }

      if (normalized.includes('with target_lp as') && normalized.includes('from public.v_active_holds')) {
        return {
          rows: activeHold ? [{ hold_number: 'HLD-0001', priority: 'critical' }] : [],
          rowCount: activeHold ? 1 : 0,
        };
      }

      if (normalized.startsWith('update public.license_plates')) {
        lpQaStatus = String(params?.[1] ?? lpQaStatus);
        if (lpStatus === 'received') {
          lpStatus = lpQaStatus === 'released' ? 'available' : lpQaStatus === 'rejected' ? 'blocked' : lpStatus;
        }
        return { rows: [{ status: lpStatus }], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('transitionWoOutputQaForContext — Wave 9 Bug 3', () => {
  beforeEach(() => {
    outputQaStatus = 'PENDING';
    lpQaStatus = 'pending';
    lpStatus = 'received';
    activeHold = false;
    client = makeClient();
  });

  it('atomically moves wo_outputs.qa_status to PASSED and releases the linked LP', async () => {
    const result = await transitionWoOutputQaForContext(makeCtx(), {
      outputId: OUTPUT_ID,
      decision: 'PASSED',
      note: 'inspection pass',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      outputId: OUTPUT_ID,
      qaStatus: 'PASSED',
      lpId: LP_ID,
      lpQaStatus: 'released',
    });
    expect(outputQaStatus).toBe('PASSED');
    expect(lpQaStatus).toBe('released');

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.wo_outputs'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(true);
  });

  it('returns quality_hold_active without committing PASSED while the LP remains on hold', async () => {
    activeHold = true;

    const result = await transitionWoOutputQaForContext(makeCtx(), {
      outputId: OUTPUT_ID,
      decision: 'PASSED',
    });

    expect(result).toEqual({ ok: false, reason: 'quality_hold_active' });
    expect(outputQaStatus).toBe('PENDING');
    expect(lpQaStatus).toBe('pending');

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.some((sql) => sql.startsWith('update public.wo_outputs'))).toBe(false);
    expect(calls.some((sql) => sql.startsWith('update public.license_plates'))).toBe(false);
  });
});

describe('production-owned WO hold QA transitions', () => {
  it('snapshots and applies ON_HOLD through applyWoOutputHoldForContext', async () => {
    const holdClient: QueryClient = {
      query: vi.fn(async (sql: string) => {
        const normalized = normalize(sql);
        if (normalized.includes('from public.wo_outputs') && normalized.includes('for update')) {
          return {
            rows: [
              { id: OUTPUT_ID, qa_status: 'PENDING' },
              { id: OUTPUT_ID_2, qa_status: 'PASSED' },
            ],
            rowCount: 2,
          };
        }
        if (normalized.startsWith('update public.wo_outputs') && normalized.includes("'on_hold'")) {
          return { rows: [], rowCount: 2 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const snapshots = await applyWoOutputHoldForContext(
      { userId: USER_ID, orgId: ORG_ID, client: holdClient },
      WO_ID,
    );

    expect(snapshots).toEqual({
      [OUTPUT_ID]: 'PENDING',
      [OUTPUT_ID_2]: 'PASSED',
    });
    expect(vi.mocked(holdClient.query).mock.calls.some(([sql]) => normalize(String(sql)).includes("'on_hold'"))).toBe(
      true,
    );
  });

  it('restores snapshots then defaults remaining ON_HOLD outputs to PENDING', async () => {
    const restoreClient: QueryClient = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        const normalized = normalize(sql);
        if (normalized.includes("and qa_status = 'on_hold'") && normalized.includes('and id = $1::uuid')) {
          return { rows: [{ id: params?.[0] }], rowCount: 1 };
        }
        if (normalized.includes("set qa_status = 'pending'") && normalized.includes("and qa_status = 'on_hold'")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await restoreWoOutputsAfterWoHoldReleaseForContext(
      { userId: USER_ID, orgId: ORG_ID, client: restoreClient },
      { woId: WO_ID, snapshots: { [OUTPUT_ID]: 'PENDING', [OUTPUT_ID_2]: 'PASSED' } },
    );

    const calls = vi.mocked(restoreClient.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.filter((sql) => sql.includes('and id = $1::uuid')).length).toBe(2);
    expect(calls.some((sql) => sql.includes("set qa_status = 'pending'"))).toBe(true);
  });
});
