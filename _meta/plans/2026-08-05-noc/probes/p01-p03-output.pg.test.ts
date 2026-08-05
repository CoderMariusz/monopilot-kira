/**
 * P0.1 — output > konsumpcja (mass balance jako ostrzeżenie, nie bramka)
 * P0.3 — anulowanie zakończonego WO zeruje output LP bez ruchu straty
 *
 * Prawdziwe ścieżki: recordDesktopConsumption, registerOutput, completeWo, cancelWo.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, snapshot, report, type Seed } from './seed';
import { withOrgContext } from '../../../../apps/web/lib/auth/with-org-context';
import { registerOutput } from '../../../../apps/web/lib/production/output/register-output';
import { completeWo, cancelWo } from '../../../../apps/web/lib/production/complete-cancel-wo';
import { recordDesktopConsumption } from '../../../../apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const LOG = 'p01';

async function makeWo(seed: Seed, tag: string): Promise<{ woId: string; materialId: string; lpId: string }> {
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
     values ($1, $2, $3, $4, $5, $6, $7, 100, 0, 'kg', 'available', 'released')`,
    [lpId, seed.orgId, seed.siteId, seed.warehouseId, seed.locationId, `LP-${tag}-${lpId.slice(0, 6)}`, seed.rawItemId],
  );
  return { woId, materialId, lpId };
}

run('P0.1 / P0.3 — output + cancel completed WO', () => {
  let seed: Seed;

  beforeAll(async () => {
    seed = await seedOrg('p01');
    // WAC dla surowca — bez niego registerOutput blokuje sie na 'wac_un_costed'
    // (bramka KOSZTOWA, nie mass-balance). Chcemy testowac mass-balance.
    const { rows: cur } = await seed.ownerPool.query<{ id: string }>(
      `select id::text from public.currencies where code = 'GBP' limit 1`,
    );
    for (const site of [seed.siteId, null]) {
      await seed.ownerPool.query(
        `insert into public.item_wac_state (org_id, site_id, item_id, currency_id, total_qty_kg, total_value, avg_cost)
         values ($1, $2, $3, $4, 10000, 10000, 1)`,
        [seed.orgId, site, seed.rawItemId, cur[0]!.id],
      ).catch(() => undefined);
    }
    await seed.ownerPool.query(
      `update public.items set cost_per_kg = 1 where org_id = $1`,
      [seed.orgId],
    ).catch(() => undefined);
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('P0.1a — konsumpcja 100 kg, output 103 kg: blokada czy ostrzeżenie?', async () => {
    const { woId, materialId, lpId } = await makeWo(seed, 'A');
    const cons = await recordDesktopConsumption({
      woId,
      materialId,
      qty: '100',
      lpId,
      clientOpId: `p01a-${randomUUID()}`,
    });
    report(LOG, 'P0.1a konsumpcja 100 kg ->', cons);
    report(LOG, 'P0.1a PO KONSUMPCJI', await snapshot(seed));

    const out = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await registerOutput({ userId, orgId, client } as never, woId, {
          transaction_id: randomUUID(),
          output_type: 'primary',
          product_id: seed.fgItemId,
          qty_kg: '103',
        });
      } catch (err) {
        return { error: String(err) };
      }
    });
    report(LOG, 'P0.1a registerOutput 103 kg ->', out);
    report(LOG, 'P0.1a PO OUTPUCIE', await snapshot(seed));

    const { rows: cfg } = await seed.ownerPool.query(
      `select key, value from public.org_settings where org_id = $1 and key ilike '%yield%'`,
      [seed.orgId],
    ).catch(() => ({ rows: [{ key: 'n/a', value: 'brak tabeli org_settings' }] }));
    report(LOG, 'P0.1a konfiguracja progu', cfg);
    expect(out).toBeTruthy();
  });

  it('P0.1b — ZERO konsumpcji, output 100 kg: czy gate w ogóle patrzy?', async () => {
    const { woId } = await makeWo(seed, 'B');
    const before = await snapshot(seed);
    report(LOG, 'P0.1b PRZED (zero konsumpcji)', before);

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
    report(LOG, 'P0.1b registerOutput 100 kg bez wejscia ->', out);
    report(LOG, 'P0.1b PO', await snapshot(seed));
    expect(out).toBeTruthy();
  });

  it('P0.1c — z WŁĄCZONYM progiem massbalance_threshold_pct=1: co blokuje?', async () => {
    await seed.ownerPool.query(
      `insert into public.tenant_variations (org_id, dept_overrides, rule_variant_overrides, feature_flags, schema_extensions_count)
       values ($1, '{}'::jsonb, '{}'::jsonb, '{"massbalance_threshold_pct":"1"}'::jsonb, 0)
       on conflict (org_id) do update set feature_flags = excluded.feature_flags`,
      [seed.orgId],
    );

    const a = await makeWo(seed, 'D');
    await recordDesktopConsumption({
      woId: a.woId, materialId: a.materialId, qty: '100', lpId: a.lpId,
      clientOpId: `p01c-a-${randomUUID()}`,
    });
    const outA = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await registerOutput({ userId, orgId, client } as never, a.woId, {
          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.fgItemId, qty_kg: '103',
        });
      } catch (err) { return { error: String(err) }; }
    });
    report(LOG, 'P0.1c 103 kg przy 100 kg konsumpcji, prog=1% ->', outA);

    const b = await makeWo(seed, 'E');
    const outB = await withOrgContext(async ({ userId, orgId, client }) => {
      try {
        return await registerOutput({ userId, orgId, client } as never, b.woId, {
          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.fgItemId, qty_kg: '100',
        });
      } catch (err) { return { error: String(err) }; }
    });
    report(LOG, 'P0.1c 100 kg przy ZEROWEJ konsumpcji, prog=1% ->', outB);

    await seed.ownerPool.query(`delete from public.tenant_variations where org_id = $1`, [seed.orgId]);
    expect(outB).toBeTruthy();
  });

  it('P0.3 — completeWo, potem cancelWo: czy zerowanie LP ma ruch straty?', async () => {
    const { woId, materialId, lpId } = await makeWo(seed, 'C');
    await recordDesktopConsumption({
      woId,
      materialId,
      qty: '100',
      lpId,
      clientOpId: `p03-${randomUUID()}`,
    });
    const outputRes = await withOrgContext(async ({ userId, orgId, client }) => {
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
    report(LOG, 'P0.3 registerOutput 100 kg ->', outputRes);

    const completed = await withOrgContext(async ({ userId, orgId, client }) =>
      completeWo({ userId, orgId, client } as never, {
        woId,
        transactionId: randomUUID(),
      } as never),
    );
    report(LOG, 'P0.3 completeWo ->', completed);
    const { rows: execRows } = await seed.ownerPool.query(
      `select status from public.wo_executions where wo_id = $1::uuid`,
      [woId],
    );
    report(LOG, 'P0.3 status wykonania WO', execRows);
    const outLpId = (outputRes as { lp_id?: string }).lp_id ?? null;
    report(LOG, 'P0.3 output LP id', outLpId);

    const before = await snapshot(seed);
    report(LOG, 'P0.3 PRZED ANULOWANIEM', before);

    const cancelled = await withOrgContext(async ({ userId, orgId, client }) =>
      cancelWo({ userId, orgId, client } as never, {
        woId,
        transactionId: randomUUID(),
        reasonCode: 'entry_error',
        notes: 'sonda P0.3',
      }),
    );
    report(LOG, 'P0.3 cancelWo ->', cancelled);

    const after = await snapshot(seed);
    report(LOG, 'P0.3 PO ANULOWANIU', after);

    const { rows: byType } = await seed.ownerPool.query(
      `select move_type, reason_code, sum(quantity)::text as suma, count(*)::text as n
         from public.stock_moves where org_id = $1 group by 1,2 order by 1,2`,
      [seed.orgId],
    );
    report(LOG, 'P0.3 ruchy wg typu (cala org)', byType);
    if (outLpId) {
      const { rows: lpRow } = await seed.ownerPool.query(
        `select quantity::text as q, status from public.license_plates where id = $1::uuid`,
        [outLpId],
      );
      const { rows: mv } = await seed.ownerPool.query(
        `select move_type, quantity::text as quantity, reason_code, status
           from public.stock_moves where org_id = $1 and lp_id = $2::uuid order by created_at`,
        [seed.orgId, outLpId],
      );
      report(LOG, 'P0.3 output LP + jego ruchy PO ANULOWANIU', { lp: lpRow, moves: mv });
    }
    expect(after).toBeTruthy();
  });
});
