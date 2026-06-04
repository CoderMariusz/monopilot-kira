/**
 * T-038 — Allergen cascade ENGINE + fa_allergen_cascade view.
 *
 * Two surfaces are exercised:
 *
 *  1. The read-model VIEW public.fa_allergen_cascade (security_invoker=true), which
 *     recomputes per FG on every read:
 *       derived_allergens   = union(confirmed RM, confirmed process)
 *       published_allergens  = (derived ∪ overrides[add]) \ overrides[remove]
 *       may_contain_allergens = union(RM may_contain/trace, conditional process) \ published
 *       conditional_process_allergens = conditional process rows (recipe_condition unevaluated)
 *
 *  2. The cascade ENGINE function public.update_fa_allergen_set(product_code), which
 *     MATERIALIZES published_allergens → product.allergens and may_contain_allergens →
 *     product.may_contain, and EMITS outbox 'fa.allergens_changed' ONLY when the
 *     persisted set changes. Idempotent: no-op + no event when unchanged.
 *
 * DERIVED LAW: the engine recomputes from RM/process/override sources; users never author
 * product.allergens / product.may_contain. Overrides are additive and never mutate the
 * derived source.
 *
 * Wave0 lock: org_id (NOT tenant_id), RLS via app.current_org_id(); the view + engine are
 * security_invoker so RLS on the underlying tables applies as the querying role.
 *
 * PRD: docs/prd/01-NPD-PRD.md §8.5, §8.6, §8.10.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/114-allergen-cascade.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '03800000-0000-4000-8000-000000000000';
const orgA = '03800000-0000-4000-8000-00000000000a';
const orgB = '03800000-0000-4000-8000-00000000000b';
const orgAUser = '03800000-0000-4000-8000-0000000000aa';
const orgBUser = '03800000-0000-4000-8000-0000000000bb';
const orgARole = '03800000-0000-4000-8000-0000000001aa';
const orgBRole = '03800000-0000-4000-8000-0000000001bb';

// Product codes per scenario (org A unless noted).
const pGluten = 'FA-T038-GLUTEN'; // AC1 — single RM RM1939 (confirmed gluten)
const pProcess = 'FA-T038-PROCESS'; // AC2 — process 'Coat' adds confirmed soybeans
const pOverride = 'FA-T038-OVERRIDE'; // AC3 — process soybeans + override remove
const pMulti = 'FA-T038-MULTI'; // multi-RM union + dedup + may_contain separation
const pAddOverride = 'FA-T038-ADD'; // override action='add' includes non-derived allergen
const pConditional = 'FA-T038-COND'; // conditional process allergen (NOT published)
// product_code is a GLOBAL primary key — org isolation uses distinct codes that
// share the same ingredient_codes ('RM1939') to prove the RM join is org-scoped.
const pIsoA = 'FA-T038-ISO-A';
const pIsoB = 'FA-T038-ISO-B';

async function ensureAppUser(pool: pg.Pool) {
  await pool.query(`
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

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

type CascadeRow = {
  derived_allergens: string[];
  published_allergens: string[];
  may_contain_allergens: string[];
  conditional_process_allergens: string[];
};

/** Read the live read-model view for a FG, as app_user under org context. */
async function readCascade(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  productCode: string,
): Promise<{
  derived: string[];
  published: string[];
  mayContain: string[];
  conditional: string[];
}> {
  const sessionToken = randomUUID();
  await trustOrgContext(ownerPool, sessionToken, orgId);
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const res = await client.query<CascadeRow>(
      `
        select derived_allergens, published_allergens, may_contain_allergens, conditional_process_allergens
        from public.fa_allergen_cascade
        where product_code = $1
      `,
      [productCode],
    );
    await client.query('commit');
    const row = res.rows[0];
    return {
      derived: (row?.derived_allergens ?? []).slice().sort(),
      published: (row?.published_allergens ?? []).slice().sort(),
      mayContain: (row?.may_contain_allergens ?? []).slice().sort(),
      conditional: (row?.conditional_process_allergens ?? []).slice().sort(),
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Run the cascade engine for a FG, as app_user under org context. */
async function runEngine(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  productCode: string,
): Promise<{ allergens: string[]; mayContain: string[]; changed: boolean }> {
  const sessionToken = randomUUID();
  await trustOrgContext(ownerPool, sessionToken, orgId);
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const res = await client.query<{ allergens: string[]; may_contain: string[]; changed: boolean }>(
      `select allergens, may_contain, changed from public.update_fa_allergen_set($1)`,
      [productCode],
    );
    await client.query('commit');
    const row = res.rows[0];
    return {
      allergens: (row?.allergens ?? []).slice().sort(),
      mayContain: (row?.may_contain ?? []).slice().sort(),
      changed: row?.changed ?? false,
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Read the persisted product columns directly (owner, for assertions). */
async function readPersisted(
  ownerPool: pg.Pool,
  productCode: string,
): Promise<{ allergens: string[]; mayContain: string[] }> {
  const res = await ownerPool.query<{ allergens: string[]; may_contain: string[] }>(
    `select allergens, may_contain from public.product where product_code = $1`,
    [productCode],
  );
  const row = res.rows[0];
  return {
    allergens: (row?.allergens ?? []).slice().sort(),
    mayContain: (row?.may_contain ?? []).slice().sort(),
  };
}

/** Count fa.allergens_changed outbox events for a FG (owner, for assertions). */
async function countEvents(ownerPool: pg.Pool, orgId: string, productCode: string): Promise<number> {
  const res = await ownerPool.query<{ n: string }>(
    `select count(*)::text as n
       from public.outbox_events
      where org_id = $1::uuid
        and event_type = 'fa.allergens_changed'
        and aggregate_id = $2`,
    [orgId, productCode],
  );
  return Number(res.rows[0]?.n ?? '0');
}

/** Latest fa.allergens_changed payload for a FG (owner, for assertions). */
async function latestEventPayload(
  ownerPool: pg.Pool,
  orgId: string,
  productCode: string,
): Promise<Record<string, unknown> | null> {
  const res = await ownerPool.query<{ payload: Record<string, unknown> }>(
    `select payload
       from public.outbox_events
      where org_id = $1::uuid
        and event_type = 'fa.allergens_changed'
        and aggregate_id = $2
      order by id desc
      limit 1`,
    [orgId, productCode],
  );
  return res.rows[0]?.payload ?? null;
}

const allProductCodes = [pGluten, pProcess, pOverride, pMulti, pAddOverride, pConditional, pIsoA, pIsoB];

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);

  // Deterministic reset: the clone is persistent across runs, so clear any prior
  // fa.allergens_changed events + materialized product columns for our test FGs so
  // event-count and idempotency assertions are reproducible run-to-run.
  await pool.query(
    `delete from public.outbox_events
       where event_type = 'fa.allergens_changed' and aggregate_id = any($1::text[])`,
    [allProductCodes],
  );

  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-038 Tenant', 'eu', 'https://t-038.example.test')
      on conflict (id) do update set name = excluded.name
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-038 Org A', 'bakery'),
             ($3, $2, 'T-038 Org B', 'fmcg')
      on conflict (id) do update set name = excluded.name
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'npd_technical', 'T-038 Role A', '[]'::jsonb, true),
             ($3, $4, 'npd_technical', 'T-038 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update set name = excluded.name
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 't-038-a@example.test', 'T-038 User A', $3),
             ($4, $5, 't-038-b@example.test', 'T-038 User B', $6)
      on conflict (id) do update set org_id = excluded.org_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );

  // EU14 allergens are auto-seeded per org by migration 082's org-insert trigger,
  // but the orgs may pre-exist in the shared clone — re-run the seeder to be safe.
  await pool.query('select public.seed_allergens_eu14_for_org($1)', [orgA]);
  await pool.query('select public.seed_allergens_eu14_for_org($1)', [orgB]);

  // ---- Reference.Allergens_by_RM (RM-level) ----
  await pool.query(
    `delete from "Reference"."Allergens_by_RM" where org_id in ($1, $2)`,
    [orgA, orgB],
  );
  await pool.query(
    `
      insert into "Reference"."Allergens_by_RM"
        (org_id, ingredient_codes, allergen_code, confidence, source)
      values
        -- AC1: RM1939 confirmed gluten (org A)
        ($1, 'RM1939', 'gluten', 'confirmed', 'supplier_spec'),
        -- multi-RM union: RM2000 confirmed milk; RM2000 may_contain peanuts (→ may_contain, not published)
        ($1, 'RM2000', 'milk', 'confirmed', 'supplier_spec'),
        -- RM4000 confirmed milk — used by the override-remove FG so its published set is
        -- non-empty after soybeans is removed (proves remove changes a real set).
        ($1, 'RM4000', 'milk', 'confirmed', 'supplier_spec'),
        ($1, 'RM2000', 'peanuts', 'may_contain', 'supplier_spec'),
        -- trace path: RM2000 trace nuts (→ may_contain)
        ($1, 'RM2000', 'nuts', 'trace', 'supplier_spec'),
        -- dedup: RM3000 also confirmed gluten (same allergen as RM1939)
        ($1, 'RM3000', 'gluten', 'confirmed', 'lab_test'),
        -- org B: RM1939 confirmed eggs (proves isolation — different result for same code)
        ($2, 'RM1939', 'eggs', 'confirmed', 'supplier_spec')
    `,
    [orgA, orgB],
  );

  // ---- Reference.Allergens_added_by_Process (process-level) ----
  await pool.query(
    `delete from "Reference"."Allergens_added_by_Process" where org_id in ($1, $2)`,
    [orgA, orgB],
  );
  await pool.query(
    `
      insert into "Reference"."Allergens_added_by_Process"
        (org_id, process_name, allergen_code, confidence, recipe_condition)
      values
        -- AC2: operation 'Coat' adds confirmed soybeans (org A)
        ($1, 'Coat', 'soybeans', 'confirmed', null),
        -- conditional process: operation 'Fry' adds mustard ONLY under a recipe_condition
        -- (NOT evaluated here) → must NOT enter the published set, surfaces as may_contain
        ($1, 'Fry', 'mustard', 'conditional', 'recipe contains mustard-oil blend')
    `,
    [orgA],
  );

  // ---- product rows ----
  await pool.query(
    `delete from public.product where product_code = any($1::text[])`,
    [[pGluten, pProcess, pOverride, pMulti, pAddOverride, pConditional, pIsoA, pIsoB]],
  );
  await pool.query(
    `
      insert into public.product (product_code, org_id, product_name, ingredient_codes, created_by_user)
      values
        ($1,  $2, 'AC1 gluten product',   'RM1939',         $3),
        ($4,  $2, 'AC2 process product',  null,             $3),
        ($5,  $2, 'AC3 override product', 'RM4000',         $3),
        ($6,  $2, 'Multi-RM product',      'RM2000, RM3000', $3),
        ($7,  $2, 'Add-override product',  null,             $3),
        ($8,  $2, 'Conditional product',   null,             $3),
        ($9,  $2, 'Isolation product A',   'RM1939',         $3),
        ($10, $11,'Isolation product B',   'RM1939',         $12)
    `,
    [pGluten, orgA, orgAUser, pProcess, pOverride, pMulti, pAddOverride, pConditional, pIsoA, pIsoB, orgB, orgBUser],
  );

  // ---- prod_detail process steps ----
  await pool.query(
    `delete from public.prod_detail where product_code = any($1::text[])`,
    [[pProcess, pOverride, pConditional]],
  );
  await pool.query(
    `
      insert into public.prod_detail
        (product_code, org_id, intermediate_code, component_index, manufacturing_operation_1)
      values
        ($1, $2, 'PR-COAT-1', 1, 'Coat'),
        ($3, $2, 'PR-COAT-2', 1, 'Coat'),
        ($4, $2, 'PR-FRY-1',  1, 'Fry')
    `,
    [pProcess, orgA, pOverride, pConditional],
  );

  // ---- current overrides ----
  // AC3: remove soybeans from pOverride (derived via process 'Coat').
  // pAddOverride: add 'mustard' (not derived anywhere).
  await pool.query(
    `delete from public.fa_allergen_overrides where org_id = $1 and product_code = any($2::text[])`,
    [orgA, [pOverride, pAddOverride]],
  );
  await pool.query(
    `
      insert into public.fa_allergen_overrides
        (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
      values
        ($1, $2, 'soybeans', 'remove', 'Lab result clears soy cross-contact', $3, 'technical'),
        ($1, $4, 'mustard',  'add',    'Supplier spec confirms mustard',      $3, 'technical')
    `,
    [orgA, pOverride, orgAUser, pAddOverride],
  );
}

describe('114 allergen cascade migration contract', () => {
  it('ships a security_invoker view + engine fn keyed on org_id (no tenant_id/current_setting)', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/114-allergen-cascade.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    // view
    expect(sql).toMatch(/create\s+(or\s+replace\s+)?view\s+public\.fa_allergen_cascade/i);
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
    expect(sql).toMatch(/"Reference"\."Allergens_by_RM"/);
    expect(sql).toMatch(/"Reference"\."Allergens_added_by_Process"/);
    expect(sql).toMatch(/fa_allergen_overrides/);
    expect(sql).toMatch(/superseded_at\s+is\s+null/i);
    expect(sql).toMatch(/may_contain_allergens/i);
    // engine fn + write-back + event
    expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.update_fa_allergen_set/i);
    expect(sql).toMatch(/alter\s+table\s+public\.product[\s\S]*add\s+column\s+if\s+not\s+exists\s+allergens/i);
    expect(sql).toMatch(/add\s+column\s+if\s+not\s+exists\s+may_contain/i);
    expect(sql).toMatch(/update\s+public\.product/i);
    expect(sql).toMatch(/insert\s+into\s+public\.outbox_events/i);
    expect(sql).toMatch(/'fa\.allergens_changed'/);
    // grants
    expect(sql).toMatch(/grant\s+select\s+on\s+public\.fa_allergen_cascade\s+to\s+app_user/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.update_fa_allergen_set\(text\)\s+to\s+app_user/i);
    // never authored: no UPDATE/DELETE/INSERT privilege on the derived view for app_user.
    // (Match a single grant statement — no ';' between the verb and the view — so the
    // engine's legitimate `update public.product` write-back is not a false positive.)
    expect(sql).not.toMatch(/grant\b[^;]*\b(insert|update|delete)\b[^;]*\bon\b[^;]*public\.fa_allergen_cascade/i);
    // Wave0 lock — forbid tenant_id *usage* as a column/identifier, and forbid raw
    // current_setting('app.*') in place of app.current_org_id().
    expect(sql).not.toMatch(/(?<!not\s)tenant_id\s*(?:uuid|=|,|\))/i);
    expect(sql).not.toMatch(/\b\w+\.tenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\./i);
  });
});

runIntegrationTest('114 fa_allergen_cascade engine + view behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  // ---- view read-model ----

  it('AC1 (view): RM cascade — confirmed gluten from RM1939 in derived + published', async () => {
    const r = await readCascade(appPool, ownerPool, orgA, pGluten);
    expect(r.derived).toEqual(['gluten']);
    expect(r.published).toEqual(['gluten']);
  });

  it('AC2 (view): process cascade — confirmed soybeans added by operation "Coat"', async () => {
    const r = await readCascade(appPool, ownerPool, orgA, pProcess);
    expect(r.derived).toContain('soybeans');
    expect(r.published).toContain('soybeans');
  });

  it('AC3 (view): override action=remove subtracts soybeans from published, keeps it in derived', async () => {
    const r = await readCascade(appPool, ownerPool, orgA, pOverride);
    expect(r.derived).toContain('soybeans'); // derived source NOT cleared
    expect(r.published).not.toContain('soybeans'); // override applied last
  });

  it('view: override action=add includes a non-derived allergen in published only', async () => {
    const r = await readCascade(appPool, ownerPool, orgA, pAddOverride);
    expect(r.derived).not.toContain('mustard');
    expect(r.published).toContain('mustard');
  });

  it('view: multi-RM unions + dedups confirmed; may_contain/trace surfaced separately', async () => {
    const r = await readCascade(appPool, ownerPool, orgA, pMulti);
    // RM2000 confirmed milk + RM3000 confirmed gluten; gluten deduped.
    expect(r.published).toEqual(['gluten', 'milk']);
    // RM2000 peanuts (may_contain) + nuts (trace) → may_contain, NOT published.
    expect(r.mayContain).toEqual(['nuts', 'peanuts']);
    expect(r.published).not.toContain('peanuts');
    expect(r.published).not.toContain('nuts');
  });

  it('view: conditional process allergen is NOT published; surfaces as may_contain + conditional list', async () => {
    const r = await readCascade(appPool, ownerPool, orgA, pConditional);
    // 'Fry' adds mustard with confidence=conditional + recipe_condition (unevaluated).
    expect(r.published).not.toContain('mustard');
    expect(r.derived).not.toContain('mustard');
    expect(r.mayContain).toContain('mustard');
    expect(r.conditional).toContain('mustard');
  });

  it('view: org isolation — identical RM code resolves to each org’s own allergens', async () => {
    const a = await readCascade(appPool, ownerPool, orgA, pIsoA);
    const b = await readCascade(appPool, ownerPool, orgB, pIsoB);
    expect(a.published).toEqual(['gluten']);
    expect(b.published).toEqual(['eggs']);
    expect(a.published).not.toContain('eggs');
    expect(b.published).not.toContain('gluten');
  });

  it('view is structurally read-only for app_user (no INSERT privilege)', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await expect(
        client.query(`insert into public.fa_allergen_cascade (product_code) values ($1)`, [pGluten]),
      ).rejects.toThrow(/permission denied|cannot insert|read-only|not.*updatable|privilege/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  // ---- engine: write-back + event ----

  it('engine AC1: materializes confirmed gluten onto product.allergens + emits event on first run', async () => {
    const before = await countEvents(ownerPool, orgA, pGluten);
    const res = await runEngine(appPool, ownerPool, orgA, pGluten);
    expect(res.changed).toBe(true);
    expect(res.allergens).toEqual(['gluten']);

    const persisted = await readPersisted(ownerPool, pGluten);
    expect(persisted.allergens).toEqual(['gluten']);
    expect(persisted.mayContain).toEqual([]);

    expect(await countEvents(ownerPool, orgA, pGluten)).toBe(before + 1);
    const payload = await latestEventPayload(ownerPool, orgA, pGluten);
    expect(payload?.product_code).toBe(pGluten);
    expect(payload?.allergens).toEqual(['gluten']);
  });

  it('engine AC2: process addition persists soybeans onto product.allergens', async () => {
    const res = await runEngine(appPool, ownerPool, orgA, pProcess);
    expect(res.changed).toBe(true);
    expect(res.allergens).toContain('soybeans');
    const persisted = await readPersisted(ownerPool, pProcess);
    expect(persisted.allergens).toContain('soybeans');
    expect(await countEvents(ownerPool, orgA, pProcess)).toBe(1);
  });

  it('engine AC3: override remove — soybeans NOT persisted; remaining confirmed set persisted', async () => {
    const res = await runEngine(appPool, ownerPool, orgA, pOverride);
    expect(res.changed).toBe(true);
    // pOverride: confirmed milk (RM4000) + confirmed soybeans (process Coat), remove soybeans.
    expect(res.allergens).toEqual(['milk']);
    expect(res.allergens).not.toContain('soybeans');
    const persisted = await readPersisted(ownerPool, pOverride);
    expect(persisted.allergens).toEqual(['milk']);
    expect(persisted.allergens).not.toContain('soybeans');
    // derived source still has soybeans (proven via the view), but it is never persisted.
    const view = await readCascade(appPool, ownerPool, orgA, pOverride);
    expect(view.derived).toContain('soybeans');
    expect(view.derived).toContain('milk');
  });

  it('engine: may_contain path — RM may_contain/trace persisted to product.may_contain, distinct from allergens', async () => {
    const res = await runEngine(appPool, ownerPool, orgA, pMulti);
    expect(res.changed).toBe(true);
    expect(res.allergens).toEqual(['gluten', 'milk']);
    expect(res.mayContain).toEqual(['nuts', 'peanuts']);
    const persisted = await readPersisted(ownerPool, pMulti);
    expect(persisted.allergens).toEqual(['gluten', 'milk']);
    expect(persisted.mayContain).toEqual(['nuts', 'peanuts']);
    // confirmed and may_contain are disjoint.
    expect(persisted.allergens.filter((a) => persisted.mayContain.includes(a))).toEqual([]);
  });

  it('engine: conditional process allergen lands in product.may_contain, never product.allergens', async () => {
    const res = await runEngine(appPool, ownerPool, orgA, pConditional);
    expect(res.changed).toBe(true);
    expect(res.allergens).not.toContain('mustard');
    expect(res.mayContain).toContain('mustard');
    const persisted = await readPersisted(ownerPool, pConditional);
    expect(persisted.allergens).not.toContain('mustard');
    expect(persisted.mayContain).toContain('mustard');
  });

  it('engine: override add — mustard persisted to product.allergens', async () => {
    const res = await runEngine(appPool, ownerPool, orgA, pAddOverride);
    expect(res.changed).toBe(true);
    expect(res.allergens).toContain('mustard');
    const persisted = await readPersisted(ownerPool, pAddOverride);
    expect(persisted.allergens).toContain('mustard');
  });

  it('engine: idempotent — re-run with no source change persists nothing new and emits NO event', async () => {
    // First run already happened above for pGluten (count == 1). Re-run twice.
    const baseline = await countEvents(ownerPool, orgA, pGluten);
    expect(baseline).toBe(1);

    const r1 = await runEngine(appPool, ownerPool, orgA, pGluten);
    expect(r1.changed).toBe(false);
    expect(r1.allergens).toEqual(['gluten']);
    expect(await countEvents(ownerPool, orgA, pGluten)).toBe(baseline); // NO new event

    const r2 = await runEngine(appPool, ownerPool, orgA, pGluten);
    expect(r2.changed).toBe(false);
    expect(await countEvents(ownerPool, orgA, pGluten)).toBe(baseline); // still NO new event
  });

  it('engine: re-emits exactly one event when the derived set actually changes', async () => {
    // pGluten currently persists ['gluten'] with 1 event. Add a confirmed milk RM (RM1939→milk),
    // re-run → set changes → exactly one more event; re-run again → no further event.
    const before = await countEvents(ownerPool, orgA, pGluten);
    await ownerPool.query(
      `insert into "Reference"."Allergens_by_RM" (org_id, ingredient_codes, allergen_code, confidence, source)
       values ($1, 'RM1939', 'milk', 'confirmed', 'lab_test')
       on conflict (org_id, ingredient_codes, allergen_code) do update set confidence = excluded.confidence`,
      [orgA],
    );
    try {
      const changedRun = await runEngine(appPool, ownerPool, orgA, pGluten);
      expect(changedRun.changed).toBe(true);
      expect(changedRun.allergens).toEqual(['gluten', 'milk']);
      expect(await countEvents(ownerPool, orgA, pGluten)).toBe(before + 1);

      const stableRun = await runEngine(appPool, ownerPool, orgA, pGluten);
      expect(stableRun.changed).toBe(false);
      expect(await countEvents(ownerPool, orgA, pGluten)).toBe(before + 1);
    } finally {
      // restore RM1939 to gluten-only so the suite is order-tolerant on re-run.
      await ownerPool.query(
        `delete from "Reference"."Allergens_by_RM" where org_id = $1 and ingredient_codes = 'RM1939' and allergen_code = 'milk'`,
        [orgA],
      );
    }
  });

  it('engine: app_user can EXECUTE the function (granted)', async () => {
    // Already exercised by every engine test above (run as app_user via getAppConnection),
    // assert explicitly that a clean run for a fresh org-scoped FG returns a row.
    const res = await runEngine(appPool, ownerPool, orgA, pIsoA);
    expect(res.allergens).toEqual(['gluten']);
  });
});
