/**
 * N-NPD-2 — cost-readiness gate honours locked recipe version (parity with nutrition).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  makeAppUserConnectionString,
  makeIdentitySeed,
  seedIdentities,
  withAppOrg,
} from '../../../brief/actions/__tests__/brief-integration-helpers';
import { checkCostingNutritionReady } from '../_lib/gate-helpers';

if (!databaseUrl) {
  throw new Error('gate-helpers-cost-readiness.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const seed = makeIdentitySeed();
const projectId = randomUUID();
const formulationId = randomUUID();
const versionV1 = randomUUID();
const versionV2 = randomUUID();
const productCode = `FG-NPD2-${randomUUID().slice(0, 8).toUpperCase()}`;

let owner: pg.Pool;
let app: pg.Pool;

async function callReadiness(): Promise<{ costReady: boolean; nutritionReady: boolean }> {
  return withAppOrg(owner, app, seed.orgAId, async (client) =>
    checkCostingNutritionReady({ client }, projectId),
  );
}

describe('checkCostingNutritionReady — locked recipe version parity (N-NPD-2)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities(owner, seed);

    await owner.query(
      `insert into public.product (org_id, product_code, product_name, product_type)
       values ($1::uuid, $2, 'N-NPD-2 readiness', 'fg')
       on conflict (org_id, product_code) do nothing`,
      [seed.orgAId, productCode],
    );
    await owner.query(
      `insert into public.npd_projects
         (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
       values ($1::uuid, $2::uuid, $3, 'N-NPD-2 readiness', 'Recipe Standard', 'G3', 'costing_nutrition', $4, $5::uuid)`,
      [projectId, seed.orgAId, `NPD-NPD2-${randomUUID().slice(0, 8)}`, productCode, seed.userAId],
    );
    await owner.query(
      `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
      [formulationId, seed.orgAId, projectId, productCode, seed.userAId],
    );
    await owner.query(
      `insert into public.formulation_versions
         (id, formulation_id, version_number, state, batch_size_kg, created_by_user)
       values
         ($1::uuid, $2::uuid, 1, 'locked', 10.000, $3::uuid),
         ($4::uuid, $2::uuid, 2, 'locked', 10.000, $3::uuid)`,
      [versionV1, formulationId, seed.userAId, versionV2],
    );
    await owner.query(
      `update public.formulations
          set current_version_id = $2::uuid,
              locked_at = now() - interval '1 hour'
        where id = $1::uuid`,
      [formulationId, versionV2],
    );
    // Stale target breakdown computed before the current locked version was locked.
    await owner.query(
      `insert into public.costing_breakdowns
         (org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur, computed_at)
       values ($1::uuid, $2, 'target', 1.5000, 25.0000, 2.0000, now() - interval '2 days')
       on conflict (org_id, product_code, scenario) do update
         set computed_at = excluded.computed_at`,
      [seed.orgAId, productCode],
    );
    // Nutrition exists only for superseded v1 — mirrors the stale-cost scenario.
    await owner.query(
      `insert into public.nutri_score_results
         (org_id, product_code, formulation_version_id, grade, computed_score)
       values ($1::uuid, $2, $3::uuid, 'B', 72)
       on conflict do nothing`,
      [seed.orgAId, productCode, versionV1],
    );
  });

  afterAll(async () => {
    await owner.query(`delete from public.nutri_score_results where product_code = $1`, [productCode]);
    await owner.query(`delete from public.costing_breakdowns where product_code = $1`, [productCode]);
    await owner.query(`delete from public.formulation_ingredients where version_id in ($1::uuid, $2::uuid)`, [
      versionV1,
      versionV2,
    ]);
    await owner.query(`delete from public.formulation_versions where formulation_id = $1::uuid`, [formulationId]);
    await owner.query(`delete from public.formulations where id = $1::uuid`, [formulationId]);
    await owner.query(`delete from public.npd_projects where id = $1::uuid`, [projectId]);
    await owner.query(`delete from public.product where org_id = $1::uuid and product_code = $2`, [
      seed.orgAId,
      productCode,
    ]);
    await owner.query(`delete from public.organizations where id = $1::uuid`, [seed.orgAId]);
    await owner.query(`delete from public.tenants where id = $1::uuid`, [seed.tenantId]);
    await app?.end();
    await owner?.end();
  });

  it('rejects stale target cost when locked recipe is a newer version', async () => {
    const readiness = await callReadiness();
    expect(readiness.costReady).toBe(false);
    expect(readiness.nutritionReady).toBe(false);
  });

  it('passes cost readiness after target breakdown is recomputed for the locked version', async () => {
    await owner.query(
      `update public.costing_breakdowns
          set computed_at = now()
        where org_id = $1::uuid
          and product_code = $2
          and lower(scenario) = 'target'`,
      [seed.orgAId, productCode],
    );

    const afterCost = await callReadiness();
    expect(afterCost.costReady).toBe(true);
    expect(afterCost.nutritionReady).toBe(false);
  });

  it('passes both gates when nutrition is computed for the locked version', async () => {
    await owner.query(
      `insert into public.nutri_score_results
         (org_id, product_code, formulation_version_id, grade, computed_score)
       values ($1::uuid, $2, $3::uuid, 'A', 85)
       on conflict do nothing`,
      [seed.orgAId, productCode, versionV2],
    );

    const ready = await callReadiness();
    expect(ready.costReady).toBe(true);
    expect(ready.nutritionReady).toBe(true);
  });
});
