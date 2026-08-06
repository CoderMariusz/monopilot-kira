/**
 * 03-technical Recipe costing — BOM line UoM ↔ per-base-unit cost, REAL DB.
 *
 * The roll-up multiplies a BOM line quantity by `v_item_effective_cost.amount`,
 * which is quoted per the COMPONENT ITEM'S BASE UoM (item_cost_history.cost_per_kg
 * for a kg-based item). `bom_lines.quantity` is denominated in `bom_lines.uom`,
 * which is free to differ (spices are dosed in grams). Multiplying the two
 * without converting inflates the cost by the unit factor — 200 g at 5.00/kg
 * used to return 1000.00 instead of 1.00, a 1000x error on every recipe that
 * doses anything in a non-base unit.
 *
 * Four measurements, all through the real getRecipeCost() Server Action under
 * withOrgContext + RLS (no mocks, no hand-rolled SQL):
 *   1. g → kg   : 200 g @ 5.00/kg  → 1.00   (the defect)
 *   2. kg → kg  : 2 kg  @ 5.00/kg  → 10.00  (control — the path that already
 *                 worked must return the SAME number after the fix)
 *   3. pcs → pcs: 200 pcs @ 0.02/pcs → 4.00 (control — a count-grain item is
 *                 already in its base unit; converting it to kg would have
 *                 silently frozen this line)
 *   4. pcs → kg with no unit mass: NOT convertible → lineCost null → the screen
 *                 renders `uncosted` (amber) and "Costed 3/4". Never guessed.
 *
 * Plus a cross-check that the SQL conversion agrees with the committed JS
 * helper `normalizeItemQuantityToBase` on the same fixture, so the two
 * implementations of the item-master UoM allow-list cannot drift apart silently.
 *
 * Skips automatically when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
  withAppOrg,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { normalizeItemQuantityToBase } from '../../../../../../../lib/uom/convert';
import { getRecipeCost } from '../_actions/list-recipe-cost';
import { listPortfolioCost } from '../portfolio/_actions/list-portfolio-cost';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  userId: randomUUID(),
  roleId: randomUUID(),
  fgId: randomUUID(),
  spiceId: randomUUID(),
  porkId: randomUUID(),
  labelId: randomUUID(),
  mysteryId: randomUUID(),
  bomId: randomUUID(),
};

const FG_CODE = `FG-QTY-${seed.fgId.slice(0, 8)}`;
const SPICE_CODE = `RM-PEPPER-${seed.spiceId.slice(0, 8)}`;
const PORK_CODE = `RM-PORK-${seed.porkId.slice(0, 8)}`;
const LABEL_CODE = `PM-LABEL-${seed.labelId.slice(0, 8)}`;
const MYSTERY_CODE = `RM-CASING-${seed.mysteryId.slice(0, 8)}`;

let owner: pg.Pool;
let app: pg.Pool;

async function seedFixtures(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Recipe UoM Tenant', 'eu', 'https://recipe-uom.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Recipe UoM Org', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `recipe-uom-${seed.orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, 'recipe-uom-it', false, 'recipe-uom-it', 'Recipe UoM IT', '[]'::jsonb, false, 40)
     on conflict (id) do nothing`,
    [seed.roleId, seed.orgId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'Recipe UoM User', 'Recipe UoM User', $4)
     on conflict (id) do nothing`,
    [seed.userId, seed.orgId, `recipe-uom-${seed.userId}@example.test`, seed.roleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3)
     on conflict (user_id, role_id) do nothing`,
    [seed.userId, seed.roleId, seed.orgId],
  );

  // Unit catalogue: kg is the mass base, g is 1/1000 of it; pcs is the count base.
  await owner.query(
    `insert into public.unit_of_measure (org_id, category, code, name, factor_to_base, is_base)
     values ($1, 'mass', 'kg', 'Kilogram', 1, true),
            ($1, 'mass', 'g', 'Gram', 0.001, false),
            ($1, 'count', 'pcs', 'Pieces', 1, true)
     on conflict (org_id, code) do nothing`,
    [seed.orgId],
  );

  await owner.query(
    `insert into public.items
       (id, org_id, item_code, item_type, name, uom_base, uom_secondary, output_uom, net_qty_per_each)
     values
       ($1,  $2, $3,  'fg',         'Cooked sausage', 'kg',  null, 'base', null),
       ($4,  $2, $5,  'ingredient', 'Black pepper',   'kg',  'g',  'base', null),
       ($6,  $2, $7,  'rm',         'Pork trim',      'kg',  null, 'base', null),
       ($8,  $2, $9,  'packaging',  'Label',          'pcs', null, 'base', null),
       ($10, $2, $11, 'rm',         'Casing',         'kg',  null, 'base', null)
     on conflict (id) do nothing`,
    [
      seed.fgId, seed.orgId, FG_CODE,
      seed.spiceId, SPICE_CODE,
      seed.porkId, PORK_CODE,
      seed.labelId, LABEL_CODE,
      seed.mysteryId, MYSTERY_CODE,
    ],
  );

  // Costs are per the item's BASE unit: 5.00/kg, 5.00/kg, 0.02/pcs, 3.00/kg.
  await owner.query(
    `insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
     values ($1, $2, '5.0000'::numeric, 'GBP', current_date, 'manual'),
            ($1, $3, '5.0000'::numeric, 'GBP', current_date, 'manual'),
            ($1, $4, '0.0200'::numeric, 'GBP', current_date, 'manual'),
            ($1, $5, '3.0000'::numeric, 'GBP', current_date, 'manual')`,
    [seed.orgId, seed.spiceId, seed.porkId, seed.labelId, seed.mysteryId],
  );

  await owner.query(
    // Draft: bom_lines are immutable once a header is approved/active, and both
    // roll-ups select on `status <> 'archived'`, so draft is the honest fixture.
    `insert into public.bom_headers (id, org_id, item_id, status, version, yield_pct)
     values ($1, $2, $3, 'draft', 1, 100.000)
     on conflict (id) do nothing`,
    [seed.bomId, seed.orgId, seed.fgId],
  );
  await owner.query(
    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, item_id)
     values
       ($1, $2, 1, $3, 'RM', 200,  'g',   $4),
       ($1, $2, 2, $5, 'RM', 2,    'kg',  $6),
       ($1, $2, 3, $7, 'PM', 200,  'pcs', $8),
       ($1, $2, 4, $9, 'RM', 10,   'pcs', $10)`,
    [
      seed.orgId, seed.bomId,
      SPICE_CODE, seed.spiceId,
      PORK_CODE, seed.porkId,
      LABEL_CODE, seed.labelId,
      MYSTERY_CODE, seed.mysteryId,
    ],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.bom_lines where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.bom_headers where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.item_cost_history where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.unit_of_measure where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

/** NUMERIC-exact compare — the driver returns numeric as a string, never a JS float. */
function numericEquals(actual: string | null | undefined, expected: string): boolean {
  return actual != null && Number.parseFloat(actual) === Number.parseFloat(expected);
}

run('technical recipe cost — BOM line UoM vs per-base-unit cost (real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; the action uses the withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await cleanup().catch(() => undefined);
    await seedFixtures();
    process.env.APP_USER_PASSWORD = appUserPassword;
    // eslint-disable-next-line no-restricted-syntax -- RLS-enforcing app_user pool for the convert.ts cross-check
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
  });

  afterAll(async () => {
    if (app) await app.end().catch(() => undefined);
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('1+2+3: costs each line in the component item base unit (g→kg fixed, kg and pcs unchanged)', async () => {
    const result = await withActionActor(seed.userId, seed.orgId, () => getRecipeCost(FG_CODE));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byCode = new Map(result.cost.lines.map((line) => [line.componentCode, line]));

    // 1. THE DEFECT: 200 g of a 5.00/kg spice is 1.00, not 1000.00.
    const spice = byCode.get(SPICE_CODE);
    expect(spice?.quantity).toBe('200.000000');
    expect(spice?.uom).toBe('g');
    expect(numericEquals(spice?.lineCost, '1.00')).toBe(true);

    // 2. CONTROL: the kg path already worked and must be untouched.
    const pork = byCode.get(PORK_CODE);
    expect(pork?.uom).toBe('kg');
    expect(numericEquals(pork?.lineCost, '10.00')).toBe(true);

    // 3. CONTROL: a count-grain item is already in its base unit — 200 pcs at
    //    0.02/pcs is 4.00. Converting counts to kg would have frozen this line.
    const label = byCode.get(LABEL_CODE);
    expect(label?.uom).toBe('pcs');
    expect(numericEquals(label?.lineCost, '4.00')).toBe(true);

    // Roll-up = the three costable lines only (1.00 + 10.00 + 4.00).
    expect(result.cost.currency).toBe('GBP');
    expect(numericEquals(result.cost.totalMaterialCost, '15.00')).toBe(true);
  });

  it('4: a line whose UoM cannot be reduced to the base unit is left UNCOSTED, never guessed', async () => {
    const result = await withActionActor(seed.userId, seed.orgId, () => getRecipeCost(FG_CODE));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mystery = result.cost.lines.find((line) => line.componentCode === MYSTERY_CODE);

    // 10 pcs of a kg-based casing with no net_qty_per_each: no defensible factor
    // exists. The screen shows `uncosted` (amber) + "Costed 3/4" off this null.
    expect(mystery?.uom).toBe('pcs');
    expect(mystery?.lineCost).toBeNull();
    // The unit cost itself is known (3.00/kg) — only the quantity is unusable,
    // and a silent factor of 1 would have booked a believable, wrong 30.00.
    expect(numericEquals(mystery?.unitCost, '3.00')).toBe(true);

    const costed = result.cost.lines.filter((line) => line.lineCost != null);
    expect(costed).toHaveLength(3);
    expect(result.cost.lines).toHaveLength(4);
  });

  it('the SQL conversion agrees with the committed normalizeItemQuantityToBase helper', async () => {
    const converted = await withAppOrg(owner, app, seed.orgId, (client) =>
      normalizeItemQuantityToBase(client, { itemId: seed.spiceId, quantity: '200', uom: 'g' }),
    );

    // Both paths must land on 0.2 kg — the SQL roll-up above turned it into 1.00
    // at 5.00/kg, so the two implementations of the allow-list agree.
    expect(converted).not.toBeNull();
    expect(numericEquals(converted?.quantity, '0.2')).toBe(true);
    expect(converted?.uom).toBe('kg');
  });

  it('the portfolio roll-up (same shared SQL) converts too — it is not left behind', async () => {
    const rows = await withActionActor(seed.userId, seed.orgId, () => listPortfolioCost());
    const fg = rows.find((row) => row.fg_code === FG_CODE);

    expect(fg).toBeDefined();
    expect(numericEquals(fg?.total_recipe_cost, '15.00')).toBe(true);
  });
});
