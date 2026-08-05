/**
 * P0.4  — replacement output nie materializuje zapasu (voidWoOutput z replacement)
 * P1.11 — ta sama ilość w trzech skalach + UOM przepisany z requestu
 * P0.9a — syntetyczny historyczny receipt czyta BIEŻĄCĄ ilość LP
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, report, type Seed } from './seed';
import { setPin } from '../../../../packages/auth/src/verify-pin.js';
import { withOrgContext } from '../../../../apps/web/lib/auth/with-org-context';
import { registerOutput } from '../../../../apps/web/lib/production/output/register-output';
import { voidWoOutput } from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions';
import { recordDesktopConsumption } from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions';
import { recordWaste } from '../../../../apps/web/lib/production/waste/record-waste';
import { listStockMoves } from '../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const PIN = '1234';
const LOG = 'p04';

run('P0.4 / P1.11 / P0.9a', () => {
  let seed: Seed;

  async function makeWo(tag: string): Promise<{ woId: string; materialId: string; lpId: string }> {
    const woId = randomUUID();
    const materialId = randomUUID();
    const lpId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
       values ($1, $2, $3, $4, $5, 'fg', 100, 'kg', 'RELEASED')`,
      [woId, seed.orgId, seed.siteId, `WO-${tag}-${woId.slice(0, 6)}`, seed.fgItemId],
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
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, location_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status)
       values ($1, $2, $3, $4, $5, $6, $7, 100, 0, 'kg', 'available', 'released')`,
      [lpId, seed.orgId, seed.siteId, seed.warehouseId, seed.locationId, `LP-${tag}-${lpId.slice(0, 6)}`, seed.rawItemId],
    );
    return { woId, materialId, lpId };
  }

  const doOutput = (woId: string, body: Record<string, unknown>) =>
    withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await registerOutput({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          output_type: 'primary',
          product_id: seed.fgItemId,
          ...body,
        });
      } catch (err) {
        return { error: String(err) };
      }
    });

  beforeAll(async () => {
    seed = await seedOrg('p04');
    await setPin(seed.userId, PIN);
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
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('P1.11 — output 1.2345 kg: jakie wartości trafiają do trzech tabel?', async () => {
    const { woId, materialId, lpId } = await makeWo('S');
    await recordDesktopConsumption({ woId, materialId, qty: '10', lpId, clientOpId: `p11-${randomUUID()}` });
    const out = await doOutput(woId, { qty_kg: '1.2345' });
    report(LOG, 'P1.11 registerOutput 1.2345 ->', out);
    const outLp = (out as { lp_id?: string }).lp_id ?? null;
    const { rows } = await seed.ownerPool.query(
      `select o.qty_kg::text as wo_outputs_qty, o.uom as wo_outputs_uom,
              lp.quantity::text as lp_qty, lp.uom as lp_uom,
              sm.quantity::text as move_qty, sm.uom as move_uom
         from public.wo_outputs o
         left join public.license_plates lp on lp.id = o.lp_id
         left join public.stock_moves sm on sm.lp_id = o.lp_id
        where o.org_id = $1 and o.lp_id = $2::uuid`,
      [seed.orgId, outLp],
    );
    report(LOG, 'P1.11 skala w trzech tabelach', rows);
    expect(out).toBeTruthy();
  });

  it('P1.11b — qtyUnits=2 box + sprzeczne uom: co ląduje w bazie?', async () => {
    await seed.ownerPool.query(
      `update public.items set output_uom = 'box', net_qty_per_each = 15, each_per_box = 10 where id = $1`,
      [seed.fgItemId],
    );
    const { woId, materialId, lpId } = await makeWo('U');
    await recordDesktopConsumption({ woId, materialId, qty: '100', lpId, clientOpId: `p11b-${randomUUID()}` });
    const out = await doOutput(woId, { qty_kg: '300', uom: 'box' });
    report(LOG, 'P1.11b registerOutput qty_kg=300 ale uom=box ->', out);
    const outLp = (out as { lp_id?: string }).lp_id ?? null;
    const { rows } = await seed.ownerPool.query(
      `select o.qty_kg::text as wo_outputs_qty, o.uom as wo_outputs_uom,
              lp.quantity::text as lp_qty, lp.uom as lp_uom,
              sm.quantity::text as move_qty, sm.uom as move_uom
         from public.wo_outputs o
         left join public.license_plates lp on lp.id = o.lp_id
         left join public.stock_moves sm on sm.lp_id = o.lp_id
        where o.org_id = $1 and o.lp_id = $2::uuid`,
      [seed.orgId, outLp],
    );
    report(LOG, 'P1.11b zapisana ilość i UOM', rows);
    await seed.ownerPool.query(
      `update public.items set output_uom = 'base', net_qty_per_each = null, each_per_box = null where id = $1`,
      [seed.fgItemId],
    );
    expect(out).toBeTruthy();
  });

  it('P0.4 — voidWoOutput z replacement 8 kg: czy replacement dostaje LP i receipt?', async () => {
    const { woId, materialId, lpId } = await makeWo('R');
    await recordDesktopConsumption({ woId, materialId, qty: '10', lpId, clientOpId: `p04-${randomUUID()}` });
    const out = await doOutput(woId, { qty_kg: '10' });
    report(LOG, 'P0.4 registerOutput 10 kg ->', out);
    const outLp = (out as { lp_id?: string }).lp_id ?? null;
    const outputId = (out as { output_id?: string }).output_id ?? null;

    const before = await seed.ownerPool.query(
      `select id::text, quantity::text as q, status from public.license_plates where org_id = $1 and product_id = $2`,
      [seed.orgId, seed.fgItemId],
    );
    report(LOG, 'P0.4 PRZED — LP produktu gotowego', before.rows);

    const voided = outputId
      ? await voidWoOutput({
          outputId,
          reasonCode: 'wrong_quantity',
          note: 'sonda P0.4',
          signature: { password: PIN },
          replacement: { qtyKg: '8' },
        })
      : { skipped: 'brak output_id' };
    report(LOG, 'P0.4 voidWoOutput(replacement 8 kg) ->', voided);

    const { rows: outputs } = await seed.ownerPool.query(
      `select qty_kg::text as q, lp_id::text, correction_of_id::text from public.wo_outputs where org_id = $1 order by created_at`,
      [seed.orgId],
    );
    const { rows: lps } = await seed.ownerPool.query(
      `select id::text, quantity::text as q, status from public.license_plates where org_id = $1 and product_id = $2`,
      [seed.orgId, seed.fgItemId],
    );
    const { rows: moves } = await seed.ownerPool.query(
      `select move_type, quantity::text as quantity, reason_code, lp_id::text
         from public.stock_moves where org_id = $1 and lp_id = $2::uuid order by created_at`,
      [seed.orgId, outLp],
    );
    report(LOG, 'P0.4 PO', { wo_outputs: outputs, license_plates: lps, ruchy_oryginalnego_LP: moves });
    expect(outputs).toBeTruthy();
  });

  it('P0.9a — czy syntetyczny historyczny receipt zmienia ilość po konsumpcji?', async () => {
    const { woId, materialId, lpId } = await makeWo('H');
    await recordDesktopConsumption({ woId, materialId, qty: '10', lpId, clientOpId: `p09a-${randomUUID()}` });
    const out = await doOutput(woId, { qty_kg: '100' });
    const outLp = (out as { lp_id?: string }).lp_id ?? null;
    report(LOG, 'P0.9a registerOutput 100 kg ->', out);

    const findRow = (listed: unknown) =>
      (listed as { data?: { items?: Array<Record<string, unknown>> } })?.data?.items
        ?.filter((i) => i.lpId === outLp)
        .map((i) => ({ source: i.source, moveType: i.moveType, quantity: i.quantity }));

    report(LOG, 'P0.9a unified PRZED konsumpcją', findRow(await listStockMoves({ limit: 200 })));

    await seed.ownerPool.query(
      `update public.license_plates set status = 'available', qa_status = 'released' where id = $1`,
      [outLp],
    );
    await seed.ownerPool
      .query(`insert into public.waste_categories (id, org_id, code, name, is_active) values ($1, $2, 'trim', 'Trim', true)`, [
        randomUUID(),
        seed.orgId,
      ])
      .catch(() => undefined);
    const cons = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await recordWaste({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          category_code: 'trim',
          qty_kg: '40',
          shift_id: 'A',
          lp_id: outLp!,
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'P0.9a waste 40 kg z output LP (zmniejsza LP) ->', cons);

    const { rows: lpNow } = await seed.ownerPool.query(
      `select quantity::text as q from public.license_plates where id = $1::uuid`,
      [outLp],
    );
    report(LOG, 'P0.9a LP PO konsumpcji', lpNow);
    report(LOG, 'P0.9a unified PO konsumpcji', findRow(await listStockMoves({ limit: 200 })));
    expect(cons).toBeTruthy();
  });
});
