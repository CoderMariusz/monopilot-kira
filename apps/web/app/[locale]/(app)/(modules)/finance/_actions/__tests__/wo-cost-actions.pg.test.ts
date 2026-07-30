import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('wo-cost-actions.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

type ActionContext = {
  userId: string;
  orgId: string;
  siteId: string | null;
  client: pg.PoolClient;
};

let runActionWithOrg: <T>(action: (ctx: ActionContext) => Promise<T>) => Promise<T> = async () => {
  throw new Error('test org context is not initialized');
};

vi.mock('../../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(
    <T>(
      arg1: unknown,
      arg2?: (ctx: ActionContext) => Promise<T>,
    ): Promise<T> => {
      const action = typeof arg1 === 'function'
        ? arg1 as (ctx: ActionContext) => Promise<T>
        : arg2;
      if (!action) throw new TypeError('withSiteContext mock: missing action');
      return runActionWithOrg(action);
    },
  ),
}));

import { computeWoActualCost } from '../wo-cost-actions';

const finishedGoodId = randomUUID();
const pricedMaterialId = randomUUID();
const freeMaterialId = randomUUID();
const pricedWoId = randomUUID();
const freeWoId = randomUUID();

let ownerPool: pg.Pool;
let appPool: pg.Pool;
let fixture: PgTestFixture;
let orgId = '';
let userId = '';
let siteId = '';

async function runUnderOrg<T>(action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)`,
    [sessionToken, orgId, userId],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await action(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await ownerPool
      .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
      .catch(() => undefined);
  }
}

describe('computeWoActualCost material prices (real Postgres)', () => {
  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    fixture = await createPgTestFixture(ownerPool, { permissions: ['fin.costs.read'] });
    ({ orgId, userId, siteId } = fixture);

    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, cost_per_kg, created_by)
       values
         ($1, $2, $3, 'fg', 'WO Cost PG Finished Good', 'kg', null, $4),
         ($5, $2, $6, 'rm', 'WO Cost PG Priced Material', 'kg', 99.000000, $4),
         ($7, $2, $8, 'rm', 'WO Cost PG Free Material', 'kg', 7.000000, $4)`,
      [
        finishedGoodId,
        orgId,
        `PG-WO-COST-FG-${finishedGoodId.slice(0, 8)}`,
        userId,
        pricedMaterialId,
        `PG-WO-COST-RM-${pricedMaterialId.slice(0, 8)}`,
        freeMaterialId,
        `PG-WO-COST-FREE-${freeMaterialId.slice(0, 8)}`,
      ],
    );
    await ownerPool.query(
      `insert into public.item_cost_history
         (id, org_id, site_id, item_id, cost_per_kg, currency, effective_from, source, created_by)
       values
         ($1, $2, $3, $4, 2.5000, 'GBP', current_date - 1, 'manual', $5),
         ($6, $2, $3, $7, 0.0000, 'GBP', current_date - 1, 'manual', $5)`,
      [
        randomUUID(),
        orgId,
        siteId,
        pricedMaterialId,
        userId,
        randomUUID(),
        freeMaterialId,
      ],
    );
    await ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
          planned_quantity, uom, status, started_at, completed_at, created_by, updated_by)
       values
         ($1, $2, $3, $4, $5, 'fg', 360.000, 'kg', 'COMPLETED',
          pg_catalog.now() - interval '2 hours', pg_catalog.now() - interval '1 hour', $6, $6),
         ($7, $2, $3, $8, $5, 'fg', 360.000, 'kg', 'COMPLETED',
          pg_catalog.now() - interval '2 hours', pg_catalog.now() - interval '1 hour', $6, $6)`,
      [
        pricedWoId,
        orgId,
        siteId,
        `PG-WO-COST-${pricedWoId.slice(0, 8)}`,
        finishedGoodId,
        userId,
        freeWoId,
        `PG-WO-FREE-${freeWoId.slice(0, 8)}`,
      ],
    );
    await ownerPool.query(
      `insert into public.wo_material_consumption
         (id, org_id, site_id, transaction_id, wo_id, component_id, lp_id,
          qty_consumed, uom, operator_id, fefo_adherence_flag, ext_jsonb)
       values
         ($1, $2, $3, $4, $5, $6, $7, 360.000, 'kg', $8, true, $9::jsonb),
         ($10, $2, $3, $11, $12, $13, $14, 360.000, 'kg', $8, true, $9::jsonb)`,
      [
        randomUUID(),
        orgId,
        siteId,
        randomUUID(),
        pricedWoId,
        pricedMaterialId,
        randomUUID(),
        userId,
        JSON.stringify({ wac_avg_cost: '0' }),
        randomUUID(),
        randomUUID(),
        freeWoId,
        freeMaterialId,
        randomUUID(),
      ],
    );

    runActionWithOrg = (action) =>
      runUnderOrg((client) => action({ userId, orgId, siteId: null, client }));
  }, 120_000);

  afterAll(async () => {
    await ownerPool
      ?.query('delete from public.wo_material_consumption where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.work_orders where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.item_cost_history where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await ownerPool
      ?.query(
        'delete from public.items where id = any($1::uuid[])',
        [[finishedGoodId, pricedMaterialId, freeMaterialId]],
      )
      .catch(() => undefined);
    await fixture?.cleanup();
    await appPool?.end();
    await ownerPool?.end();
  });

  it('uses active history when the 360 kg consumption WAC snapshot is textual zero', async () => {
    const result = await computeWoActualCost(pricedWoId);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected action failure: ${result.reason}`);
    expect(result.data.materials).toEqual([
      {
        itemCode: `PG-WO-COST-RM-${pricedMaterialId.slice(0, 8)}`,
        qtyKg: '360.000',
        costPerKg: '2.500000',
        cost: '900.0000',
      },
    ]);
    expect(result.data.materialsTotal).toBe('900.0000');
  });

  it('keeps an explicit zero history price free instead of falling through to item master cost', async () => {
    const result = await computeWoActualCost(freeWoId);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected action failure: ${result.reason}`);
    expect(result.data.materials).toEqual([
      {
        itemCode: `PG-WO-COST-FREE-${freeMaterialId.slice(0, 8)}`,
        qtyKg: '360.000',
        costPerKg: '0.000000',
        cost: '0.0000',
      },
    ]);
    expect(result.data.materialsTotal).toBe('0.0000');
    expect(result.data.totalCost).toBe('0.0000');
    expect(result.data.zeroCost).toBe(true);
  });
});
