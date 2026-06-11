/**
 * T-065 — REAL DB-backed integration test for the formulation Server Actions.
 *
 * Runs `recomputeAndCache` + `compareVersions` through the REAL `withOrgContext`
 * HOF (app-role transaction + RLS via app.set_org_context) against a live
 * Postgres, NOT a mock. Proves:
 *   - nutrition_json is POPULATED in formulation_calc_cache from the canonical
 *     Reference.RawMaterials.nutrition_per_100g weighted-sum (Codex finding #1).
 *   - compareVersions does NOT collapse duplicate rm_code rows (finding #4).
 *   - compareVersions throws not-found for a missing version (finding #3).
 *
 * Requires DATABASE_URL (owner) — skipped otherwise so the no-DB CI run is green.
 * The DB env (clone @103) is documented in the T-065 rework brief.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

// Stable IDs for this test's tenant/org/user so withOrgContext's test-stub can
// resolve the actor + org and the app-role RLS transaction engages for real.
const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const projectId = randomUUID();
const formulationId = randomUUID();
const versionAId = randomUUID();
const versionBId = randomUUID();
/** F6: version with an ITEM-LINKED line whose STORED allergens are stale junk. */
const versionCId = randomUUID();
const linkedItemId = randomUUID();

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, data_plane_url)
     values ($1, 'T-065 IT Tenant', 'https://t065.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-065 IT Org', 'fmcg')
     on conflict (id) do nothing`,
    [orgId, tenantId],
  );
  await owner.query(
    `insert into public.roles (id, org_id, code, name, permissions)
     values ($1, $2, 'it-admin', 'IT Admin', '[]'::jsonb)
     on conflict (id) do nothing`,
    [roleId, orgId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't065-it@example.test', 'T-065 IT User', $3)
     on conflict (id) do nothing`,
    [userId, orgId, roleId],
  );
  await owner.query(
    `insert into public.npd_projects (id, org_id, code, name, type)
     values ($1, $2, 'NPD-T065-IT', 'T-065 IT Project', 'standard')
     on conflict (id) do nothing`,
    [projectId, orgId],
  );
  await owner.query(
    `insert into public.formulations (id, org_id, project_id)
     values ($1, $2, $3)
     on conflict (id) do nothing`,
    [formulationId, orgId, projectId],
  );

  // Three versions; version A is the one we recompute, version C is the F6
  // SSOT-allergen scenario (item-linked line with a STALE stored cache).
  await owner.query(
    `insert into public.formulation_versions
       (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur)
     values ($1, $2, 1, 'draft', 100, 95, 2.00),
            ($3, $2, 2, 'draft', 100, 95, 2.00),
            ($4, $2, 3, 'draft', 100, 95, 2.00)
     on conflict (id) do nothing`,
    [versionAId, formulationId, versionBId, versionCId],
  );

  // F6 — an items-master row + its SSOT allergen profile (mustard + milk).
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, 'RM-T065-LINKED', 'rm', 'T-065 Linked RM', 'kg')
     on conflict (id) do nothing`,
    [linkedItemId, orgId],
  );
  await owner.query(
    `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source, intensity, confidence)
     values ($1, $2, 'mustard', 'supplier_spec', 'contains', 'declared'),
            ($1, $2, 'milk', 'supplier_spec', 'may_contain', 'declared')
     on conflict (org_id, item_id, allergen_code) do nothing`,
    [orgId, linkedItemId],
  );

  // Canonical RM master with per-100g nutrition (the source for the weighted-sum).
  await owner.query(
    `insert into "Reference"."RawMaterials" (org_id, rm_code, display_name, nutrition_per_100g, allergens_inherited)
     values
       ($1, 'RM-A', 'Flour',  '{"protein_g":"20","energy_kj":"400"}'::jsonb, '{gluten}'),
       ($1, 'RM-B', 'Butter', '{"protein_g":"10","energy_kj":"200"}'::jsonb, '{milk}')
     on conflict (org_id, rm_code) do update
       set nutrition_per_100g = excluded.nutrition_per_100g`,
    [orgId],
  );

  // Version A ingredients: 50% RM-A + 50% RM-B (sums to 100).
  await owner.query(
    `insert into public.formulation_ingredients
       (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, allergens_inherited, sequence)
     values
       ($1, 'RM-A', 50, 50.000, 2.00, '{gluten}', 1),
       ($1, 'RM-B', 50, 50.000, 4.00, '{milk}', 2)`,
    [versionAId],
  );

  // Version B: a DUPLICATE rm_code scenario (RM-A appears twice at seq 1 & 2),
  // plus RM-B at seq 3. Only seq 2 differs vs the matching version-B-prime case.
  await owner.query(
    `insert into public.formulation_ingredients
       (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, allergens_inherited, sequence)
     values
       ($1, 'RM-A', 30, 30.000, 2.00, '{gluten}', 1),
       ($1, 'RM-A', 20, 20.000, 2.00, '{gluten}', 2),
       ($1, 'RM-B', 50, 50.000, 4.00, '{milk}', 3)`,
    [versionBId],
  );

  // Version C (F6): seq 1 is a legacy free-text line (stored allergens are its
  // only source); seq 2 is ITEM-LINKED and its STORED cache is stale junk —
  // recompute must union the live profile (mustard, milk), never the junk.
  await owner.query(
    `insert into public.formulation_ingredients
       (version_id, rm_code, item_id, qty_kg, pct, cost_per_kg_eur, allergens_inherited, sequence)
     values
       ($1, 'RM-A', null, 50, 50.000, 2.00, '{gluten}', 1),
       ($1, 'RM-T065-LINKED', $2, 50, 50.000, 3.00, '{stale-junk-code}', 2)`,
    [versionCId, linkedItemId],
  );
}

async function cleanup(): Promise<void> {
  // Cascades remove versions/ingredients/cache via FKs.
  await owner.query(`delete from "Reference"."RawMaterials" where org_id = $1`, [orgId]);
  await owner.query(`delete from public.item_allergen_profiles where org_id = $1`, [orgId]);
  await owner.query(`delete from public.items where org_id = $1`, [orgId]);
  await owner.query(`delete from public.formulations where org_id = $1`, [orgId]);
  await owner.query(`delete from public.npd_projects where org_id = $1`, [orgId]);
  await owner.query(`delete from public.users where org_id = $1`, [orgId]);
  await owner.query(`delete from public.roles where org_id = $1`, [orgId]);
  await owner.query(`delete from public.organizations where id = $1`, [orgId]);
  await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
}

run('formulation Server Actions — REAL DB integration (T-065 rework)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for seeding/cleanup; the action-under-test uses the managed pool via withOrgContext
    owner = new pg.Pool({ connectionString: databaseUrl });
    // Drive withOrgContext's test-stub resolver so the REAL app-role + RLS
    // transaction runs (no Supabase JWT needed in the test environment).
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    await seed();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await owner.end();
  });

  it('recomputeAndCache writes a NON-EMPTY nutrition_json from Reference.RawMaterials', async () => {
    const { recomputeAndCache } = await import('../recompute');

    const result = await recomputeAndCache({ projectId, versionId: versionAId });

    // Pure-compute result carries the weighted sum.
    // 50% protein_g: 0.5*20 + 0.5*10 = 15.00 ; energy_kj: 0.5*400 + 0.5*200 = 300.00
    expect(result.nutrition.protein_g).toBe('15.00');
    expect(result.nutrition.energy_kj).toBe('300.00');
    expect(result.allergens).toEqual(['gluten', 'milk']);
    expect(result.totalPct).toBe('100.000');

    // Read the persisted cache row back from the DB (proves it was WRITTEN).
    const cache = await owner.query<{ nutrition_json: Record<string, string>; cost_json: Record<string, unknown> }>(
      `select nutrition_json, cost_json from public.formulation_calc_cache where version_id = $1`,
      [versionAId],
    );
    expect(cache.rowCount).toBe(1);
    const nutritionJson = cache.rows[0].nutrition_json;
    expect(nutritionJson).not.toEqual({});
    expect(Object.keys(nutritionJson).length).toBeGreaterThan(0);
    expect(nutritionJson.protein_g).toBe('15.00');
    expect(nutritionJson.energy_kj).toBe('300.00');
  });

  it('F6: recompute unions PROFILE-derived allergens for item-linked lines, stored only for free-text', async () => {
    const { recomputeAndCache } = await import('../recompute');

    const result = await recomputeAndCache({ projectId, versionId: versionCId });

    // gluten ← stored cache of the legacy free-text line (no SSOT source);
    // milk + mustard ← LIVE item_allergen_profiles of the linked item.
    expect(result.allergens).toEqual(['gluten', 'milk', 'mustard']);
    // The stale stored junk on the item-linked line never reaches the union.
    expect(result.allergens).not.toContain('stale-junk-code');

    // And the persisted allergen_json cache row carries the same SSOT union.
    const cache = await owner.query<{ allergen_json: { allergens: string[] } }>(
      `select allergen_json from public.formulation_calc_cache where version_id = $1`,
      [versionCId],
    );
    expect(cache.rows[0]?.allergen_json?.allergens).toEqual(['gluten', 'milk', 'mustard']);
  });

  it('compareVersions does NOT collapse duplicate rm_code rows (keyed by sequence)', async () => {
    const { compareVersions } = await import('../compare-versions');

    // Compare version B (3 rows incl. duplicate RM-A) against itself's structure
    // by comparing A (2 rows) vs B (3 rows): RM-A@seq1 unchanged, seq2 added,
    // RM-B moves seq2→seq3 so seq2 in A (RM-B) vs seq2 in B (RM-A) = CHANGED rmCode.
    const out = await compareVersions({ projectId, versionAId, versionBId });

    // Diff is by sequence: seq1 unchanged, seq2 changed (RM-B→RM-A), seq3 added.
    expect(out.rows).toHaveLength(3);
    const seq2 = out.rows.find((r) => r.sequence === 2);
    expect(seq2?.status).toBe('CHANGED');
    expect(seq2?.changed.rmCode).toBe(true); // duplicate RM not collapsed
    const seq3 = out.rows.find((r) => r.sequence === 3);
    expect(seq3?.status).toBe('ADDED');
    // The duplicate RM-A (seq2 in B) is genuinely present in the diff, proving
    // no "first-wins" collapse on rm_code.
    expect(out.rows.filter((r) => r.b?.rmCode === 'RM-A')).toHaveLength(2);
  });

  it('compareVersions throws not-found for a version outside the project', async () => {
    const { compareVersions } = await import('../compare-versions');
    await expect(
      compareVersions({ projectId, versionAId, versionBId: randomUUID() }),
    ).rejects.toThrow(/not found/);
  });
});
