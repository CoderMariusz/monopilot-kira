/**
 * Wave 17 — generateBol packed→shipped interleaving (N-68).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateBol, shipShipment } from '../ship-actions';
import { getAppConnection, getOwnerConnection } from '../../../../../../../../../packages/db/src/clients.js';

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

const BOL_RACE_SKIP_FN = 'test_w17_bol_skip_bol_row_update';
const SHIPMENT_FOR_UPDATE_SQL = /from public\.shipments sh[\s\S]*for update of sh/i;
const BOL_UPDATE_SQL = /update public\.shipments[\s\S]*bol_payload/i;

type BolRaceHooks = {
  beforeShipmentForUpdate?: () => void | Promise<void>;
  onBolShipmentLocked?: () => void;
  beforeBolUpdate?: () => void | Promise<void>;
};

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

function wrapClientWithBolRaceHooks(client: pg.PoolClient, hooks: BolRaceHooks): pg.PoolClient {
  const nativeQuery = client.query.bind(client);
  client.query = async (queryText, values) => {
    const sql = typeof queryText === 'string' ? queryText : (queryText.text ?? '');
    if (SHIPMENT_FOR_UPDATE_SQL.test(sql)) {
      await hooks.beforeShipmentForUpdate?.();
      hooks.onBolShipmentLocked?.();
    }
    if (BOL_UPDATE_SQL.test(sql)) {
      await hooks.beforeBolUpdate?.();
    }
    return nativeQuery(queryText, values);
  };
  return client;
}

function installGlobalBolRaceHooks(hooks: BolRaceHooks): () => void {
  const originalConnect = pg.Pool.prototype.connect;
  pg.Pool.prototype.connect = async function connectWithBolRaceHooks(this: pg.Pool, ...args) {
    const client = await originalConnect.apply(this, args);
    return wrapClientWithBolRaceHooks(client, hooks);
  };
  return () => {
    pg.Pool.prototype.connect = originalConnect;
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

async function resetPackedShipment(ownerPool: pg.Pool): Promise<void> {
  await ownerPool.query(
    `update public.shipments
        set status = 'packed',
            carrier = null,
            service_level = null,
            tracking_number = null,
            bol_payload = null,
            shipped_at = null,
            shipped_by = null,
            ext_data = '{}'::jsonb
      where id = $1::uuid`,
    [shipmentId],
  );
}

async function setShipBolSignGranted(ownerPool: pg.Pool, granted: boolean): Promise<void> {
  if (granted) {
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'ship.bol.sign')
       on conflict do nothing`,
      [roleId],
    );
    return;
  }
  await ownerPool.query(
    `delete from public.role_permissions
      where role_id = $1::uuid
        and permission = 'ship.bol.sign'`,
    [roleId],
  );
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
    for (const permission of ['ship.ship.confirm', 'ship.bol.sign']) {
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

    await ownerPool.query(
      `create table if not exists public.test_w17_bol_race_config (
         shipment_id uuid primary key,
         skip_bol_row_update boolean not null default false
       )`,
    );
    await ownerPool.query(
      `create or replace function public.${BOL_RACE_SKIP_FN}()
       returns trigger
       language plpgsql
       as $$
       begin
         if exists (
           select 1
             from public.test_w17_bol_race_config cfg
            where cfg.shipment_id = old.id
              and cfg.skip_bol_row_update
         )
         and new.bol_payload is distinct from old.bol_payload then
           return null;
         end if;
         return new;
       end;
       $$`,
    );
    await ownerPool.query(`drop trigger if exists ${BOL_RACE_SKIP_FN} on public.shipments`);
    await ownerPool.query(
      `create trigger ${BOL_RACE_SKIP_FN}
         before update on public.shipments
         for each row
         execute function public.${BOL_RACE_SKIP_FN}()`,
    );
  });

  afterAll(async () => {
    await ownerPool?.query(`drop trigger if exists ${BOL_RACE_SKIP_FN} on public.shipments`).catch(() => undefined);
    await ownerPool?.query(`drop function if exists public.${BOL_RACE_SKIP_FN}()`).catch(() => undefined);
    await ownerPool?.query('drop table if exists public.test_w17_bol_race_config').catch(() => undefined);
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

  it('requires ship.bol.sign when generateBol runs on a shipped shipment', async () => {
    await ownerPool.query(
      `update public.shipments
          set status = 'shipped',
              carrier = 'Original',
              tracking_number = 'OLD-1',
              bol_payload = '{"legacy":true}'::jsonb
        where id = $1::uuid`,
      [shipmentId],
    );

    await setShipBolSignGranted(ownerPool, false);
    try {
      const result = await withActionActor(() =>
        generateBol({ shipmentId, carrier: 'Sneaky Carrier', trackingNumber: 'NEW-1' }),
      );

      expect(result).toEqual({ ok: false, error: 'forbidden' });

      const { rows } = await ownerPool.query<{
        carrier: string | null;
        tracking_number: string | null;
        bol_payload: unknown;
      }>(
        `select carrier, tracking_number, bol_payload
           from public.shipments
          where id = $1::uuid`,
        [shipmentId],
      );
      expect(rows[0]).toMatchObject({
        carrier: 'Original',
        tracking_number: 'OLD-1',
        bol_payload: { legacy: true },
      });

      const { rows: audits } = await ownerPool.query(
        `select id from public.audit_events
          where org_id = $1::uuid and action = 'shipping.bol.carrier_updated'`,
        [orgId],
      );
      expect(audits).toHaveLength(0);
    } finally {
      await setShipBolSignGranted(ownerPool, true);
    }
  });

  it('writes BOL payload and carrier audit when ship commits before generateBol acquires the lock', async () => {
    await resetPackedShipment(ownerPool);
    const barrier = createBarrier();

    const shipWinsTx = (async () => {
      await withOrgClient(appPool, ownerPool, async (client) => {
        const { rows } = await client.query<{ status: string }>(
          `select sh.status
             from public.shipments sh
            where sh.id = $1::uuid
            for update`,
          [shipmentId],
        );
        expect(rows[0]?.status).toBe('packed');
        barrier.signal('ship-holds-lock');
        await barrier.wait('bol-blocking');
        await client.query(
          `update public.shipments
              set status = 'shipped',
                  shipped_at = now(),
                  carrier = 'Pre-Ship Carrier',
                  tracking_number = 'PRE-1'
            where id = $1::uuid
              and status = 'packed'`,
          [shipmentId],
        );
      });
    })();

    await barrier.wait('ship-holds-lock');
    const bolPromise = withActionActor(() =>
      generateBol({ shipmentId, carrier: 'Race Carrier', trackingNumber: 'RACE-1' }),
    );
    barrier.signal('bol-blocking');

    const [bolResult] = await Promise.all([bolPromise, shipWinsTx]);
    expect(bolResult.ok).toBe(true);
    if (!bolResult.ok) return;

    const { rows } = await ownerPool.query<{
      status: string;
      carrier: string | null;
      tracking_number: string | null;
      bol_payload: Record<string, unknown> | null;
    }>(
      `select status, carrier, tracking_number, bol_payload
         from public.shipments
        where id = $1::uuid`,
      [shipmentId],
    );
    expect(rows[0]?.status).toBe('shipped');
    expect(rows[0]?.carrier).toBe('Race Carrier');
    expect(rows[0]?.tracking_number).toBe('RACE-1');
    expect(rows[0]?.bol_payload).toMatchObject({
      shipmentId,
      orgId,
      carrier: 'Race Carrier',
      trackingNumber: 'RACE-1',
    });

    const { rows: audits } = await ownerPool.query<{
      action: string;
      before_state: Record<string, unknown>;
      after_state: Record<string, unknown>;
    }>(
      `select action, before_state, after_state
         from public.audit_events
        where org_id = $1::uuid
          and action = 'shipping.bol.carrier_updated'`,
      [orgId],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'shipping.bol.carrier_updated',
      before_state: {
        carrier: 'Pre-Ship Carrier',
        tracking_number: 'PRE-1',
      },
      after_state: {
        carrier: 'Race Carrier',
        tracking_number: 'RACE-1',
      },
    });
  });

  it('serializes packed→shipped behind generateBol shipment lock and persists BOL fields', async () => {
    await resetPackedShipment(ownerPool);
    const barrier = createBarrier();
    const restoreHooks = installGlobalBolRaceHooks({
      onBolShipmentLocked() {
        barrier.signal('bol-holds-lock');
      },
    });

    try {
      const shipPromise = (async () => {
        await barrier.wait('bol-holds-lock');
        return withActionActor(() => shipShipment(shipmentId));
      })();

      const bolPromise = withActionActor(() =>
        generateBol({ shipmentId, carrier: 'BOL Carrier', trackingNumber: 'BOL-1' }),
      );

      const bolResult = await bolPromise;
      expect(bolResult.ok).toBe(true);
      if (!bolResult.ok) return;

      const { rows: afterBol } = await ownerPool.query<{
        status: string;
        carrier: string | null;
        tracking_number: string | null;
        bol_payload: Record<string, unknown> | null;
      }>(
        `select status, carrier, tracking_number, bol_payload
           from public.shipments
          where id = $1::uuid`,
        [shipmentId],
      );
      expect(afterBol[0]?.status).toBe('packed');
      expect(afterBol[0]?.carrier).toBe('BOL Carrier');
      expect(afterBol[0]?.tracking_number).toBe('BOL-1');
      expect(afterBol[0]?.bol_payload).toMatchObject({
        shipmentId,
        carrier: 'BOL Carrier',
        trackingNumber: 'BOL-1',
      });

      const shipResult = await shipPromise;
      expect(shipResult).toEqual({ ok: true });

      const { rows: afterShip } = await ownerPool.query<{ status: string; carrier: string | null }>(
        `select status, carrier from public.shipments where id = $1::uuid`,
        [shipmentId],
      );
      expect(afterShip[0]?.status).toBe('shipped');
      expect(afterShip[0]?.carrier).toBe('BOL Carrier');
    } finally {
      restoreHooks();
    }
  });

  it('throws not_found with no orphan audit when ship commits before the status-predicated BOL update', async () => {
    await resetPackedShipment(ownerPool);
    await ownerPool.query(
      `insert into public.test_w17_bol_race_config (shipment_id, skip_bol_row_update)
       values ($1::uuid, true)
       on conflict (shipment_id) do update
         set skip_bol_row_update = excluded.skip_bol_row_update`,
      [shipmentId],
    );

    const barrier = createBarrier();
    const restoreHooks = installGlobalBolRaceHooks({
      async beforeShipmentForUpdate() {
        barrier.signal('bol-paused-before-lock');
        await barrier.wait('ship-committed');
      },
    });

    let shipResult: Awaited<ReturnType<typeof shipShipment>>;
    let result: Awaited<ReturnType<typeof generateBol>>;
    try {
      const shipPromise = (async () => {
        await barrier.wait('bol-paused-before-lock');
        shipResult = await withActionActor(() => shipShipment(shipmentId));
        barrier.signal('ship-committed');
        return shipResult;
      })();

      const bolPromise = withActionActor(() =>
        generateBol({ shipmentId, carrier: 'Flip Carrier', trackingNumber: 'FLIP-1' }),
      );

      [result, shipResult] = await Promise.all([bolPromise, shipPromise]);
    } finally {
      restoreHooks();
    }

    expect(shipResult!).toEqual({ ok: true });
    expect(result!).toEqual({ ok: false, error: 'not_found' });

    const { rows } = await ownerPool.query<{
      status: string;
      carrier: string | null;
      bol_payload: unknown;
    }>(
      `select status, carrier, bol_payload from public.shipments where id = $1::uuid`,
      [shipmentId],
    );
    expect(rows[0]?.status).toBe('shipped');
    expect(rows[0]?.carrier).toBeNull();
    expect(rows[0]?.bol_payload).toBeNull();

    const { rows: audits } = await ownerPool.query(
      `select id from public.audit_events
        where org_id = $1::uuid and action = 'shipping.bol.carrier_updated'`,
      [orgId],
    );
    expect(audits).toHaveLength(0);

    await ownerPool.query('delete from public.test_w17_bol_race_config where shipment_id = $1::uuid', [shipmentId]);
  });
});
