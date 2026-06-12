import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/086-nutrition.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '06900000-0000-4000-8000-000000000000';
const orgA = '06900000-0000-4000-8000-00000000000a';
const orgB = '06900000-0000-4000-8000-00000000000b';
const orgAUser = '06900000-0000-4000-8000-0000000000aa';
const orgBUser = '06900000-0000-4000-8000-0000000000bb';
const orgARole = '06900000-0000-4000-8000-0000000001aa';
const orgBRole = '06900000-0000-4000-8000-0000000001bb';
const productA = 'FA-T069-A';
const productB = 'FA-T069-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Nutrition Test Tenant', 'eu', 'https://nutrition.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'Nutrition Org A', 'bakery'),
             ($3, $2, 'Nutrition Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'nutrition_user', 'Nutrition Role A', '[]'::jsonb, true),
             ($3, $4, 'nutrition_user', 'Nutrition Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'nutrition-a@example.test', 'Nutrition User A', $3),
             ($4, $5, 'nutrition-b@example.test', 'Nutrition User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Nutrition Product A', 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Nutrition Product B', 1, $3)
    `,
    [productB, orgB, orgBUser],
  );
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

describe('086 nutrition migration contract', () => {
  it('declares nutrition tables with org RLS and NULLS NOT DISTINCT Nutri-Score uniqueness', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/086-nutrition.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.nutrition_profiles/i);
    expect(sql).toMatch(/create table if not exists public\.nutrition_allergens/i);
    expect(sql).toMatch(/create table if not exists public\.nutri_score_results/i);
    expect(sql).toMatch(/"Reference"\."Nutrients"/);
    expect(sql).toMatch(
      /nutri_score_results_org_product_computed_unique[\s\S]*unique\s+nulls\s+not\s+distinct\s*\(\s*org_id\s*,\s*product_code\s*,\s*formulation_version_id\s*,\s*computed_at\s*\)/i,
    );
    expect(sql).toMatch(/per_100g_value numeric not null/i);
    expect(sql).toMatch(/per_portion_value numeric not null/i);
    expect(sql).toMatch(/alter table public\.nutri_score_results force row level security/i);
    expect(sql).toMatch(/with check \(org_id = app\.current_org_id\(\)\)/i);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('086 nutrition schema behavior', () => {
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

  it('seeds exactly the seven EU FIC nutrients', async () => {
    const nutrients = await ownerPool.query<{ nutrient_code: string }>(
      `
        select nutrient_code
        from "Reference"."Nutrients"
        order by display_order
      `,
    );

    expect(nutrients.rows.map((row) => row.nutrient_code)).toEqual([
      'energy_kj',
      'fat_g',
      'saturates_g',
      'carbs_g',
      'sugars_g',
      'protein_g',
      'salt_g',
    ]);
  });

  it('rejects invalid Nutri-Score grades outside A-E', async () => {
    await expect(
      ownerPool.query(
        `
          insert into public.nutri_score_results
            (org_id, product_code, grade, computed_score, computed_at)
          values ($1, $2, 'F', 20, '2026-06-03T12:00:00Z'::timestamptz)
        `,
        [orgA, productA],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects duplicate NULL formulation versions for the same product and computed_at', async () => {
    const computedAt = '2026-06-03T12:34:56Z';

    await ownerPool.query(
      `
        delete from public.nutri_score_results
        where org_id = $1
          and product_code = $2
          and computed_at = $3::timestamptz
      `,
      [orgA, productA, computedAt],
    );
    await ownerPool.query(
      `
        insert into public.nutri_score_results
          (org_id, product_code, formulation_version_id, grade, computed_score, computed_at)
        values ($1, $2, null, 'B', 2, $3::timestamptz)
      `,
      [orgA, productA, computedAt],
    );

    await expect(
      ownerPool.query(
        `
          insert into public.nutri_score_results
            (org_id, product_code, formulation_version_id, grade, computed_score, computed_at)
          values ($1, $2, null, 'C', 3, $3::timestamptz)
        `,
        [orgA, productA, computedAt],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    const remaining = await ownerPool.query<{ count: string }>(
      `
        select count(*)::text
        from public.nutri_score_results
        where org_id = $1
          and product_code = $2
          and formulation_version_id is null
          and computed_at = $3::timestamptz
      `,
      [orgA, productA, computedAt],
    );
    expect(remaining.rows[0]?.count).toBe('1');
  });

  it('enforces org-scoped RLS reads for nutrition_profiles', async () => {
    const sessionToken = randomUUID();

    await ownerPool.query(
      `
        delete from public.nutrition_profiles
        where product_code in ($1, $2)
          and nutrient_code = 'energy_kj'
      `,
      [productA, productB],
    );
    await ownerPool.query(
      `
        insert into public.nutrition_profiles
          (org_id, product_code, nutrient_code, per_100g_value, per_portion_value, computed_at)
        values ($1, $2, 'energy_kj', 100.00, 25.00, '2026-06-03T13:00:00Z'::timestamptz),
               ($3, $4, 'energy_kj', 200.00, 50.00, '2026-06-03T13:00:00Z'::timestamptz)
      `,
      [orgA, productA, orgB, productB],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      const rows = await client.query<{ org_id: string; product_code: string }>(
        `
          select org_id, product_code
          from public.nutrition_profiles
          where product_code in ($1, $2)
          order by product_code
        `,
        [productA, productB],
      );

      expect(rows.rows).toEqual([{ org_id: orgA, product_code: productA }]);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('rejects app_user inserts whose org_id does not match app.current_org_id', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      await expect(
        client.query(
          `
            insert into public.nutri_score_results
              (org_id, product_code, formulation_version_id, grade, computed_score, computed_at)
            values ($1, $2, null, 'A', -1, '2026-06-03T14:00:00Z'::timestamptz)
          `,
          [orgB, productB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
