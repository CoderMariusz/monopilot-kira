import { beforeEach, describe, expect, it } from 'vitest';

import { ProductionActionError, type OrgContextLike, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';
const CONSUMPTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPONENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
let outputInsertCount: number;

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalize(sql);
      if (normalized.includes('allowed_products')) {
        return { rows: [{ allowed: true }], rowCount: 1 };
      }
      if (normalized.includes('from public.work_orders')) {
        return {
          rows: [
            {
              id: WO_ID,
              wo_number: 'WO-001',
              site_id: SITE_ID,
              uom: 'kg',
              uom_snapshot: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (normalized.includes('select c.id::text as consumption_id')) {
        return {
          rows: [
            {
              consumption_id: CONSUMPTION_ID,
              component_id: COMPONENT_ID,
              qty: '5.000',
              uom: 'ltr',
            },
          ],
          rowCount: 1,
        };
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
              cost_per_kg: '2.50',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.wo_executions')) {
        return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_outputs')) {
        outputInsertCount += 1;
        throw new Error('wo_outputs insert should not run when WAC preflight blocks');
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('registerOutput WAC un-costed preflight', () => {
  beforeEach(() => {
    outputInsertCount = 0;
    client = makeClient();
  });

  it('blocks output registration before any writes when consumption lines cannot be costed', async () => {
    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: PRODUCT_ID,
        qty_kg: '10.000',
      }),
    ).rejects.toMatchObject({
      code: 'wac_un_costed',
      status: 422,
      details: {
        unCostedLines: [
          {
            consumptionId: CONSUMPTION_ID,
            componentId: COMPONENT_ID,
            qty: '5.000',
            uom: 'ltr',
          },
        ],
      },
    } satisfies Partial<ProductionActionError>);

    expect(outputInsertCount).toBe(0);
  });
});
