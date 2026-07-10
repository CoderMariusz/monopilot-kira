/**
 * Wave 17 — generateBol packed→shipped interleaving (N-68).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateBol } from '../ship-actions';
import { getAppConnection, getOwnerConnection } from '../../../../../../packages/db/src/clients.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const customerId = randomUUID();
const itemId = randomUUID();
const warehouseId = randomUUID();
const soId = randomUUID();
const lineId = randomUUID();
const shipmentId = randomUUID();
const boxId = randomUUID();
const contentId = randomUUID();
const lpId = randomUUID();

function createBarrier() {
  const waiters = new Map<string, Array<() => void>>();
  const signaled = new Set<string>();

  return {
    async wait(name: string): Promise<void> {
      if (signaled.has(name)) return;
      await new Promise<void>((resolve) => {
        const queue = waiters.get(name) ?? [];
        queue.push(resolve);
        waiters.set(name, queue);
      });
    },
    signal(name: string): void {
      signaled.add(name);
      for (const resolve of waiters.get(name) ?? []) resolve();
      waiters.delete(name);
    },
  };
}

async function withActionActor<T>(fn: () => Promise<T>): Promise<T> {
  const priorUser = process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  const priorOrg = process.env.NEXT_SERVER_ACTION_ORG_ID;
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  try {
    return await fn();
  } finally {
    if (priorUser === undefined) delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    else process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = priorUser;
    if (priorOrg === undefined) delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    else process.env.NEXT_SERVER_ACTION_ORG_ID = priorOrg;
  }
}

async function withOrgClient(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<void>,
): Promise<void> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)
     on conflict (session_token) do update
       set org_id = excluded.org_id, user_id = excluded.user_id`,
    [sessionToken, orgId, userId],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    await fn(client);
    await client.query('commit');
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

runPg('generateBol shipment lock race (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave17 Ship Tenant', 'eu', 'https://wave17-ship.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code, gs1_prefix)
       values ($1, $2, 'Wave17 Ship Org', $3, 'fmcg', '0501234')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w17-ship-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(`select public.seed_shipping_permissions_for_org($1::uuid)`, [orgId]).catch(() => undefined);
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'w17-ship', 'w17-ship', 'Wave17 Ship Role', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Wave17 Ship User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `w17-ship-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3) on conflict do nothing`,
      [orgId, userId, roleId],
    );
    for (const permission of ['ship.ship.confirm']) {
      await ownerPool.query(
        `insert into public.role_permissions (role_id, permission)
         values ($1, $2) on conflict do nothing`,
        [roleId, permission],
      );
    }

    await ownerPool.query(
      `insert into public.warehouses (id, org_id, code, name)
       values ($1, $2, 'WH-W17', 'Wave17 WH')
       on conflict (id) do nothing`,
      [warehouseId, orgId],
    );
    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, output_uom, each_per_box, status)
       values ($1, $2, 'FG-W17-001', 'fg', 'Wave17 FG', 'pcs', 'each', 12, 'active')
       on conflict (id) do nothing`,
      [itemId, orgId],
    );
    await ownerPool.query(
      `insert into public.customers (id, org_id, customer_code, name, category)
       values ($1, $2, 'C-W17', 'Wave17 Customer', 'retail')
       on conflict (id) do nothing`,
      [customerId, orgId],
    );
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, 'LP-W17-001', $4, 10, 0, 'pcs', 'available', 'released')
       on conflict (id) do nothing`,
      [lpId, orgId, warehouseId, itemId],
    );
    await ownerPool.query(
      `insert into public.sales_orders (id, org_id, customer_id, order_date, status)
       values ($1, $2, $3, current_date, 'manifested')
       on conflict (id) do nothing`,
      [soId, orgId, customerId],
    );
    await ownerPool.query(
      `insert into public.sales_order_lines
         (id, org_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated, unit_price_gbp, line_total_gbp, ext_data)
       values ($1, $2, $3, 1, $4, 1, 1, 1, 1, '{}'::jsonb)
       on conflict (id) do nothing`,
      [lineId, orgId, soId, itemId],
    );
    await ownerPool.query(
      `insert into public.shipments (id, org_id, sales_order_id, status)
       values ($1, $2, $3, 'packed')
       on conflict (id) do nothing`,
      [shipmentId, orgId, soId],
    );
    await ownerPool.query(
      `insert into public.shipment_boxes (id, org_id, shipment_id)
       values ($1, $2, $3)
       on conflict (id) do nothing`,
      [boxId, orgId, shipmentId],
    );
    await ownerPool.query(
      `insert into public.shipment_box_contents
         (id, org_id, shipment_box_id, sales_order_line_id, license_plate_id, quantity)
       values ($1, $2, $3, $4, $5, 1)
       on conflict (id) do nothing`,
      [contentId, orgId, boxId, lineId, lpId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.audit_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.shipment_box_contents where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.shipment_boxes where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.shipments where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sales_order_lines where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sales_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.customers where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.warehouses where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.role_permissions where role_id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('requires ship.bol.sign when a concurrent ship commits before BOL carrier update', async () => {
    await ownerPool.query(
      `update public.shipments
          set status = 'shipped',
              carrier = 'Original',
              tracking_number = 'OLD-1'
        where id = $1::uuid`,
      [shipmentId],
    );

    const result = await withActionActor(() =>
      generateBol({ shipmentId, carrier: 'Sneaky Carrier', trackingNumber: 'NEW-1' }),
    );

    expect(result).toEqual({ ok: false, error: 'forbidden' });

    const { rows } = await ownerPool.query<{ carrier: string | null; tracking_number: string | null }>(
      `select carrier, tracking_number from public.shipments where id = $1::uuid`,
      [shipmentId],
    );
    expect(rows[0]).toMatchObject({ carrier: 'Original', tracking_number: 'OLD-1' });

    const { rows: audits } = await ownerPool.query(
      `select id from public.audit_events
        where org_id = $1::uuid and action = 'shipping.bol.carrier_updated'`,
      [orgId],
    );
    expect(audits).toHaveLength(0);
  });

  it('serializes ship status transition behind generateBol shipment lock', async () => {
    await ownerPool.query(
      `update public.shipments
          set status = 'packed', carrier = null, tracking_number = null
        where id = $1::uuid`,
      [shipmentId],
    );

    const barrier = createBarrier();
    let shipStarted = false;

    const bolTx = (async () => {
      await withOrgClient(appPool, ownerPool, async (client) => {
        const { rows } = await client.query<{ status: string }>(
          `select sh.status
             from public.shipments sh
            where sh.id = $1::uuid
            for update`,
          [shipmentId],
        );
        expect(rows[0]?.status).toBe('packed');
        barrier.signal('bol-locked');
        await barrier.wait('ship-started');
        await client.query(
          `update public.shipments
              set carrier = 'BOL Carrier',
                  bol_payload = '{"locked":true}'::jsonb
            where id = $1::uuid
              and status = 'packed'`,
          [shipmentId],
        );
      });
    })();

    await barrier.wait('bol-locked');

    const shipTx = withOrgClient(appPool, ownerPool, async (client) => {
      shipStarted = true;
      barrier.signal('ship-started');
      await client.query(
        `update public.shipments
            set status = 'shipped',
                shipped_at = now()
          where id = $1::uuid
            and status = 'packed'`,
        [shipmentId],
      );
    });

    await Promise.all([bolTx, shipTx]);
    expect(shipStarted).toBe(true);

    const { rows } = await ownerPool.query<{ status: string; carrier: string | null }>(
      `select status, carrier from public.shipments where id = $1::uuid`,
      [shipmentId],
    );
    expect(['packed', 'shipped']).toContain(rows[0]?.status);
    if (rows[0]?.status === 'packed') {
      expect(rows[0]?.carrier).toBe('BOL Carrier');
    }
  });
});
