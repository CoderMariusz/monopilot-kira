/**
 * P0.10 — "Cancel shipment przywraca stan bez ruchu odwrotnego".
 * Pełna ścieżka: generateBol (e-sign) → shipShipment (real issue move) →
 * cancelShipment. Mierzone: LP + stock_moves przed/po.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, snapshot, report, type Seed } from './seed';
import { withOrgContext } from '../../../../apps/web/lib/auth/with-org-context';
import { setPin } from '../../../../packages/auth/src/verify-pin.js';
import { generateBol, shipShipment } from '../../../../apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions';
import { cancelShipment } from '../../../../apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const PIN = '1234';
const LOG = 'p10';

run('P0.10 — cancel shipment', () => {
  let seed: Seed;
  let lpId: string;
  let soId: string;
  let lineId: string;
  let shipmentId: string;

  beforeAll(async () => {
    seed = await seedOrg('p10');
    await setPin(seed.userId, PIN);

    lpId = randomUUID();
    soId = randomUUID();
    lineId = randomUUID();
    shipmentId = randomUUID();
    const boxId = randomUUID();
    const contentId = randomUUID();
    const allocId = randomUUID();

    await seed.ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, $4, $5, $6, $7, 10, 6, 'kg', 'available', 'released')`,
      [lpId, seed.orgId, seed.siteId, seed.warehouseId, seed.locationId, `LP-${lpId.slice(0, 8)}`, seed.fgItemId],
    );
    await seed.ownerPool.query(
      `insert into public.sales_orders (id, org_id, site_id, customer_id, order_date, status)
       values ($1, $2, $3, $4, current_date, 'packed')`,
      [soId, seed.orgId, seed.siteId, seed.customerId],
    );
    await seed.ownerPool.query(
      `insert into public.sales_order_lines
         (id, org_id, site_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated, unit_price_gbp, line_total_gbp, ext_data)
       values ($1, $2, $3, $4, 1, $5, 6, 6, 1, 6, '{}'::jsonb)`,
      [lineId, seed.orgId, seed.siteId, soId, seed.fgItemId],
    );
    await seed.ownerPool.query(
      `insert into public.inventory_allocations
         (id, org_id, sales_order_line_id, license_plate_id, quantity_allocated, status, created_by, updated_by)
       values ($1, $2, $3, $4, 6, 'allocated', $5, $5)`,
      [allocId, seed.orgId, lineId, lpId, seed.userId],
    );
    await seed.ownerPool.query(
      `insert into public.shipments (id, org_id, site_id, sales_order_id, status)
       values ($1, $2, $3, $4, 'packed')`,
      [shipmentId, seed.orgId, seed.siteId, soId],
    );
    await seed.ownerPool.query(
      `insert into public.shipment_boxes (id, org_id, shipment_id, box_number) values ($1, $2, $3, 1)`,
      [boxId, seed.orgId, shipmentId],
    );
    await seed.ownerPool.query(
      `insert into public.shipment_box_contents
         (id, org_id, shipment_box_id, sales_order_line_id, license_plate_id, quantity)
       values ($1, $2, $3, $4, $5, 6)`,
      [contentId, seed.orgId, boxId, lineId, lpId],
    );
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('ship 6 kg z LP 10 kg, potem cancelShipment: czy powstaje ruch odwrotny?', async () => {
    report(LOG, 'PRZED', await snapshot(seed));

    const bol = await generateBol({
      shipmentId,
      carrier: 'QtyAdv',
      reason: 'sonda P0.10',
      signature: { password: PIN, nonce: randomUUID() },
    });
    report(LOG, 'generateBol ->', bol);

    const { rows: diag } = await seed.ownerPool.query(
      `select sh.status,
              (select count(*) from public.shipment_boxes sb where sb.shipment_id = sh.id and sb.deleted_at is null)::text as boxes,
              (select count(*) from public.shipment_box_contents sbc join public.shipment_boxes sb2 on sb2.id = sbc.shipment_box_id
                where sb2.shipment_id = sh.id and sbc.deleted_at is null and sbc.quantity > 0)::text as contents,
              (select so.status from public.sales_orders so where so.id = sh.sales_order_id) as so_status
         from public.shipments sh where sh.id = $1::uuid`,
      [shipmentId],
    );
    report(LOG, 'diagnostyka przed shipShipment', diag);

    const rlsDiag = await withOrgContext(async ({ client }) => {
      const q = async (sql: string) => (await client.query(sql, [shipmentId])).rows;
      return {
        shipment: await q(`select id::text, status, sales_order_id::text from public.shipments where id = $1::uuid`),
        boxes: await q(`select id::text from public.shipment_boxes where shipment_id = $1::uuid`),
        contents: await q(
          `select sbc.id::text, sbc.quantity::text, sbc.license_plate_id::text
             from public.shipment_box_contents sbc
             join public.shipment_boxes sb on sb.id = sbc.shipment_box_id
            where sb.shipment_id = $1::uuid`,
        ),
        lp: await q(`select id::text, status from public.license_plates where $1::uuid is not null limit 5`),
        so: await q(`select id::text, status from public.sales_orders where $1::uuid is not null limit 5`),
      };
    });
    report(LOG, 'diagnostyka RLS (app pool)', rlsDiag);

    const shipped = await shipShipment(shipmentId);
    report(LOG, 'shipShipment ->', shipped);
    const afterShip = await snapshot(seed);
    report(LOG, 'PO WYSYLCE', afterShip);

    const cancelled = await cancelShipment({
      shipmentId,
      reasonCode: 'operator_error',
      note: 'sonda P0.10',
      signature: { password: PIN, nonce: randomUUID() },
    });
    report(LOG, 'cancelShipment ->', cancelled);

    const after = await snapshot(seed);
    report(LOG, 'PO ANULOWANIU', after);

    const { rows: byType } = await seed.ownerPool.query(
      `select move_type, reason_code, sum(quantity)::text as suma, count(*)::text as n
         from public.stock_moves where org_id = $1 group by 1,2 order by 1,2`,
      [seed.orgId],
    );
    report(LOG, 'ruchy wg typu PO ANULOWANIU', byType);
    expect(after).toBeTruthy();
  });
});
