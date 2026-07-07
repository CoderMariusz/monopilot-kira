import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ProductionContext, type QueryClient } from '../shared';
import { startWo } from '../start-wo';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CHILD_WO_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_WO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE_ID = '44444444-4444-4444-8444-444444444444';
const BOM_HEADER_ID = '55555555-5555-4555-8555-555555555555';
const FACTORY_SPEC_ID = '66666666-6666-4666-8666-666666666666';
const SCHEDULE_OUTPUT_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
const TXN_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let queriedSql: string[];

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
      queriedSql.push(sql);
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('from public.work_orders') && q.startsWith('select')) {
        return {
          rows: [
            {
              id: CHILD_WO_ID,
              site_id: SITE_ID,
              active_bom_header_id: BOM_HEADER_ID,
              active_factory_spec_id: FACTORY_SPEC_ID,
              allergen_profile_snapshot: null,
              production_line_id: null,
            },
          ],
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
      if (q.includes('from public.changeover_events')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.schedule_outputs')) {
        return {
          rows: [{
            id: SCHEDULE_OUTPUT_ID,
            product_id: PRODUCT_ID,
            output_role: 'primary',
            expected_qty: '100',
            uom: 'kg',
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.wo_outputs')) {
        return { rows: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0, params };
    }),
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

describe('startWo overlap — no wo_dependencies parent-status gate', () => {
  beforeEach(() => {
    queriedSql = [];
    client = makeClient();
  });

  it('starts a child WO without querying wo_dependencies or parent WO status', async () => {
    const result = await startWo(makeCtx(), { woId: CHILD_WO_ID, transactionId: TXN_ID });

    expect(result.ok).toBe(true);
    expect(queriedSql.some((sql) => normalize(sql).includes('wo_dependencies'))).toBe(false);
    expect(queriedSql.some((sql) => normalize(sql).includes('parent_wo_id'))).toBe(false);
    expect(queriedSql.some((sql) => normalize(sql).includes(String(PARENT_WO_ID)))).toBe(false);
  });
});
