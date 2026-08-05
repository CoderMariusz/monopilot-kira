/**
 * P0.8 — odwrócenie konsumpcji ma przeciwny znak ruchu
 * P0.7 — void waste nie przywraca towaru
 * P0.6 — konsumpcja / waste bez LP odrywa proces od zapasu
 *
 * Prawdziwe ścieżki zapisu na żywej bazie: recordDesktopConsumption,
 * reverseConsumption, recordWaste (przez withOrgContext, jak robi to route),
 * voidWasteEntry.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, snapshot, report, type Seed } from './seed';
import { setPin } from '../../../../packages/auth/src/verify-pin.js';
import { withOrgContext } from '../../../../apps/web/lib/auth/with-org-context';
import { recordWaste } from '../../../../apps/web/lib/production/waste/record-waste';
import { recordDesktopConsumption } from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions';
import {
  reverseConsumption,
  voidWasteEntry,
} from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const PIN = '1234';
const LOG = 'p08';

run('P0.8 / P0.7 / P0.6 — produkcja', () => {
  let seed: Seed;
  let woId: string;
  let materialId: string;
  let lpId: string;
  let categoryId: string;

  beforeAll(async () => {
    seed = await seedOrg('p08');
    await setPin(seed.userId, PIN);

    woId = randomUUID();
    materialId = randomUUID();
    lpId = randomUUID();
    categoryId = randomUUID();

    await seed.ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
       values ($1, $2, $3, $4, $5, 'fg', 100, 'kg', 'RELEASED')`,
      [woId, seed.orgId, seed.siteId, `WO-${woId.slice(0, 8)}`, seed.fgItemId],
    );
    await seed.ownerPool.query(
      `insert into public.wo_executions (org_id, site_id, wo_id, status, started_at)
       values ($1, $2, $3, 'in_progress', now())`,
      [seed.orgId, seed.siteId, woId],
    );
    await seed.ownerPool.query(
      `insert into public.wo_materials
         (id, org_id, site_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom)
       values ($1, $2, $3, $4, $5, 'QtyAdv Raw', 100, 0, 'kg')`,
      [materialId, seed.orgId, seed.siteId, woId, seed.rawItemId],
    );
    await seed.ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, $4, $5, $6, $7, 10, 0, 'kg', 'available', 'released')`,
      [lpId, seed.orgId, seed.siteId, seed.warehouseId, seed.locationId, `LP-${lpId.slice(0, 8)}`, seed.rawItemId],
    );
    await seed.ownerPool.query(
      `insert into public.waste_categories (id, org_id, code, name, is_active)
       values ($1, $2, 'trim', 'Trim', true)`,
      [categoryId, seed.orgId],
    );
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('P0.8 — consume 4 kg z LP, potem reverseConsumption: jaki znak ruchu?', async () => {
    const before = await snapshot(seed);
    report(LOG, 'P0.8 PRZED', before);

    const consumed = await recordDesktopConsumption({
      woId,
      materialId,
      qty: '4',
      lpId,
      clientOpId: `p08-consume-${randomUUID()}`,
    });
    report(LOG, 'P0.8 recordDesktopConsumption ->', consumed);

    const afterConsume = await snapshot(seed);
    report(LOG, 'P0.8 PO KONSUMPCJI', afterConsume);

    const { rows: consRows } = await seed.ownerPool.query<{ id: string; q: string }>(
      `select id::text, qty_consumed::text as q from public.wo_material_consumption
        where org_id = $1 order by created_at`,
      [seed.orgId],
    );
    report(LOG, 'P0.8 wo_material_consumption', consRows);

    if (consRows[0]) {
      const rev = await reverseConsumption({
        consumptionId: consRows[0].id,
        reasonCode: 'entry_error',
        note: 'sonda P0.8',
        signature: { password: PIN },
      });
      report(LOG, 'P0.8 reverseConsumption ->', rev);
    }

    const after = await snapshot(seed);
    report(LOG, 'P0.8 PO ODWROCENIU', after);

    const { rows: byType } = await seed.ownerPool.query(
      `select move_type, reason_code, sum(quantity)::text as suma, count(*)::text as n
         from public.stock_moves where org_id = $1 group by 1,2 order by 1,2`,
      [seed.orgId],
    );
    report(LOG, 'P0.8 ruchy wg typu', byType);
    expect(consumed).toBeTruthy();
  });

  it('P0.7 — waste 4 kg z LP, potem voidWasteEntry: czy LP wraca?', async () => {
    // przywróć LP do 10 kg / available po poprzednim teście
    await seed.ownerPool.query(
      `update public.license_plates set quantity = 10, status = 'available' where id = $1`,
      [lpId],
    );
    await seed.ownerPool.query('delete from public.stock_moves where org_id = $1', [seed.orgId]);

    const before = await snapshot(seed);
    report(LOG, 'P0.7 PRZED', before);

    const wasteRes = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await recordWaste({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          category_code: 'trim',
          qty_kg: '4',
          shift_id: 'A',
          lp_id: lpId,
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'P0.7 recordWaste ->', wasteRes);

    const afterWaste = await snapshot(seed);
    report(LOG, 'P0.7 PO WASTE', afterWaste);

    const { rows: wasteRows } = await seed.ownerPool.query<{ id: string; q: string }>(
      `select id::text, qty_kg::text as q from public.wo_waste_log where org_id = $1 order by created_at`,
      [seed.orgId],
    );
    report(LOG, 'P0.7 wo_waste_log', wasteRows);

    if (wasteRows[0]) {
      const voided = await voidWasteEntry({
        wasteId: wasteRows[0].id,
        reasonCode: 'entry_error',
        note: 'sonda P0.7',
      });
      report(LOG, 'P0.7 voidWasteEntry ->', voided);
    }

    const after = await snapshot(seed);
    report(LOG, 'P0.7 PO VOID', after);

    const { rows: wasteAfter } = await seed.ownerPool.query(
      `select qty_kg::text as q, correction_of_id::text, lp_id::text from public.wo_waste_log
        where org_id = $1 order by created_at`,
      [seed.orgId],
    );
    report(LOG, 'P0.7 wo_waste_log PO VOID', wasteAfter);
    expect(after).toBeTruthy();
  });

  it('P0.6 — waste bez lp_id oraz consume bez lp_id: czy zapas się zmienia?', async () => {
    await seed.ownerPool.query(
      `update public.license_plates set quantity = 20, status = 'available' where id = $1`,
      [lpId],
    );
    await seed.ownerPool.query('delete from public.stock_moves where org_id = $1', [seed.orgId]);
    await seed.ownerPool.query('delete from public.wo_waste_log where org_id = $1', [seed.orgId]);

    const before = await snapshot(seed);
    report(LOG, 'P0.6 PRZED', before);

    const wasteNoLp = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await recordWaste({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          category_code: 'trim',
          qty_kg: '5',
          shift_id: 'A',
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'P0.6 recordWaste bez LP ->', wasteNoLp);

    const consNoLp = await recordDesktopConsumption({
      woId,
      materialId,
      qty: '4',
      reasonCode: 'silo_draw',
      clientOpId: `p06-consume-${randomUUID()}`,
    });
    report(LOG, 'P0.6 recordDesktopConsumption bez LP ->', consNoLp);

    const after = await snapshot(seed);
    report(LOG, 'P0.6 PO', after);

    const { rows: wl } = await seed.ownerPool.query(
      `select qty_kg::text as q, lp_id::text from public.wo_waste_log where org_id = $1`,
      [seed.orgId],
    );
    const { rows: cons } = await seed.ownerPool.query(
      `select qty_consumed::text as q, lp_id::text from public.wo_material_consumption where org_id = $1`,
      [seed.orgId],
    );
    report(LOG, 'P0.6 wo_waste_log / wo_material_consumption', { waste: wl, consumption: cons });
    expect(after).toBeTruthy();
  });
});
