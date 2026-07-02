import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';

import { cancelWo } from '../../production/complete-cancel-wo';
import { resolveWacDeltaQtyKg, upsertWac } from '../upsert-wac';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const itemId = randomUUID();
const roleId = randomUUID();

runIntegrationSuite('upsertWac real Postgres behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WAC Upsert Test Tenant', 'eu', 'https://wac-upsert.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'WAC Upsert Test Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wac-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, $3, $3, 'WAC Upsert Test Role', $4::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId, `wac-cancel-${roleId.slice(0, 8)}`, JSON.stringify(['production.wo.cancel'])],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'WAC Upsert Test User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `wac-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'production.wo.cancel')
       on conflict do nothing`,
      [roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.currencies (code, name)
       values ('GBP', 'Pound Sterling')
       on conflict (code) do nothing`,
    );
  });

  afterAll(async () => {
    await ownerPool
      ?.query('delete from public.item_wac_state where org_id = $1', [orgId])
      .catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.role_permissions where role_id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('omits generated avg_cost and sums quantity/value on conflict', async () => {
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: userId,
    });
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId,
      deltaQtyKg: '5',
      deltaValue: '80',
      updatedBy: userId,
    });

    const { rows } = await ownerPool.query<{
      total_qty_kg: string;
      total_value: string;
      avg_cost: string;
      site_id: string | null;
      currency_code: string;
    }>(
      `select wac.total_qty_kg::text,
              wac.total_value::text,
              wac.avg_cost::text,
              wac.site_id::text,
              c.code::text as currency_code
         from public.item_wac_state wac
         join public.currencies c on c.id = wac.currency_id
        where wac.org_id = $1::uuid
          and wac.item_id = $2::uuid`,
      [orgId, itemId],
    );

    expect(rows).toEqual([
      {
        total_qty_kg: '15.000',
        total_value: '180.0000',
        avg_cost: '12.000000',
        site_id: null,
        currency_code: 'GBP',
      },
    ]);
  });

  it('computes exact weighted-average cost after a second receipt hits the conflict path', async () => {
    const mergeItemId = randomUUID();
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: mergeItemId,
      deltaQtyKg: '3',
      deltaValue: '6',
      updatedBy: userId,
    });
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: mergeItemId,
      deltaQtyKg: '7',
      deltaValue: '35',
      updatedBy: userId,
    });

    const { rows } = await ownerPool.query<{
      total_qty_kg: string;
      total_value: string;
      avg_cost: string;
    }>(
      `select total_qty_kg::text, total_value::text, avg_cost::text
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid`,
      [orgId, mergeItemId],
    );

    expect(rows).toEqual([
      {
        total_qty_kg: '10.000',
        total_value: '41.0000',
        avg_cost: '4.100000',
      },
    ]);
  });

  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool.query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken]);
    }
  }

  it('output then completed-cancel nets WAC back to the pre-output state', async () => {
    const cancelItemId = randomUUID();
    const woId = randomUUID();
    const executionId = randomUUID();
    const outputId = randomUUID();
    const lpId = randomUUID();
    const warehouseId = randomUUID();
    const outputTxnId = randomUUID();
    const cancelTxnId = randomUUID();

    // Insert setup data via ownerPool (committed, visible to appPool session).
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, cost_per_kg, created_by)
       values ($1, $2, $3, 'fg', 'WAC Cancel FG', 'kg', 12.000000, $4)`,
      [cancelItemId, orgId, `WAC-CANCEL-${cancelItemId.slice(0, 8)}`, userId],
    );
    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, $4, 'fg', 10.000, 'kg', 'COMPLETED', $5, $5)`,
      [woId, orgId, `WO-WAC-${woId.slice(0, 8)}`, cancelItemId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, completed_at, created_by, updated_by)
       values ($1, $2, $3, 'completed', 1, now(), $4, $4)`,
      [executionId, orgId, woId, userId],
    );
    await ownerPool.query(
      `insert into public.license_plates (
         id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status,
         origin, wo_id, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 10.000000, 0, 'kg', 'available', 'pending', 'production', $6, $7, $7)`,
      [lpId, orgId, warehouseId, `LP-WAC-${lpId.slice(0, 8)}`, cancelItemId, woId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_outputs (
         id, org_id, transaction_id, wo_id, output_type, product_id, lp_id, batch_number, qty_kg, uom,
         qa_status, ext_jsonb, registered_by, created_by, updated_by
       )
       values ($1, $2, $3, $4, 'primary', $5, $6, $7, 10.000, 'kg',
               'PENDING', $8::jsonb, $9, $9, $9)`,
      [
        outputId,
        orgId,
        outputTxnId,
        woId,
        cancelItemId,
        lpId,
        `B-WAC-${outputId.slice(0, 8)}`,
        JSON.stringify({ wac_qty_kg: '10.000', wac_value: '120.0000' }),
        userId,
      ],
    );

    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: cancelItemId,
      deltaQtyKg: '10.000',
      deltaValue: '120.0000',
      updatedBy: userId,
    });

    const { rows } = await runUnderOrg(async (client) => {
      const result = await cancelWo(
        { userId, orgId, client },
        {
          woId,
          transactionId: cancelTxnId,
          reasonCode: 'planner_cancel',
          notes: 'pg WAC reversal test',
        },
      );
      expect(result.ok).toBe(true);

      return client.query<{
        total_qty_kg: string;
        total_value: string;
        avg_cost: string;
        lp_status: string;
        lp_quantity: string;
      }>(
        `select wac.total_qty_kg::text,
                wac.total_value::text,
                wac.avg_cost::text,
                lp.status::text as lp_status,
                lp.quantity::text as lp_quantity
           from public.item_wac_state wac
           join public.license_plates lp on lp.org_id = wac.org_id and lp.id = $3::uuid
          where wac.org_id = $1::uuid
            and wac.item_id = $2::uuid`,
        [orgId, cancelItemId, lpId],
      );
    });

    expect(rows).toEqual([
      {
        total_qty_kg: '0.000',
        total_value: '0.0000',
        avg_cost: '0.000000',
        lp_status: 'destroyed',
        lp_quantity: '0.000000',
      },
    ]);
  });

  it('unknown-UoM receipt leaves total_qty_kg and total_value unchanged', async () => {
    const client = await ownerPool.connect();
    const unknownUomItemId = randomUUID();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.current_org_id', $1, true)`, [orgId]);
      await client.query(
        `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
         values ($1, $2, $3, 'rm', 'WAC Unknown UoM RM', 'kg', $4)`,
        [unknownUomItemId, orgId, `WAC-UOM-${unknownUomItemId.slice(0, 8)}`, userId],
      );
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: unknownUomItemId,
        deltaQtyKg: '4.000',
        deltaValue: '20.0000',
        updatedBy: userId,
      });

      const resolution = await resolveWacDeltaQtyKg(client, {
        itemId: unknownUomItemId,
        qty: '7.000',
        uom: 'pallet',
      });
      expect(resolution).toEqual({ qtyKg: '0', resolved: false, marker: 'unresolved_uom' });

      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: unknownUomItemId,
        deltaQtyKg: resolution.qtyKg,
        deltaValue: '35.0000',
        updatedBy: userId,
      });

      const { rows } = await client.query<{ total_qty_kg: string; total_value: string; avg_cost: string }>(
        `select total_qty_kg::text, total_value::text, avg_cost::text
           from public.item_wac_state
          where org_id = $1::uuid
            and item_id = $2::uuid`,
        [orgId, unknownUomItemId],
      );

      expect(rows).toEqual([
        {
          total_qty_kg: '4.000',
          total_value: '20.0000',
          avg_cost: '5.000000',
        },
      ]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});
