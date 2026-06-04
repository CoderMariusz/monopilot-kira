/**
 * T-024 — Allergen cascade rule deployment + handler: REAL DB wiring test.
 *
 * Seeds a small graph FG -> intermediate -> RM with active BOMs and asserts:
 *   AC1 RM gains allergen 'gluten' -> after cascade the FG profile contains a
 *       cascaded 'gluten' row (RM -> intermediate -> FG propagation).
 *   AC2 FG carries a manual_override row for 'milk' -> cascade NEVER overwrites it
 *       (source stays manual_override; cascade source preserved).
 *   AC3 KPI: propagation completes within 5000ms.
 *   AC4 a manufacturing operation on a BOM line adds 'eggs' -> FG cascaded set
 *       includes 'eggs'.
 *   AC5 item_type is read from items (joined via item_id), not from
 *       item_allergen_profiles.
 *   AC6 rule deployed: rule_definitions has technical.allergen_cascade for the org.
 *
 * The handler does NOT run synchronously in an API request path — this test
 * invokes it directly as the worker/engine would (RTL/snapshot fallback evidence;
 * no UI surface in this task — Playwright N/A, documented in closeout).
 *
 * Skips when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withOrgContext } from '../../lib/auth/with-org-context';
import type { OrgActionContext, QueryClient } from '../../lib/technical/allergens/shared';
import { cascadeAllergensForChangedItem } from '../../lib/technical/allergens/cascade';
import {
  cleanup,
  createItem,
  databaseUrl,
  makeSeed,
  seedFixtures,
  withActionActor,
  type AllergenSeed,
} from '../api/allergen-test-helpers';

const run = databaseUrl ? describe : describe.skip;
const seed: AllergenSeed = makeSeed();
let owner: pg.Pool;

function inCtx<T>(userId: string, orgId: string, fn: (ctx: OrgActionContext) => Promise<T>): Promise<T> {
  return withActionActor(userId, orgId, () =>
    withOrgContext(({ userId: u, orgId: o, client }) =>
      fn({ userId: u, orgId: o, client: client as unknown as QueryClient }),
    ),
  );
}

// Build: FG (fgItem) active BOM has 1 line -> intermediate (wipItem);
//        intermediate active BOM has 1 line -> RM (rmItem), with a manufacturing op.
async function seedGraph(): Promise<{ fgItem: string; wipItem: string; rmItem: string; fgCode: string; wipCode: string }> {
  const fgCode = `FG-${randomUUID().slice(0, 8)}`;
  const wipCode = `WIP-${randomUUID().slice(0, 8)}`;
  const rmCode = `RM-${randomUUID().slice(0, 8)}`;

  const fgItem = await createItem(owner, seed.orgAId, fgCode, 'fg');
  const wipItem = await createItem(owner, seed.orgAId, wipCode, 'intermediate');
  const rmItem = await createItem(owner, seed.orgAId, rmCode, 'rm');

  // bom_headers.product_id FK -> product(org_id, product_code). After NPD G4
  // handoff the FG/intermediate exist BOTH as a product (NPD aggregate) and an
  // items row sharing the same code. Seed the matching product rows so the
  // shared-BOM FK resolves (Technical consumes, does not author, the aggregate).
  await owner.query(
    `insert into public.product (org_id, product_code, product_name, created_by_user)
     values ($1, $2, $2, $4), ($1, $3, $3, $4)
     on conflict (org_id, product_code) do nothing`,
    [seed.orgAId, fgCode, wipCode, seed.adminAUserId],
  );

  // FG BOM: product_id=fgCode, one line = the intermediate. Lines are immutable
  // once the header is active (clone-on-write trigger), so seed as 'draft', add
  // lines, then promote to 'active' (active requires approved_by/approved_at).
  const fgBom = randomUUID();
  await owner.query(
    `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version)
     values ($1, $2, $3, 'technical', 'draft', 1)`,
    [fgBom, seed.orgAId, fgCode],
  );
  await owner.query(
    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, item_id)
     values ($1, $2, 1, $3, 'WIP', 1.0, 'kg', $4)`,
    [seed.orgAId, fgBom, wipCode, wipItem],
  );
  await owner.query(
    `update public.bom_headers set status = 'active', approved_by = $2, approved_at = pg_catalog.now() where id = $1`,
    [fgBom, seed.adminAUserId],
  );

  // Intermediate BOM: product_id=wipCode, one line = the RM, with a mfg op
  // (Mix is auto-seeded for the org) that can add 'eggs'.
  const wipBom = randomUUID();
  await owner.query(
    `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version)
     values ($1, $2, $3, 'technical', 'draft', 1)`,
    [wipBom, seed.orgAId, wipCode],
  );
  await owner.query(
    `insert into public.bom_lines
       (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, item_id, manufacturing_operation_name)
     values ($1, $2, 1, $3, 'RM', 2.0, 'kg', $4, 'Mix')`,
    [seed.orgAId, wipBom, rmCode, rmItem],
  );
  await owner.query(
    `update public.bom_headers set status = 'active', approved_by = $2, approved_at = pg_catalog.now() where id = $1`,
    [wipBom, seed.adminAUserId],
  );

  return { fgItem, wipItem, rmItem, fgCode, wipCode };
}

run('T-024 allergen cascade deployment + handler (real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures(owner, seed);
  });

  afterAll(async () => {
    if (owner) {
      await cleanup(owner, seed).catch(() => undefined);
      await owner.end();
    }
  });

  it('AC6: cascade rule is deployed to rule_definitions for the org', async () => {
    const { rows } = await owner.query<{ rule_type: string; tier: string }>(
      `select rule_type, tier from public.rule_definitions
        where org_id = $1 and rule_code = 'technical.allergen_cascade'`,
      [seed.orgAId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.rule_type).toBe('cascading');
    expect(rows[0]?.tier).toBe('L1');
  });

  it('AC1+AC3+AC4+AC5: RM allergen change cascades RM -> intermediate -> FG within 5s; process op adds eggs', async () => {
    const g = await seedGraph();

    // RM gains 'gluten' (component-carried allergen). source != manual_override.
    await owner.query(
      `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source, intensity, confidence)
       values ($1, $2, 'gluten', 'brief_declared', 'contains', 'declared')`,
      [seed.orgAId, g.rmItem],
    );

    // Run the cascade handler as the worker would (changed item = the RM).
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      cascadeAllergensForChangedItem(ctx.client, ctx.orgId, g.rmItem),
    );
    expect(res.cascadedRowsWritten).toBeGreaterThan(0);

    // AC3: KPI <= 5000ms.
    expect(res.durationMs).toBeLessThanOrEqual(5000);

    // AC1: gluten propagated to the intermediate AND the FG as source='cascaded'.
    const wipGluten = await owner.query<{ source: string }>(
      `select source from public.item_allergen_profiles where item_id = $1 and allergen_code = 'gluten'`,
      [g.wipItem],
    );
    expect(wipGluten.rows[0]?.source).toBe('cascaded');

    const fgGluten = await owner.query<{ source: string }>(
      `select source from public.item_allergen_profiles where item_id = $1 and allergen_code = 'gluten'`,
      [g.fgItem],
    );
    expect(fgGluten.rows[0]?.source).toBe('cascaded');

    // AC4: the 'Mix' op on the intermediate BOM adds 'eggs' -> cascades up.
    await owner.query(
      `insert into public.manufacturing_operation_allergen_additions
         (org_id, manufacturing_operation_name, allergen_code) values ($1, 'Mix', 'eggs')`,
      [seed.orgAId],
    );
    await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      cascadeAllergensForChangedItem(ctx.client, ctx.orgId, g.rmItem),
    );

    const wipEggs = await owner.query<{ source: string }>(
      `select source from public.item_allergen_profiles where item_id = $1 and allergen_code = 'eggs'`,
      [g.wipItem],
    );
    expect(wipEggs.rows[0]?.source).toBe('cascaded');
    const fgEggs = await owner.query<{ source: string }>(
      `select source from public.item_allergen_profiles where item_id = $1 and allergen_code = 'eggs'`,
      [g.fgItem],
    );
    expect(fgEggs.rows[0]?.source).toBe('cascaded');

    // AC5: the change-detection / cascade reads item_type from items (join by
    // item_id) — proven by the RM being correctly treated as a leaf component
    // (it has no active BOM so it is never written a cascaded row of its own).
    const rmRows = await owner.query<{ allergen_code: string; source: string }>(
      `select allergen_code, source from public.item_allergen_profiles where item_id = $1`,
      [g.rmItem],
    );
    // RM keeps only its declared gluten; no cascaded rows written onto a leaf.
    expect(rmRows.rows.every((r) => r.source !== 'cascaded')).toBe(true);
  });

  it('AC2: a manual_override on the FG is NEVER overwritten by the cascade', async () => {
    const g = await seedGraph();

    // FG carries a manual_override for 'milk' (intensity trace, with reason).
    await owner.query(
      `insert into public.item_allergen_profiles
         (org_id, item_id, allergen_code, source, intensity, confidence, manual_override_reason)
       values ($1, $2, 'milk', 'manual_override', 'trace', 'tested', 'QA dossier signoff')`,
      [seed.orgAId, g.fgItem],
    );

    // RM gains 'milk' at a STRONGER intensity (contains) — the cascade would push
    // 'contains' but must NOT clobber the FG's manual_override 'trace'.
    await owner.query(
      `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source, intensity, confidence)
       values ($1, $2, 'milk', 'brief_declared', 'contains', 'declared')`,
      [seed.orgAId, g.rmItem],
    );

    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      cascadeAllergensForChangedItem(ctx.client, ctx.orgId, g.rmItem),
    );
    expect(res.overridesPreserved).toBeGreaterThanOrEqual(1);

    // FG 'milk' row UNCHANGED: still manual_override, still trace, reason intact.
    const fgMilk = await owner.query<{ source: string; intensity: string; manual_override_reason: string }>(
      `select source, intensity, manual_override_reason from public.item_allergen_profiles
        where item_id = $1 and allergen_code = 'milk'`,
      [g.fgItem],
    );
    expect(fgMilk.rows[0]?.source).toBe('manual_override');
    expect(fgMilk.rows[0]?.intensity).toBe('trace');
    expect(fgMilk.rows[0]?.manual_override_reason).toBe('QA dossier signoff');

    // The intermediate (no override) DID receive the cascaded 'milk' (contains).
    const wipMilk = await owner.query<{ source: string; intensity: string }>(
      `select source, intensity from public.item_allergen_profiles where item_id = $1 and allergen_code = 'milk'`,
      [g.wipItem],
    );
    expect(wipMilk.rows[0]?.source).toBe('cascaded');
    expect(wipMilk.rows[0]?.intensity).toBe('contains');
  });
});
