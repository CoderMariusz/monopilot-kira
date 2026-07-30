import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../packages/db/src/clients.js';
import {
  readSalesOrderConfirmationBlocker,
  writeSalesOrderStatusInContext,
} from '../so-status-write';

const runPg = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const customerId = randomUUID();
const itemId = randomUUID();
const pricedSoId = randomUUID();
const unpricedSoId = randomUUID();
const pricedLineId = randomUUID();
const unpricedLineId = randomUUID();

type AppClient = pg.PoolClient;
type ShippingContext = Parameters<typeof readSalesOrderConfirmationBlocker>[0];

async function registerOrgContext(ownerPool: pg.Pool): Promise<string> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)`,
    [sessionToken, orgId, userId],
  );
  return sessionToken;
}

async function setOrgContext(client: AppClient, sessionToken: string): Promise<void> {
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
}

async function readStatus(client: AppClient, soId: string): Promise<string | undefined> {
  const { rows } = await client.query<{ status: string }>(
    `select status
       from public.sales_orders
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null`,
    [soId],
  );
  return rows[0]?.status;
}

runPg('SO confirmation guards (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'SO Confirm Test Tenant', 'eu', 'https://so-confirm.example.test')`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'SO Confirm Test Org', $3, 'fmcg')`,
      [orgId, tenantId, `so-confirm-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, $3, $3, 'SO Confirm Test Role', '[]'::jsonb)`,
      [roleId, orgId, `so-confirm-${roleId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'SO Confirm Test User', $4)`,
      [userId, orgId, `so-confirm-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3)`,
      [orgId, userId, roleId],
    );
    await ownerPool.query(
      `insert into public.customers (id, org_id, customer_code, name, category)
       values ($1, $2, 'C-SO-CONFIRM', 'SO Confirm Customer', 'retail')`,
      [customerId, orgId],
    );
    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, 'FG-SO-CONFIRM', 'fg', 'SO Confirm FG', 'kg', 'active')`,
      [itemId, orgId],
    );
    await ownerPool.query(
      `insert into public.sales_orders (id, org_id, customer_id, order_date, status)
       values ($1, $2, $3, current_date, 'draft'),
              ($4, $2, $3, current_date, 'draft')`,
      [pricedSoId, orgId, customerId, unpricedSoId],
    );
    await ownerPool.query(
      `insert into public.sales_order_lines
         (id, org_id, sales_order_id, line_number, product_id, quantity_ordered,
          quantity_allocated, unit_price_gbp, line_total_gbp, ext_data)
       values ($1, $2, $3, 1, $4, 2, 0, 4.25, 8.50, '{}'::jsonb),
              ($5, $2, $6, 1, $4, 2, 0, 0, 0, '{}'::jsonb)`,
      [pricedLineId, orgId, pricedSoId, itemId, unpricedLineId, unpricedSoId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from app.session_org_contexts where org_id = $1::uuid', [orgId]).catch(() => undefined);
    for (const table of [
      'sales_order_lines',
      'sales_orders',
      'customers',
      'items',
      'user_roles',
      'users',
      'roles',
      'organizations',
    ]) {
      await ownerPool?.query(`delete from public.${table} where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    }
    await ownerPool?.query('delete from public.tenants where id = $1::uuid', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('persists draft to confirmed when every line has a positive unit price', async () => {
    const client = await appPool.connect();
    const sessionToken = await registerOrgContext(ownerPool);
    try {
      await client.query('begin');
      await setOrgContext(client, sessionToken);
      const ctx: ShippingContext = {
        userId,
        orgId,
        client: client as unknown as ShippingContext['client'],
      };
      const before = await readStatus(client, pricedSoId);
      expect(await readSalesOrderConfirmationBlocker(ctx, pricedSoId)).toBeNull();
      expect(await writeSalesOrderStatusInContext(ctx, pricedSoId, 'confirmed')).toBe('ok');
      await client.query('commit');

      await client.query('begin');
      await setOrgContext(client, sessionToken);
      const after = await readStatus(client, pricedSoId);
      await client.query('commit');

      console.log(`DB_STATUS priced_so before=${before} after=${after}`);
      expect(before).toBe('draft');
      expect(after).toBe('confirmed');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
    }
  });

  it('persists draft and returns the price blocker when a line has zero unit price', async () => {
    const client = await appPool.connect();
    const sessionToken = await registerOrgContext(ownerPool);
    try {
      await client.query('begin');
      await setOrgContext(client, sessionToken);
      const ctx: ShippingContext = {
        userId,
        orgId,
        client: client as unknown as ShippingContext['client'],
      };
      const before = await readStatus(client, unpricedSoId);
      const blocker = await readSalesOrderConfirmationBlocker(ctx, unpricedSoId);
      expect(blocker).toBe('so_unit_price_required');
      await client.query('commit');

      await client.query('begin');
      await setOrgContext(client, sessionToken);
      const after = await readStatus(client, unpricedSoId);
      await client.query('commit');

      console.log(`DB_STATUS unpriced_so before=${before} after=${after} blocker=${blocker}`);
      expect(before).toBe('draft');
      expect(after).toBe('draft');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
    }
  });
});
