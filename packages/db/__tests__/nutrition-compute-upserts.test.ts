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
const migrationPath = resolve(packageRoot, 'migrations/110-nutrition-compute-upserts.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '07200000-0000-4000-8000-000000000000';
const orgA = '07200000-0000-4000-8000-00000000000a';
const orgB = '07200000-0000-4000-8000-00000000000b';
const userA = '07200000-0000-4000-8000-0000000000aa';
const userB = '07200000-0000-4000-8000-0000000000bb';
const roleA = '07200000-0000-4000-8000-0000000001aa';
const roleB = '07200000-0000-4000-8000-0000000001bb';
const productA = 'FA-T072-A';
const productB = 'FA-T072-B';

async function seedBaseRows(pool: pg.Pool) {
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
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T072 Tenant', 'eu', 'https://t072.example.test')
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
      values ($1, $2, 'T072 Org A', 'bakery'),
             ($3, $2, 'T072 Org B', 'fmcg')
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
      values ($1, $2, 'nutrition_compute', 'Nutrition Compute A', '[]'::jsonb, true),
             ($3, $4, 'nutrition_compute', 'Nutrition Compute B', '[]'::jsonb, true)
      on conflict (org_id, code) do update set name = excluded.name
    `,
    [roleA, orgA, roleB, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 't072-a@example.test', 'T072 User A', $3),
             ($4, $5, 't072-b@example.test', 'T072 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [userA, orgA, roleA, userB, orgB, roleB],
  );
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  await pool.query(
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'T072 Product A', 1, $3),
             ($4, $5, 'T072 Product B', 1, $6)
    `,
    [productA, orgA, userA, productB, orgB, userB],
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

describe('110 nutrition compute upsert migration contract', () => {
  it('adds idempotent UPSERT keys and preserves app.current_org_id RLS', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/110-nutrition-compute-upserts.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /nutrition_profiles_org_product_version_nutrient_unique[\s\S]*unique\s+nulls\s+not\s+distinct\s*\(\s*org_id\s*,\s*product_code\s*,\s*formulation_version_id\s*,\s*nutrient_code\s*\)/i,
    );
    expect(sql).toMatch(
      /nutri_score_results_org_product_version_unique[\s\S]*unique\s+nulls\s+not\s+distinct\s*\(\s*org_id\s*,\s*product_code\s*,\s*formulation_version_id\s*\)/i,
    );
    expect(sql).toMatch(/alter table public\.nutrition_profiles force row level security/i);
    expect(sql).toMatch(/with check \(org_id = app\.current_org_id\(\)\)/i);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.nutrition_profiles to app_user/i);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('110 nutrition compute upsert behavior', () => {
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

  it('enforces a single profile row per org/product/version/nutrient', async () => {
    await ownerPool.query(
      `
        insert into public.nutrition_profiles
          (org_id, product_code, formulation_version_id, nutrient_code, per_100g_value, per_portion_value)
        values ($1, $2, null, 'energy_kj', 100, 40)
        on conflict on constraint nutrition_profiles_org_product_version_nutrient_unique
        do update set per_100g_value = excluded.per_100g_value
      `,
      [orgA, productA],
    );

    await expect(
      ownerPool.query(
        `
          insert into public.nutrition_profiles
            (org_id, product_code, formulation_version_id, nutrient_code, per_100g_value, per_portion_value)
          values ($1, $2, null, 'energy_kj', 200, 80)
        `,
        [orgA, productA],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('proves app_user RLS is non-vacuous for reads and WITH CHECK inserts', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    await ownerPool.query(
      `
        delete from public.nutrition_profiles
        where product_code in ($1, $2)
          and nutrient_code = 'protein_g'
      `,
      [productA, productB],
    );
    await ownerPool.query(
      `
        insert into public.nutrition_profiles
          (org_id, product_code, formulation_version_id, nutrient_code, per_100g_value, per_portion_value)
        values ($1, $2, null, 'protein_g', 10, 4),
               ($3, $4, null, 'protein_g', 20, 8)
      `,
      [orgA, productA, orgB, productB],
    );

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ org_id: string; product_code: string }>(
        `
          select org_id, product_code
          from public.nutrition_profiles
          where nutrient_code = 'protein_g'
            and product_code in ($1, $2)
          order by product_code
        `,
        [productA, productB],
      );
      expect(visible.rows).toEqual([{ org_id: orgA, product_code: productA }]);

      await expect(
        client.query(
          `
            insert into public.nutrition_profiles
              (org_id, product_code, formulation_version_id, nutrient_code, per_100g_value, per_portion_value)
            values ($1, $2, null, 'fat_g', 1, 0.4)
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
