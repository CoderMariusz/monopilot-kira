import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withAppOrg,
} from '../../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../tests/helpers/owner-org-context.js';
import { resolveOutputWacContribution } from '../resolve-output-wac';
import {
  applyConsumptionWacReversal,
  applyOutputWacReversal,
  upsertWac,
} from '../upsert-wac';

const run = databaseUrl ? describe : describe.skip;
let orgId: string;
let siteId: string;
let userId: string;
const rawMaterialId = randomUUID();
const finishedGoodId = randomUUID();

let owner: pg.Pool;
let app: pg.Pool;
let fixture: PgTestFixture;

async function makeWorkOrder(): Promise<string> {
  const woId = randomUUID();
  await owner.query(
    `insert into public.work_orders
       (id, org_id, site_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
     values ($1, $2, $3, $4, $5, 'fg', 100, 'kg', 'IN_PROGRESS')`,
    [woId, orgId, siteId, `WAC-RESOLVE-${woId.slice(0, 8)}`, finishedGoodId],
  );
  return woId;
}

async function addConsumption(woId: string, correctionOfId: string | null = null): Promise<string> {
  const id = randomUUID();
  await owner.query(
    `insert into public.wo_material_consumption
       (id, org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom,
        fefo_adherence_flag, correction_of_id, ext_jsonb)
     values ($1, $2, $3, $4, $5, $6, $7, 'kg', true, $8, $9::jsonb)`,
    [
      id,
      orgId,
      randomUUID(),
      woId,
      rawMaterialId,
      randomUUID(),
      correctionOfId ? '-100' : '100',
      correctionOfId,
      JSON.stringify({ wac_qty_kg: '100.000', wac_value: '500.0000' }),
    ],
  );
  return id;
}

async function addOutput(woId: string, correctionOfId: string | null = null): Promise<string> {
  const id = randomUUID();
  await owner.query(
    `insert into public.wo_outputs
       (id, org_id, site_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg,
        uom, qa_status, correction_of_id, ext_jsonb, registered_by, created_by, updated_by)
     values ($1, $2, $3, $4, $5, 'primary', $6, $7, $8, 'kg', $9, $10, $11::jsonb, $12, $12, $12)`,
    [
      id,
      orgId,
      siteId,
      randomUUID(),
      woId,
      finishedGoodId,
      `WAC-${correctionOfId ? 'VOID' : 'OUT'}-${id.slice(0, 8)}`,
      correctionOfId ? '-100' : '100',
      correctionOfId ? 'PASSED' : 'PENDING',
      correctionOfId,
      JSON.stringify(
        correctionOfId
          ? { corrected_output_id: correctionOfId }
          : { wac_qty_kg: '100.000', wac_value: '500.0000' },
      ),
      userId,
    ],
  );
  return id;
}

async function readWacPool(itemId: string): Promise<
  Array<{ total_qty_kg: string; total_value: string; avg_cost: string }>
> {
  const { rows } = await owner.query<{
    total_qty_kg: string;
    total_value: string;
    avg_cost: string;
  }>(
    `select total_qty_kg::text, total_value::text, avg_cost::text
       from public.item_wac_state
      where org_id = $1::uuid
        and item_id = $2::uuid`,
    [orgId, itemId],
  );
  return rows;
}

run('resolveOutputWacContribution correction history — real Postgres', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await ensureAppUser(owner);
    fixture = await createPgTestFixture(owner, { permissions: ['production.wo.cancel'] });
    ({ orgId, siteId, userId } = fixture);
    await owner.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, cost_per_kg, weight_mode, created_by)
       values
         ($1, $2, $3, 'rm', 'Output WAC RM', 'kg', 5, 'fixed', $4),
         ($5, $2, $6, 'fg', 'Output WAC FG', 'kg', null, 'fixed', $4)`,
      [
        rawMaterialId,
        orgId,
        `WAC-RM-${rawMaterialId.slice(0, 8)}`,
        userId,
        finishedGoodId,
        `WAC-FG-${finishedGoodId.slice(0, 8)}`,
      ],
    );
    await owner.query(
      `insert into public.currencies (code, name)
       values ('GBP', 'Pound Sterling')
       on conflict (code) do nothing`,
    );
  }, 120_000);

  afterEach(async () => {
    await owner.query(`delete from public.item_wac_state where org_id = $1`, [orgId]);
    await owner.query(`delete from public.wo_outputs where org_id = $1`, [orgId]);
    await owner.query(`delete from public.wo_material_consumption where org_id = $1`, [orgId]);
    await owner.query(`delete from public.work_orders where org_id = $1`, [orgId]);
  });

  afterAll(async () => {
    await owner?.query(`delete from public.items where org_id = $1`, [orgId]).catch(() => undefined);
    await fixture?.cleanup();
    await app?.end();
    await owner?.end();
  });

  it('keeps normal valuation and revalues output after its void', async () => {
    const woId = await makeWorkOrder();
    await addConsumption(woId);

    await withAppOrg(owner, app, orgId, async (client) => {
      const first = await resolveOutputWacContribution(client, {
        woId,
        qtyKg: '100',
        standardCostPerKg: null,
      });
      expect(first).toMatchObject({ applied: true, source: 'wo_computed' });
      if (!first.applied) return;

      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: finishedGoodId,
        deltaQtyKg: first.deltaQtyKg,
        deltaValue: first.deltaValue,
        updatedBy: userId,
      });
    });
    expect(await readWacPool(finishedGoodId)).toEqual([
      { total_qty_kg: '100.000', total_value: '500.0000', avg_cost: '5.000000' },
    ]);

    const originalOutputId = await addOutput(woId);
    await withAppOrg(owner, app, orgId, async (client) => {
      const reversal = await applyOutputWacReversal(client, {
        orgId,
        siteId: null,
        itemId: finishedGoodId,
        extJsonb: { wac_qty_kg: '100.000', wac_value: '500.0000' },
        fallbackQtyKg: '100',
        fallbackValue: '500',
        updatedBy: userId,
      });
      expect(reversal).toMatchObject({
        applied: true,
        deltaQtyKg: '-100.000',
        deltaValue: '-500.0000',
      });
    });
    await addOutput(woId, originalOutputId);
    expect(await readWacPool(finishedGoodId)).toEqual([
      { total_qty_kg: '0.000', total_value: '0.0000', avg_cost: '0.000000' },
    ]);

    await withAppOrg(owner, app, orgId, async (client) => {
      const reRegistered = await resolveOutputWacContribution(client, {
        woId,
        qtyKg: '100',
        standardCostPerKg: null,
      });
      expect(reRegistered).toMatchObject({ applied: true, source: 'wo_computed' });
      if (!reRegistered.applied) return;

      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: finishedGoodId,
        deltaQtyKg: reRegistered.deltaQtyKg,
        deltaValue: reRegistered.deltaValue,
        updatedBy: userId,
      });
    });
    expect(await readWacPool(finishedGoodId)).toEqual([
      { total_qty_kg: '100.000', total_value: '500.0000', avg_cost: '5.000000' },
    ]);
  });

  it('does not value output from fully reversed consumption', async () => {
    const woId = await makeWorkOrder();
    const originalConsumptionId = await addConsumption(woId);

    await withAppOrg(owner, app, orgId, async (client) => {
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: rawMaterialId,
        deltaQtyKg: '100',
        deltaValue: '500',
        updatedBy: userId,
      });
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: rawMaterialId,
        deltaQtyKg: '-100',
        deltaValue: '-500',
        updatedBy: userId,
      });
      const reversal = await applyConsumptionWacReversal(client, {
        orgId,
        siteId: null,
        itemId: rawMaterialId,
        extJsonb: { wac_qty_kg: '100.000', wac_value: '500.0000' },
        fallbackQty: '100',
        fallbackUom: 'kg',
        updatedBy: userId,
      });
      expect(reversal).toMatchObject({
        applied: true,
        deltaQtyKg: '100.000',
        deltaValue: '500.0000',
        source: 'snapshot',
      });
    });
    await addConsumption(woId, originalConsumptionId);

    expect(await readWacPool(rawMaterialId)).toEqual([
      { total_qty_kg: '100.000', total_value: '500.0000', avg_cost: '5.000000' },
    ]);

    const result = await withAppOrg(owner, app, orgId, async (client) => {
      const resolution = await resolveOutputWacContribution(client, {
        woId,
        qtyKg: '100',
        standardCostPerKg: null,
      });
      if (resolution.applied) {
        await upsertWac(client, {
          orgId,
          siteId: null,
          itemId: finishedGoodId,
          deltaQtyKg: resolution.deltaQtyKg,
          deltaValue: resolution.deltaValue,
          updatedBy: userId,
        });
      }
      return resolution;
    });

    expect(result).toEqual({ applied: false, excluded: 'un_costed', unCostedLines: [] });
    expect(await readWacPool(finishedGoodId)).toEqual([]);
  });
});
