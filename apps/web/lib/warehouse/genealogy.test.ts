import { describe, expect, it } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../production/shared';
import { registerOutput } from '../production/output/register-output';
import { queryGenealogy, type GenealogyQueryClient } from './genealogy';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';
const OUTPUT_ID = '66666666-6666-4666-8666-666666666666';
const WAREHOUSE_ID = '77777777-7777-4777-8777-777777777777';
const LOCATION_ID = '88888888-8888-4888-8888-888888888888';
const OUTPUT_LP_ID = '99999999-9999-4999-8999-999999999999';
const SITE_ID = 'site-001';
const PARENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PARENT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEGACY_PARENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type QueryCall = { sql: string; params: readonly unknown[] };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeCtx(client: QueryClient): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function makeRegisterClient(consumedLpIds: string[]): QueryClient & { calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = normalize(sql);

      if (normalized.includes('from public.work_orders')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (normalized.includes('from public.items')) {
        return {
          rows: [
            {
              id: PRODUCT_ID,
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.wo_executions')) {
        return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_outputs')) {
        return { rows: [{ id: OUTPUT_ID, lp_id: null, expiry_date: null }], rowCount: 1 };
      }
      if (normalized.includes('from public.warehouses')) {
        expect(params).toEqual([SITE_ID]);
        return { rows: [{ id: WAREHOUSE_ID, default_location_id: LOCATION_ID }], rowCount: 1 };
      }
      if (normalized.includes('from public.wo_material_consumption')) {
        return { rows: consumedLpIds.map((lp_id) => ({ lp_id })), rowCount: consumedLpIds.length };
      }
      if (normalized.startsWith('insert into public.license_plates')) {
        return { rows: [{ id: OUTPUT_LP_ID }], rowCount: 1 };
      }
      if (
        normalized.startsWith('insert into public.lp_genealogy') ||
        normalized.startsWith('insert into public.lp_state_history') ||
        normalized.startsWith('insert into public.outbox_events') ||
        normalized.startsWith('update public.wo_outputs')
      ) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function genealogyRow(id: string, lpNumber: string, depth: number, parentLpId: string | null) {
  return {
    lp_id: id,
    lp_number: lpNumber,
    item_code: null,
    quantity: '1.000000',
    uom: 'kg',
    status: 'available',
    created_at: '2026-06-23T00:00:00.000Z',
    depth,
    direction: depth === 0 ? 'self' : 'ancestor',
    parent_lp_id: parentLpId,
  };
}

describe('LP genealogy junction integration points', () => {
  it('registerOutput writes all consumed LPs to lp_genealogy and keeps parent_lp_id as the first consumed LP', async () => {
    const client = makeRegisterClient([PARENT_A, PARENT_B, PARENT_C]);

    await registerOutput(makeCtx(client), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '12.500',
    });

    const lpInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.license_plates'));
    expect(lpInsert?.params[10]).toBe(PARENT_A);

    const genealogyInserts = client.calls.filter((call) =>
      normalize(call.sql).startsWith('insert into public.lp_genealogy'),
    );
    expect(genealogyInserts).toHaveLength(3);
    expect(genealogyInserts.map((call) => call.params.slice(0, 2))).toEqual([
      [OUTPUT_LP_ID, PARENT_A],
      [OUTPUT_LP_ID, PARENT_B],
      [OUTPUT_LP_ID, PARENT_C],
    ]);
    for (const call of genealogyInserts) {
      expect(normalize(call.sql)).toContain("'consumed'");
      expect(call.params[2]).toBe('12.500');
      expect(call.params[3]).toBe('kg');
    }
  });

  it('queryGenealogy returns all parent nodes from lp_genealogy junction rows', async () => {
    const client: GenealogyQueryClient = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        const normalized = normalize(sql);
        expect(params).toEqual([OUTPUT_LP_ID]);
        expect(normalized).toContain('from public.lp_genealogy lg');
        expect(normalized).toContain('lg.child_lp_id = current.id');
        expect(normalized).toContain('lg.parent_lp_id = current.id');
        return {
          rows: [
            genealogyRow(PARENT_A, 'LP-PARENT-A', 1, null),
            genealogyRow(PARENT_B, 'LP-PARENT-B', 1, null),
            genealogyRow(PARENT_C, 'LP-PARENT-C', 1, null),
            genealogyRow(OUTPUT_LP_ID, 'LP-OUTPUT', 0, PARENT_A),
          ],
        };
      },
    };

    const result = await queryGenealogy(client, OUTPUT_LP_ID);

    expect(result.filter((node) => node.direction === 'ancestor').map((node) => node.lpId)).toEqual([
      PARENT_A,
      PARENT_B,
      PARENT_C,
    ]);
  });

  it('queryGenealogy keeps the legacy parent_lp_id path for LPs without junction rows', async () => {
    const client: GenealogyQueryClient = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        const normalized = normalize(sql);
        expect(params).toEqual([OUTPUT_LP_ID]);
        expect(normalized).toContain('select current.parent_lp_id as parent_lp_id');
        expect(normalized).toContain('and child.parent_lp_id = current.id');
        return {
          rows: [
            genealogyRow(LEGACY_PARENT, 'LP-LEGACY-PARENT', 1, null),
            genealogyRow(OUTPUT_LP_ID, 'LP-OUTPUT', 0, LEGACY_PARENT),
          ],
        };
      },
    };

    const result = await queryGenealogy(client, OUTPUT_LP_ID);

    expect(result.filter((node) => node.direction === 'ancestor').map((node) => node.lpId)).toEqual([
      LEGACY_PARENT,
    ]);
  });
});
