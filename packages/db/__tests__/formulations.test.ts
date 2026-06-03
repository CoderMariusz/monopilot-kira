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
const migrationPath = resolve(packageRoot, 'migrations/093-formulations.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '06300000-0000-4000-8000-000000000000';
const orgA = '06300000-0000-4000-8000-00000000000a';
const orgB = '06300000-0000-4000-8000-00000000000b';
const orgAUser = '06300000-0000-4000-8000-0000000000aa';
const orgBUser = '06300000-0000-4000-8000-0000000000bb';
const orgARole = '06300000-0000-4000-8000-0000000001aa';
const orgBRole = '06300000-0000-4000-8000-0000000001bb';
const productA = 'FA-T063-A';
const productB = 'FA-T063-B';
const projectA = '06300000-1000-4000-8000-00000000000a';
const projectB = '06300000-1000-4000-8000-00000000000b';

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

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Formulations Test Tenant', 'eu', 'https://formulations.example.test')
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
      values ($1, $2, 'Formulations Org A', 'bakery'),
             ($3, $2, 'Formulations Org B', 'fmcg')
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
      values ($1, $2, 'formulation_user', 'Formulation Role A', '[]'::jsonb, true),
             ($3, $4, 'formulation_user', 'Formulation Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'formulation-a@example.test', 'Formulation User A', $3),
             ($4, $5, 'formulation-b@example.test', 'Formulation User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.npd_projects where id in ($1, $2)', [projectA, projectB]);
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  await pool.query(
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Formulation Product A', 1, $3),
             ($4, $5, 'Formulation Product B', 1, $6)
    `,
    [productA, orgA, orgAUser, productB, orgB, orgBUser],
  );
  await pool.query(
    `
      insert into public.npd_projects
        (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
      values
        ($1, $2, 'NPD-T063-A', 'Formulation Project A', 'Recipe Standard', 'G1', 'recipe', 'normal', $3, $4),
        ($5, $6, 'NPD-T063-B', 'Formulation Project B', 'Recipe Standard', 'G1', 'recipe', 'normal', $7, $8)
    `,
    [projectA, orgA, productA, orgAUser, projectB, orgB, productB, orgBUser],
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

describe('093 formulations migration contract', () => {
  it('creates the formulation schema without stale tenant_id/GUC patterns', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/093-formulations.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    for (const table of [
      'formulations',
      'formulation_versions',
      'formulation_ingredients',
      'formulation_calc_cache',
      'formulation_audit_log',
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${table} to app_user`, 'i'));
    }

    expect(sql).toMatch(/formulation_versions_state_check[\s\S]*draft[\s\S]*submitted_for_trial[\s\S]*locked/i);
    expect(sql).toMatch(/unique\s*\(\s*formulation_id\s*,\s*version_number\s*\)/i);
    expect(sql).toMatch(/version_id[\s\S]*references public\.formulation_versions[\s\S]*on delete cascade/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('093 formulations schema behavior', () => {
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

  it('publishes the formulation_versions state check and version uniqueness', async () => {
    const stateCheck = await ownerPool.query<{ constraint_name: string; definition: string }>(
      `
        select conname as constraint_name, pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conrelid = 'public.formulation_versions'::regclass
          and conname = 'formulation_versions_state_check'
      `,
    );
    expect(stateCheck.rows[0]?.definition).toMatch(/draft/);
    expect(stateCheck.rows[0]?.definition).toMatch(/submitted_for_trial/);
    expect(stateCheck.rows[0]?.definition).toMatch(/locked/);

    const unique = await ownerPool.query<{ constraint_name: string; columns: string }>(
      `
        select con.conname as constraint_name, string_agg(att.attname, ',' order by ord.n) as columns
        from pg_constraint con
        join unnest(con.conkey) with ordinality as ord(attnum, n) on true
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ord.attnum
        where con.conrelid = 'public.formulation_versions'::regclass
          and con.contype = 'u'
        group by con.conname
      `,
    );
    expect(unique.rows).toContainEqual({
      constraint_name: 'formulation_versions_formulation_version_unique',
      columns: 'formulation_id,version_number',
    });

    const formulationId = randomUUID();
    await ownerPool.query(
      `
        insert into public.formulations (id, org_id, project_id, product_code)
        values ($1, $2, $3, $4)
      `,
      [formulationId, orgA, projectA, productA],
    );

    await ownerPool.query(
      `
        insert into public.formulation_versions
          (formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur, created_by_user)
        values ($1, 1, 'draft', 10.000, 98.500, 2.5000, $2)
      `,
      [formulationId, orgAUser],
    );

    await expect(
      ownerPool.query(
        `
          insert into public.formulation_versions
            (formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur)
          values ($1, 1, 'draft', 10.000, 98.500, 2.5000)
        `,
        [formulationId],
      ),
    ).rejects.toThrow(/formulation_versions_formulation_version_unique|duplicate key/i);

    await expect(
      ownerPool.query(
        `
          insert into public.formulation_versions
            (formulation_id, version_number, state)
          values ($1, 2, 'approved')
        `,
        [formulationId],
      ),
    ).rejects.toThrow(/formulation_versions_state_check|check constraint/i);
  });

  it('cascade-deletes ingredients and calc cache for a deleted version while retaining audit rows', async () => {
    const formulationId = randomUUID();
    const versionId = randomUUID();
    const ingredientId = randomUUID();
    const auditId = randomUUID();

    await ownerPool.query(
      `
        insert into public.formulations (id, org_id, project_id, product_code)
        values ($1, $2, $3, $4)
      `,
      [formulationId, orgA, projectA, productA],
    );
    await ownerPool.query(
      `
        insert into public.formulation_versions
          (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur)
        values ($1, $2, 1, 'draft', 12.000, 99.000, 3.5000)
      `,
      [versionId, formulationId],
    );
    await ownerPool.query(
      `
        insert into public.formulation_ingredients
          (id, version_id, rm_code, qty_kg, pct, cost_per_kg_eur, allergens_inherited, sequence)
        values ($1, $2, 'RM-T063-CASCADE', 6.000, 50.000, 1.2500, array['gluten'], 1)
      `,
      [ingredientId, versionId],
    );
    await ownerPool.query(
      `
        insert into public.formulation_calc_cache
          (version_id, cost_json, nutrition_json, allergen_json)
        values ($1, '{"cost": 7.5}'::jsonb, '{"energy_kj": 100}'::jsonb, '{"contains": ["gluten"]}'::jsonb)
      `,
      [versionId],
    );
    await ownerPool.query(
      `
        insert into public.formulation_audit_log
          (id, org_id, formulation_id, version_id, event_type, event_payload, actor_user_id)
        values ($1, $2, $3, $4, 'ingredient.added', '{"rm_code": "RM-T063-CASCADE"}'::jsonb, $5)
      `,
      [auditId, orgA, formulationId, versionId, orgAUser],
    );

    await ownerPool.query('delete from public.formulation_versions where id = $1', [versionId]);

    const ingredients = await ownerPool.query<{ count: string }>(
      'select count(*) from public.formulation_ingredients where id = $1',
      [ingredientId],
    );
    const cache = await ownerPool.query<{ count: string }>(
      'select count(*) from public.formulation_calc_cache where version_id = $1',
      [versionId],
    );
    const audit = await ownerPool.query<{ version_id: string | null; count: string }>(
      'select version_id, count(*) from public.formulation_audit_log where id = $1 group by version_id',
      [auditId],
    );

    expect(ingredients.rows[0]?.count).toBe('0');
    expect(cache.rows[0]?.count).toBe('0');
    expect(audit.rows).toEqual([{ version_id: versionId, count: '1' }]);
  });

  it('scopes ingredients through parent formulation RLS and rejects cross-org inserts', async () => {
    const orgAFormulation = randomUUID();
    const orgBFormulation = randomUUID();
    const orgAVersion = randomUUID();
    const orgBVersion = randomUUID();
    const sessionToken = randomUUID();

    await ownerPool.query(
      `
        insert into public.formulations (id, org_id, project_id, product_code)
        values ($1, $2, $3, $4),
               ($5, $6, $7, $8)
      `,
      [orgAFormulation, orgA, projectA, productA, orgBFormulation, orgB, projectB, productB],
    );
    await ownerPool.query(
      `
        insert into public.formulation_versions (id, formulation_id, version_number, state)
        values ($1, $2, 1, 'draft'),
               ($3, $4, 1, 'draft')
      `,
      [orgAVersion, orgAFormulation, orgBVersion, orgBFormulation],
    );
    await ownerPool.query(
      `
        insert into public.formulation_ingredients
          (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
        values ($1, 'RM-T063-A', 5.000, 50.000, 1.0000, 1),
               ($2, 'RM-T063-B', 5.000, 50.000, 1.0000, 1)
      `,
      [orgAVersion, orgBVersion],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ version_id: string; rm_code: string }>(
        `
          select version_id, rm_code
          from public.formulation_ingredients
          where rm_code in ('RM-T063-A', 'RM-T063-B')
          order by rm_code
        `,
      );
      expect(visible.rows).toEqual([{ version_id: orgAVersion, rm_code: 'RM-T063-A' }]);

      await expect(
        client.query(
          `
            insert into public.formulation_ingredients
              (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
            values ($1, 'RM-T063-CROSS', 1.000, 10.000, 1.0000, 2)
          `,
          [orgBVersion],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('keeps formulation_audit_log append-only', async () => {
    const auditId = randomUUID();

    await ownerPool.query(
      `
        insert into public.formulation_audit_log (id, org_id, event_type, event_payload, actor_user_id)
        values ($1, $2, 'formulation.created', '{}'::jsonb, $3)
      `,
      [auditId, orgA, orgAUser],
    );

    await expect(
      ownerPool.query(
        `
          update public.formulation_audit_log
          set event_payload = '{"tampered": true}'::jsonb
          where id = $1
        `,
        [auditId],
      ),
    ).rejects.toThrow(/append-only|cannot update/i);
    await expect(
      ownerPool.query('delete from public.formulation_audit_log where id = $1', [auditId]),
    ).rejects.toThrow(/append-only|cannot delete/i);
  });
});
