import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getOwnerConnection } from '../../../../../../../../../packages/db/src/clients.js';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../../../../../tests/helpers/owner-org-context.js';
import { releaseReservation } from '../reservation-actions';

const runPg = process.env.DATABASE_URL ? describe : describe.skip;

let orgId: string;
let userId: string;
let siteId: string;
let warehouseId: string;
const itemId = randomUUID();
const customerId = randomUUID();
const soId = randomUUID();
const soLineId = randomUUID();
const lpId = randomUUID();
const allocationId = randomUUID();

type ReservationSnapshot = {
  quantity: string;
  reserved_qty: string;
  available_qty: string;
  active_allocation_count: number;
  active_allocation_qty: string;
  line_allocated_qty: string;
};

async function readSnapshot(ownerPool: pg.Pool): Promise<ReservationSnapshot> {
  const { rows } = await ownerPool.query<ReservationSnapshot>(
    `select lp.quantity::text,
            lp.reserved_qty::text,
            (lp.quantity - lp.reserved_qty)::text as available_qty,
            count(ia.id) filter (
              where ia.status in ('allocated', 'picked')
                and ia.deleted_at is null
                and coalesce(ia.ext_data->>'closed_reason', '') <> 'shipped'
            )::int as active_allocation_count,
            coalesce(sum(ia.quantity_allocated) filter (
              where ia.status in ('allocated', 'picked')
                and ia.deleted_at is null
                and coalesce(ia.ext_data->>'closed_reason', '') <> 'shipped'
            ), 0)::text as active_allocation_qty,
            sol.quantity_allocated::text as line_allocated_qty
       from public.license_plates lp
       join public.sales_order_lines sol on sol.id = $2::uuid
       left join public.inventory_allocations ia
         on ia.org_id = lp.org_id
        and ia.license_plate_id = lp.id
      where lp.id = $1::uuid
      group by lp.id, sol.quantity_allocated`,
    [lpId, soLineId],
  );
  return rows[0]!;
}

runPg('warehouse reservation integrity (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let fixture: PgTestFixture;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    fixture = await createPgTestFixture(ownerPool, { permissions: ['warehouse.lp.reserve'] });
    ({ orgId, userId, siteId, warehouseId } = fixture);
    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, 'FG-RI-001', 'fg', 'Reservation Integrity Item', 'kg', 'active')`,
      [itemId, orgId],
    );
    await ownerPool.query(
      `insert into public.customers (id, org_id, customer_code, name, category)
       values ($1, $2, 'C-RI', 'Reservation Integrity Customer', 'retail')`,
      [customerId, orgId],
    );
    await ownerPool.query(
      `insert into public.sales_orders (id, org_id, customer_id, order_date, status)
       values ($1, $2, $3, current_date, 'allocated')`,
      [soId, orgId, customerId],
    );
    await ownerPool.query(
      `insert into public.sales_order_lines
         (id, org_id, sales_order_id, line_number, product_id, quantity_ordered,
          quantity_allocated, unit_price_gbp, line_total_gbp, ext_data)
       values ($1, $2, $3, 1, $4, 6, 6, 1, 6, '{}'::jsonb)`,
      [soLineId, orgId, soId, itemId],
    );
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, lp_number, product_id, quantity, reserved_qty,
          uom, status, qa_status)
       values ($1, $2, $3, $4, 'LP-RI-001', $5, 10, 6, 'kg', 'reserved', 'released')`,
      [lpId, orgId, siteId, warehouseId, itemId],
    );
    await ownerPool.query(
      `insert into public.inventory_allocations
         (id, org_id, sales_order_line_id, license_plate_id, quantity_allocated,
          status, created_by, updated_by)
       values ($1, $2, $3, $4, 6, 'allocated', $5, $5)`,
      [allocationId, orgId, soLineId, lpId, userId],
    );

    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  });

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    for (const table of [
      'lp_state_history',
      'inventory_allocations',
      'sales_order_lines',
      'sales_orders',
      'license_plates',
      'customers',
      'items',
    ]) {
      await ownerPool?.query(`delete from public.${table} where org_id = $1::uuid`, [orgId]).catch(() => undefined);
    }
    await fixture?.cleanup();
    await ownerPool?.end().catch(() => undefined);
  });

  it('keeps an unreleased allocation blocking stock, then releases both ledgers atomically', async () => {
    const before = await readSnapshot(ownerPool);
    console.log(
      `RESERVATION_BEFORE quantity=${before.quantity} reserved=${before.reserved_qty} available=${before.available_qty} active_allocations=${before.active_allocation_count} active_allocation_qty=${before.active_allocation_qty} line_allocated=${before.line_allocated_qty}`,
    );
    expect(before).toEqual({
      quantity: '10.000000',
      reserved_qty: '6.000000',
      available_qty: '4.000000',
      active_allocation_count: 1,
      active_allocation_qty: '6.000',
      line_allocated_qty: '6.000',
    });

    await expect(
      releaseReservation({ lpId, reason: 'integrity regression probe' }),
    ).resolves.toMatchObject({ ok: true });

    const after = await readSnapshot(ownerPool);
    const allocation = await ownerPool.query<{
      status: string;
      released: boolean;
      updated_by: string | null;
    }>(
      `select status, released_at is not null as released, updated_by::text
         from public.inventory_allocations
        where id = $1::uuid`,
      [allocationId],
    );
    const history = await ownerPool.query<{ count: number }>(
      `select count(*)::int
         from public.lp_state_history
        where org_id = $1::uuid
          and lp_id = $2::uuid
          and from_state = 'reserved'
          and to_state = 'available'
          and reason_code = 'reservation_released'`,
      [orgId, lpId],
    );

    console.log(
      `RESERVATION_AFTER reserved=${after.reserved_qty} available=${after.available_qty} active_allocations=${after.active_allocation_count} active_allocation_qty=${after.active_allocation_qty} line_allocated=${after.line_allocated_qty} allocation_status=${allocation.rows[0]?.status} history_rows=${history.rows[0]?.count}`,
    );
    expect(after).toEqual({
      quantity: '10.000000',
      reserved_qty: '0.000000',
      available_qty: '10.000000',
      active_allocation_count: 0,
      active_allocation_qty: '0',
      line_allocated_qty: '0.000',
    });
    expect(allocation.rows[0]).toEqual({
      status: 'released',
      released: true,
      updated_by: userId,
    });
    expect(history.rows[0]?.count).toBe(1);
  });
});
