/**
 * P0.2 — disassembly: output > input to tylko ostrzeżenie, a nowe LP nie dostają
 * kanonicznych receipt moves.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, snapshot, report, type Seed } from './seed';
import { withOrgContext } from '../../../../apps/web/lib/auth/with-org-context';
import { registerDisassemblyOutput } from '../../../../apps/web/lib/production/output/register-disassembly-output';
import { recordDesktopConsumption } from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const LOG = 'p02';

run('P0.2 — disassembly', () => {
  let seed: Seed;
  let woId: string;
  let materialId: string;
  let lpId: string;
  let coA: string;
  let coB: string;
  let coC: string;

  beforeAll(async () => {
    seed = await seedOrg('p02');
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

    coA = randomUUID();
    coB = randomUUID();
    coC = randomUUID();
    const short = seed.orgId.slice(0, 8);
    await seed.ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status, cost_per_kg)
       values ($1, $4, $5, 'co_product', 'Co A', 'kg', 'active', 1),
              ($2, $4, $6, 'co_product', 'Co B', 'kg', 'active', 1),
              ($3, $4, $7, 'byproduct',  'Co C', 'kg', 'active', 1)`,
      [coA, coB, coC, seed.orgId, `COA-${short}`, `COB-${short}`, `COC-${short}`],
    );

    const bomId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.bom_headers (id, org_id, bom_type, status, version, item_id, approved_by, approved_at)
       values ($1, $2, 'disassembly', 'active', 1, $3, $4, now())`,
      [bomId, seed.orgId, seed.fgItemId, seed.userId],
    );
    // BOM z JEDNYM co-produktem: unikalny indeks uq_wo_outputs_disassembly_input
    // dopuszcza tylko jeden wiersz wo_outputs na (wo, input LP), a walidacja
    // wymaga KOMPLETU co-produktów — wielo-co-produktowy demontaż jest niewykonalny.
    for (const [item, pct] of [[coA, '100']] as const) {
      await seed.ownerPool.query(
        `insert into public.bom_co_products (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct)
         values ($1, $2, $3, 1, 'kg', $4::numeric, $5)`,
        [seed.orgId, bomId, item, pct, item === coC],
      );
    }

    woId = randomUUID();
    materialId = randomUUID();
    lpId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status, active_bom_header_id)
       values ($1, $2, $3, $4, $5, 'fg', 100, 'kg', 'RELEASED', $6)`,
      [woId, seed.orgId, seed.siteId, `WO-DIS-${woId.slice(0, 6)}`, seed.fgItemId, bomId],
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
      [lpId, seed.orgId, seed.siteId, seed.warehouseId, seed.locationId, `LPD-${lpId.slice(0, 6)}`, seed.rawItemId],
    );
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('input 100 kg → outputy 50+30+25 = 105 kg: blokada czy ostrzeżenie? są receipt moves?', async () => {
    const cons = await recordDesktopConsumption({
      woId,
      materialId,
      qty: '100',
      lpId,
      clientOpId: `p02-${randomUUID()}`,
    });
    report(LOG, 'konsumpcja 100 kg z LP ->', cons);
    report(LOG, 'PRZED DISASSEMBLY', await snapshot(seed));

    const res = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await registerDisassemblyOutput({ userId, orgId, client } as never, {
          woId,
          inputLpId: lpId,
          outputs: [{ coProductItemId: coA, qtyKg: '105' }],
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'registerDisassemblyOutput 1x105 kg z wejscia 100 kg ->', res);
    report(LOG, 'PO DISASSEMBLY', await snapshot(seed));

    const { rows: byType } = await seed.ownerPool.query(
      `select move_type, reason_code, sum(quantity)::text as suma, count(*)::text as n
         from public.stock_moves where org_id = $1 group by 1,2 order by 1,2`,
      [seed.orgId],
    );
    const { rows: newLps } = await seed.ownerPool.query(
      `select lp.lp_number, lp.quantity::text as q, lp.status,
              (select count(*) from public.stock_moves sm where sm.lp_id = lp.id)::text as ruchy
         from public.license_plates lp
        where lp.org_id = $1 and lp.product_id = any($2::uuid[])`,
      [seed.orgId, [coA, coB, coC]],
    );
    report(LOG, 'ruchy wg typu / nowe LP co-produktów', { byType, newLps });
    expect(res).toBeTruthy();
  });
});
