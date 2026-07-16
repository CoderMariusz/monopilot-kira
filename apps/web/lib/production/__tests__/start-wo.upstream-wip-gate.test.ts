import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ProductionContext, type QueryClient } from '../shared';
import { startWo } from '../start-wo';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_WO_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '44444444-4444-4444-8444-444444444444';
const BOM_HEADER_ID = '55555555-5555-4555-8555-555555555555';
const FACTORY_SPEC_ID = '66666666-6666-4666-8666-666666666666';
const TXN_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let upstreamBlockers: Array<{ child_wo_number: string; child_status: string }>;

vi.mock('../../technical/bom/snapshot', () => ({
  createBomSnapshot: vi.fn(async () => ({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })),
}));

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: { startedAt: '2026-07-07T12:00:00.000Z' },
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('from public.work_orders') && q.startsWith('select')) {
        return {
          rows: [{
            id: FG_WO_ID,
            site_id: SITE_ID,
            item_type_at_creation: 'fg',
            active_bom_header_id: BOM_HEADER_ID,
            active_factory_spec_id: FACTORY_SPEC_ID,
            allergen_profile_snapshot: null,
            production_line_id: null,
          }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.bom_headers') || q.includes('from public.factory_specs')) {
        return {
          rows: [{
            bom_exists: true,
            spec_exists: true,
            spec_site_id: SITE_ID,
            spec_bom_header_id: BOM_HEADER_ID,
          }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.wo_dependencies')) {
        return {
          rows: upstreamBlockers.map((b, i) => ({
            child_wo_id: `child-${i}`,
            child_wo_number: b.child_wo_number,
            child_status: b.child_status,
            required_qty: '100',
            posted_output_kg: '0',
            release_blocked: b.child_status.toUpperCase() === 'DRAFT',
            start_complete_blocked: true,
          })),
          rowCount: upstreamBlockers.length,
        };
      }
      if (q.includes('from public.changeover_events')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

describe('startWo upstream WIP gate (C3)', () => {
  beforeEach(() => {
    upstreamBlockers = [{ child_wo_number: 'WIP-CHILD', child_status: 'DRAFT' }];
    client = makeClient();
  });

  it('rejects start when an upstream WIP prerequisite is still DRAFT', async () => {
    const result = await startWo(makeCtx(), { woId: FG_WO_ID, transactionId: TXN_ID });

    expect(result).toMatchObject({
      ok: false,
      error: 'upstream_wip_not_ready',
      message: expect.stringContaining('WIP-CHILD'),
    });
  });
});
