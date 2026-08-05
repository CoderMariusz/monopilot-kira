/**
 * P0.9  — "unified movement ledger" duplikuje ruchy / rekonstruuje historię z bieżącego LP
 * P1.13 — short pick zostawia osieroconą rezerwację (reserved_qty nie maleje)
 * P1.14 — waste na LP z innego zakładu: ruch stemplowany site'em WO
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, snapshot, report, type Seed } from './seed';
import { withOrgContext } from '../../../../apps/web/lib/auth/with-org-context';
import { registerOutput } from '../../../../apps/web/lib/production/output/register-output';
import { recordWaste } from '../../../../apps/web/lib/production/waste/record-waste';
import { recordDesktopConsumption } from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions';
import { listStockMoves } from '../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions';
import { createPickList, pickLine, getPickListForSalesOrder } from '../../../../apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const LOG = 'p09';

run('P0.9 / P1.13 / P1.14', () => {
  let seed: Seed;
  let siteBId: string;
  let woId: string;
  let materialId: string;

  beforeAll(async () => {
    seed = await seedOrg('p09');
    const { rows: cur } = await seed.ownerPool.query<{ id: string }>(
      `select id::text from public.currencies where code = 'GBP' limit 1`,
    );
    for (const site of [seed.siteId, null]) {
      await seed.ownerPool
        .query(
          `insert into public.item_wac_state (org_id, site_id, item_id, currency_id, total_qty_kg, total_value, avg_cost)
           values ($1, $2, $3, $4, 10000, 10000, 1)`,
          [seed.orgId, site, seed.rawItemId, cur[0]!.id],
        )
        .catch(() => undefined);
    }
    await seed.ownerPool.query(`update public.items set cost_per_kg = 1 where org_id = $1`, [seed.orgId]).catch(() => undefined);

    // drugi zakład (P1.14)
    siteBId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.sites (id, org_id, site_code, name, is_default) values ($1, $2, $3, 'QtyAdv Site B', false)`,
      [siteBId, seed.orgId, `SB-${siteBId.slice(0, 8)}`],
    );
    await seed.ownerPool
      .query(`insert into public.user_sites (org_id, user_id, site_id) values ($1, $2, $3)`, [seed.orgId, seed.userId, siteBId])
      .catch(() => undefined);

    woId = randomUUID();
    materialId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
       values ($1, $2, $3, $4, $5, 'fg', 100, 'kg', 'RELEASED')`,
      [woId, seed.orgId, seed.siteId, `WO-P09-${woId.slice(0, 6)}`, seed.fgItemId],
    );
    await seed.ownerPool.query(
      `insert into public.wo_executions (org_id, site_id, wo_id, status, started_at) values ($1, $2, $3, 'in_progress', now())`,
      [seed.orgId, seed.siteId, woId],
    );
    await seed.ownerPool.query(
      `insert into public.wo_materials (id, org_id, site_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom)
       values ($1, $2, $3, $4, $5, 'QtyAdv Raw', 100, 0, 'kg')`,
      [materialId, seed.orgId, seed.siteId, woId, seed.rawItemId],
    );
    await seed.ownerPool.query(
      `insert into public.waste_categories (id, org_id, code, name, is_active) values ($1, $2, 'trim', 'Trim', true)`,
      [randomUUID(), seed.orgId],
    );
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.ownerPool.query('delete from public.sites where id = $1', [siteBId]).catch(() => undefined);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('P0.9 — jeden output 100 kg: ile pozycji pokazuje unified ledger?', async () => {
    const out = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await registerOutput({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          output_type: 'primary',
          product_id: seed.fgItemId,
          qty_kg: '100',
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'P0.9 registerOutput 100 kg ->', out);
    const outLpId = (out as { lp_id?: string }).lp_id ?? null;

    const { rows: sm } = await seed.ownerPool.query(
      `select move_type, quantity::text as quantity from public.stock_moves where org_id = $1`,
      [seed.orgId],
    );
    const { rows: hist } = await seed.ownerPool.query(
      `select from_state, to_state, reason_code from public.lp_state_history where org_id = $1`,
      [seed.orgId],
    );
    report(LOG, 'P0.9 stock_moves / lp_state_history w bazie', { stock_moves: sm, lp_state_history: hist });

    const listed = await listStockMoves({ limit: 100 });
    report(LOG, 'P0.9 listStockMoves (unified) ->', listed);

    // zużyj 40 kg z output LP i sprawdź, czy historyczna pozycja zmienia ilość
    if (outLpId) {
      await seed.ownerPool.query(`update public.license_plates set status = 'available' where id = $1`, [outLpId]);
      await seed.ownerPool.query(
        `insert into public.wo_materials (id, org_id, site_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom)
         values ($1, $2, $3, $4, $5, 'QtyAdv FG', 100, 0, 'kg')`,
        [randomUUID(), seed.orgId, seed.siteId, woId, seed.fgItemId],
      );
      const { rows: fgMat } = await seed.ownerPool.query<{ id: string }>(
        `select id::text from public.wo_materials where org_id = $1 and product_id = $2 limit 1`,
        [seed.orgId, seed.fgItemId],
      );
      const cons = await recordDesktopConsumption({
        woId,
        materialId: fgMat[0]!.id,
        qty: '40',
        lpId: outLpId,
        clientOpId: `p09-${randomUUID()}`,
      });
      report(LOG, 'P0.9 konsumpcja 40 kg z output LP ->', cons);
      const relisted = await listStockMoves({ limit: 100 });
      report(LOG, 'P0.9 listStockMoves PO KONSUMPCJI ->', relisted);
    }
    expect(out).toBeTruthy();
  });

  it('P1.14 — waste 4 kg z LP w zakładzie B, WO w zakładzie A', async () => {
    const lpB = randomUUID();
    await seed.ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, $4, $5, $6, $7, 10, 0, 'kg', 'available', 'released')`,
      [lpB, seed.orgId, siteBId, seed.warehouseId, seed.locationId, `LPB-${lpB.slice(0, 8)}`, seed.rawItemId],
    );
    const res = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await recordWaste({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          category_code: 'trim',
          qty_kg: '4',
          shift_id: 'A',
          lp_id: lpB,
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'P1.14 recordWaste (LP site B, WO site A) ->', res);
    const { rows } = await seed.ownerPool.query(
      `select lp.site_id::text as lp_site, lp.quantity::text as lp_qty,
              sm.site_id::text as move_site, sm.quantity::text as move_qty, sm.reason_code
         from public.license_plates lp
         left join public.stock_moves sm on sm.lp_id = lp.id
        where lp.id = $1::uuid`,
      [lpB],
    );
    report(LOG, 'P1.14 site LP vs site ruchu', { site_A_wo: seed.siteId, site_B_lp: siteBId, wynik: rows });
    expect(res).toBeTruthy();
  });

  it('P1.13 — short pick: czy reserved_qty maleje razem z alokacją?', async () => {
    const lpId = randomUUID();
    const soId = randomUUID();
    const lineId = randomUUID();
    const allocId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, $4, $5, $6, $7, 20, 10, 'kg', 'available', 'released')`,
      [lpId, seed.orgId, seed.siteId, seed.warehouseId, seed.locationId, `LPP-${lpId.slice(0, 8)}`, seed.fgItemId],
    );
    await seed.ownerPool.query(
      `insert into public.sales_orders (id, org_id, site_id, customer_id, order_date, status)
       values ($1, $2, $3, $4, current_date, 'allocated')`,
      [soId, seed.orgId, seed.siteId, seed.customerId],
    );
    await seed.ownerPool.query(
      `insert into public.sales_order_lines
         (id, org_id, site_id, sales_order_id, line_number, product_id, quantity_ordered, quantity_allocated, unit_price_gbp, line_total_gbp, ext_data)
       values ($1, $2, $3, $4, 1, $5, 10, 10, 1, 10, '{}'::jsonb)`,
      [lineId, seed.orgId, seed.siteId, soId, seed.fgItemId],
    );
    await seed.ownerPool.query(
      `insert into public.inventory_allocations
         (id, org_id, sales_order_line_id, license_plate_id, quantity_allocated, status, created_by, updated_by)
       values ($1, $2, $3, $4, 10, 'allocated', $5, $5)`,
      [allocId, seed.orgId, lineId, lpId, seed.userId],
    );

    const before = await seed.ownerPool.query(
      `select quantity::text as q, reserved_qty::text as r from public.license_plates where id = $1::uuid`,
      [lpId],
    );
    report(LOG, 'P1.13 PRZED (LP 20, reserved 10, alokacja 10)', before.rows);

    const pl = await createPickList(soId);
    report(LOG, 'P1.13 createPickList ->', pl);
    const plGet = await getPickListForSalesOrder(soId);
    report(LOG, 'P1.13 getPickListForSalesOrder ->', plGet);
    const lineIds = JSON.stringify(plGet).match(/"id":"([0-9a-f-]{36})"/g) ?? [];
    const { rows: plLines } = await seed.ownerPool.query<{ id: string; q: string }>(
      `select id::text, quantity_to_pick::text as q from public.pick_list_lines where org_id = $1`,
      [seed.orgId],
    );
    report(LOG, 'P1.13 pick_list_lines', { plLines, lineIds });
    const picked = plLines[0]
      ? await pickLine(plLines[0].id, { quantityPicked: '6', shortPickReason: 'damaged', pickedLicensePlateId: lpId })
      : { skipped: 'brak pick_list_lines' };
    report(LOG, 'P1.13 pickLine 6 z 10 (short) ->', picked);

    const after = await seed.ownerPool.query(
      `select quantity::text as q, reserved_qty::text as r from public.license_plates where id = $1::uuid`,
      [lpId],
    );
    const allocs = await seed.ownerPool.query(
      `select quantity_allocated::text as q, status from public.inventory_allocations where org_id = $1 order by created_at`,
      [seed.orgId],
    );
    report(LOG, 'P1.13 PO', { lp: after.rows, alokacje: allocs.rows });
    expect(after).toBeTruthy();
  });
});
