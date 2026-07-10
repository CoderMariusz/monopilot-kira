/**
 * Wave 8 — DB-faithful shipping stock integrity & traceability tests.
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../packages/db/src/clients.js';
import { LIVE_ALLOCATION_SQL, SHIP_CLOSED_ALLOCATION_REASON } from '../so-transitions';
import { ORDER_QTY_TO_INVENTORY_SQL, resolveOrderQtyToInventoryQty } from '../../../../../../lib/shipping/order-line-uom';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const customerId = randomUUID();
const itemId = randomUUID();
const warehouseId = randomUUID();
const lpId = randomUUID();
const soAId = randomUUID();
const soBId = randomUUID();
const lineAId = randomUUID();
const lineBId = randomUUID();
const allocAId = randomUUID();
const allocBId = randomUUID();
const shipmentAId = randomUUID();
const boxAId = randomUUID();
const contentAId = randomUUID();

async function bindOrg(ownerPool: pg.Pool, client: pg.PoolClient, targetOrgId: string): Promise<string> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)
     on conflict (session_token) do update
       set org_id = excluded.org_id, user_id = excluded.user_id`,
    [sessionToken, targetOrgId, userId],
  );
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, targetOrgId]);
  return sessionToken;
}

runPg('wave-8 shipping stock integrity (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave8 Shipping Tenant', 'eu', 'https://wave8-shipping.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code, gs1_prefix)
       values ($1, $2, 'Wave8 Shipping Org', $3, 'fmcg', '0501234')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wave8-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(`select public.seed_shipping_permissions_for_org($1::uuid)`, [orgId]).catch(() => undefined);
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, $3, $3, 'Wave8 Shipping Admin', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId, `wave8-admin-${roleId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Wave8 Shipping User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `wave8-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3) on conflict do nothing`,
      [orgId, userId, roleId],
    );
    for (const permission of ['ship.so.create', 'ship.so.allocate', 'ship.ship.confirm', 'ship.so.cancel']) {
      await ownerPool.query(
        `insert into public.role_permissions (role_id, permission)
         values ($1, $2) on conflict do nothing`,
        [roleId, permission],
      );
    }

    await ownerPool.query(
      `insert into public.warehouses (id, org_id, code, name)
       values ($1, $2, 'WH-W8', 'Wave8 WH')
       on conflict (id) do nothing`,
      [warehouseId, orgId],
    );
    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, output_uom, each_per_box, status)
       values ($1, $2, 'FG-W8-001', 'fg', 'Wave8 FG', 'pcs', 'each', 12, 'active')
       on conflict (id) do nothing`,
      [itemId, orgId],
    );
    await ownerPool.query(
      `insert into public.customers (id, org_id, customer_code, name, category)
       values ($1, $2, 'C-W8', 'Wave8 Customer', 'retail')
       on conflict (id) do nothing`,
      [customerId, orgId],
    );
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, 'LP-W8-001', $4, 10, 0, 'pcs', 'available', 'released')
       on conflict (id) do nothing`,
      [lpId, orgId, warehouseId, itemId],
    );

    await ownerPool.query(
      `insert into public.sales_orders (id, org_id, customer_id, order_date, status)
       values ($1, $2, $3, current_date, 'confirmed'),
              ($4, $2, $3, current_date, 'confirmed')
       on conflict (id) do nothing`,
      [soAId, orgId, customerId, soBId],
    );
    await ownerPool.query(
      `insert into public.sales_order_lines
         (id, org_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated, unit_price_gbp, line_total_gbp, ext_data)
       values ($1, $2, $3, 1, $4, 6, 6, 1, 6, '{}'::jsonb),
              ($5, $2, $6, 1, $4, 4, 4, 1, 4, '{}'::jsonb)
       on conflict (id) do nothing`,
      [lineAId, orgId, soAId, itemId, lineBId, soBId],
    );
    await ownerPool.query(
      `insert into public.inventory_allocations
         (id, org_id, sales_order_line_id, license_plate_id, quantity_allocated, status, created_by, updated_by)
       values ($1, $2, $3, $4, 6, 'allocated', $5, $5),
              ($6, $2, $7, $4, 4, 'allocated', $5, $5)
       on conflict (id) do nothing`,
      [allocAId, orgId, lineAId, lpId, userId, allocBId, lineBId],
    );
    await ownerPool.query(
      `insert into public.shipments (id, org_id, sales_order_id, status)
       values ($1, $2, $3, 'packed')
       on conflict (id) do nothing`,
      [shipmentAId, orgId, soAId],
    );
    await ownerPool.query(
      `insert into public.shipment_boxes (id, org_id, shipment_id, box_number)
       values ($1, $2, $3, 1)
       on conflict (id) do nothing`,
      [boxAId, orgId, shipmentAId],
    );
    await ownerPool.query(
      `insert into public.shipment_box_contents
         (id, org_id, shipment_box_id, sales_order_line_id, license_plate_id, quantity)
       values ($1, $2, $3, $4, $5, 6)
       on conflict (id) do nothing`,
      [contentAId, orgId, boxAId, lineAId, lpId],
    );
  });

  afterAll(async () => {
    for (const table of [
      'shipment_box_contents',
      'shipment_boxes',
      'shipments',
      'inventory_allocations',
      'sales_order_lines',
      'sales_orders',
      'license_plates',
      'customers',
      'items',
      'warehouses',
      'user_roles',
      'role_permissions',
      'users',
      'roles',
      'organizations',
      'tenants',
    ]) {
      await ownerPool?.query(`delete from public.${table} where org_id = $1`, [orgId]).catch(() => undefined);
    }
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('converts 3 cases with each_per_box=12 to 36 inventory units (bug 3)', async () => {
    const client = await appPool.connect();
    const sessionToken = await bindOrg(ownerPool, client, orgId);
    try {
      await client.query('begin');
      const { rows } = await client.query<{ inventory_qty: string; resolved: boolean }>(
        ORDER_QTY_TO_INVENTORY_SQL,
        ['3', 'case', itemId],
      );
      expect(rows[0]).toEqual({ inventory_qty: '36', resolved: true });

      const resolved = await resolveOrderQtyToInventoryQty(client, {
        itemId,
        orderQty: '3',
        orderUom: 'case',
      });
      expect(resolved).toBe('36');
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
  });

  it('restores partial-ship LP quantity on cancel predicate without requiring status=shipped (bug 1)', async () => {
    const partialLpId = randomUUID();
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, 'LP-W8-PARTIAL', $4, 4, 0, 'pcs', 'available', 'released')`,
      [partialLpId, orgId, warehouseId, itemId],
    );

    const client = await appPool.connect();
    const sessionToken = await bindOrg(ownerPool, client, orgId);
    try {
      await client.query('begin');
      const shippedQty = '6';
      const restoreStatus = 'available';
      const { rowCount } = await client.query(
        `update public.license_plates
            set quantity = quantity + $2::numeric,
                status = $3,
                updated_at = now(),
                updated_by = $4::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and $2::numeric > 0
            and (status = 'shipped' or status = $3::text)`,
        [partialLpId, shippedQty, restoreStatus, userId],
      );
      expect(rowCount).toBe(1);

      const { rows } = await client.query<{ quantity: string; status: string }>(
        `select quantity::text, status
           from public.license_plates
          where id = $1::uuid`,
        [partialLpId],
      );
      expect(rows[0]).toEqual({ quantity: '10.000000', status: 'available' });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
      await ownerPool.query('delete from public.license_plates where id = $1::uuid', [partialLpId]);
    }
  });

  it('releases only the shipping SO allocation on a shared LP (bug 2)', async () => {
    const client = await appPool.connect();
    const sessionToken = await bindOrg(ownerPool, client, orgId);
    try {
      await client.query('begin');
      await client.query(
        `update public.inventory_allocations ia
            set status = 'released',
                released_at = now(),
                ext_data = coalesce(ia.ext_data, '{}'::jsonb) || jsonb_build_object('closed_reason', $3::text),
                updated_by = $2::uuid
           from public.shipment_box_contents sbc
           join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
            and sb.org_id = app.current_org_id()
            and sb.shipment_id = $1::uuid
            and sb.deleted_at is null
           join public.shipments sh on sh.id = sb.shipment_id
            and sh.org_id = app.current_org_id()
            and sh.deleted_at is null
           join public.sales_order_lines sol on sol.id = sbc.sales_order_line_id
            and sol.org_id = app.current_org_id()
            and sol.deleted_at is null
            and sol.sales_order_id = sh.sales_order_id
          where ia.license_plate_id = sbc.license_plate_id
            and ia.sales_order_line_id = sbc.sales_order_line_id
            and sbc.org_id = app.current_org_id()
            and sbc.deleted_at is null
            and ia.org_id = app.current_org_id()
            and ${LIVE_ALLOCATION_SQL}`,
        [shipmentAId, userId, SHIP_CLOSED_ALLOCATION_REASON],
      );

      const { rows } = await client.query<{ id: string; status: string }>(
        `select id::text, status
           from public.inventory_allocations
          where org_id = app.current_org_id()
            and license_plate_id = $1::uuid
          order by id`,
        [lpId],
      );
      expect(rows).toEqual([
        { id: allocAId, status: 'released' },
        { id: allocBId, status: 'allocated' },
      ]);
      await client.query('rollback');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
      await ownerPool.query(
        `update public.inventory_allocations
            set status = 'allocated', released_at = null, ext_data = '{}'::jsonb
          where id = any($1::uuid[])`,
        [[allocAId, allocBId]],
      );
    }
  });
});
