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
const migrationPath = resolve(packageRoot, 'migrations/087-costing.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '07000000-0000-4000-8000-000000000000';
const orgA = '07000000-0000-4000-8000-00000000000a';
const orgB = '07000000-0000-4000-8000-00000000000b';
const orgAUser = '07000000-0000-4000-8000-0000000000aa';
const orgBUser = '07000000-0000-4000-8000-0000000000bb';
const orgARole = '07000000-0000-4000-8000-0000000001aa';
const orgBRole = '07000000-0000-4000-8000-0000000001bb';
const productA = 'FA-T070-A';
const productB = 'FA-T070-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Costing Test Tenant', 'eu', 'https://costing.example.test')
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
      values ($1, $2, 'Costing Org A', 'bakery'),
             ($3, $2, 'Costing Org B', 'fmcg')
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
      values ($1, $2, 'costing_user', 'Costing Role A', '[]'::jsonb, true),
             ($3, $4, 'costing_user', 'Costing Role B', '[]'::jsonb, true)
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
      values ($1, $2, 'costing-a@example.test', 'Costing User A', $3),
             ($4, $5, 'costing-b@example.test', 'Costing User B', $6)
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
      values ($1, $2, 'Costing Product A', 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Costing Product B', 1, $3)
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

describe('087 costing migration contract', () => {
  it('creates org-scoped costing tables without stale tenant_id/GUC patterns', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/087-costing.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.costing_breakdowns/i);
    expect(sql).toMatch(/create table if not exists public\.costing_waterfall_steps/i);
    expect(sql).toMatch(/unique\s*\(\s*org_id\s*,\s*product_code\s*,\s*scenario\s*\)/i);
    expect(sql).toMatch(/step_index[\s\S]*between 1 and 9/i);
    expect(sql).toMatch(/breakdown_id[\s\S]*references public\.costing_breakdowns[\s\S]*on delete cascade/i);
    expect(sql).toMatch(/alter table public\.costing_breakdowns enable row level security/i);
    expect(sql).toMatch(/alter table public\.costing_breakdowns force row level security/i);
    expect(sql).toMatch(/alter table public\.costing_waterfall_steps enable row level security/i);
    expect(sql).toMatch(/alter table public\.costing_waterfall_steps force row level security/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('087 costing schema behavior', () => {
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

  it('publishes scenario uniqueness, org_id scope, indexes, and forced RLS', async () => {
    const columns = await ownerPool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'costing_breakdowns'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    expect(columnNames.has('scenario')).toBe(true);
    expect(columnNames.has('org_id')).toBe(true);
    expect(columnNames.has('tenant_id')).toBe(false);

    const unique = await ownerPool.query<{ constraint_name: string; columns: string }>(
      `
        select con.conname as constraint_name, string_agg(att.attname, ',' order by ord.n) as columns
        from pg_constraint con
        join unnest(con.conkey) with ordinality as ord(attnum, n) on true
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ord.attnum
        where con.conrelid = 'public.costing_breakdowns'::regclass
          and con.contype = 'u'
        group by con.conname
      `,
    );
    expect(unique.rows).toContainEqual({
      constraint_name: 'costing_breakdowns_org_product_scenario_unique',
      columns: 'org_id,product_code,scenario',
    });

    const rls = await ownerPool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relname, relrowsecurity, relforcerowsecurity
        from pg_class
        where oid in ('public.costing_breakdowns'::regclass, 'public.costing_waterfall_steps'::regclass)
        order by relname
      `,
    );
    expect(rls.rows).toEqual([
      { relname: 'costing_breakdowns', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'costing_waterfall_steps', relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const policies = await appPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `
        select tablename, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename in ('costing_breakdowns', 'costing_waterfall_steps')
        order by tablename, policyname
      `,
    );
    expect(policies.rows).toHaveLength(2);
    expect(policies.rows.every((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()'))).toBe(true);
    expect(policies.rows.every((row) => !`${row.qual ?? ''} ${row.with_check ?? ''}`.includes("current_setting('app.tenant_id'"))).toBe(true);
  });

  it('enforces scenario uniqueness per org/product/scenario', async () => {
    const firstId = randomUUID();
    const duplicateId = randomUUID();

    await ownerPool.query('delete from public.costing_breakdowns where product_code = $1', [productA]);
    await ownerPool.query(
      `
        insert into public.costing_breakdowns
          (id, org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
        values ($1, $2, $3, 'target', 1.23, 15.00, 1.45)
      `,
      [firstId, orgA, productA],
    );

    await expect(
      ownerPool.query(
        `
          insert into public.costing_breakdowns
            (id, org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
          values ($1, $2, $3, 'target', 1.24, 16.00, 1.48)
        `,
        [duplicateId, orgA, productA],
      ),
    ).rejects.toThrow(/costing_breakdowns_org_product_scenario_unique|duplicate key/i);
  });

  it('cascade-deletes costing_waterfall_steps when a breakdown is deleted', async () => {
    const breakdownId = randomUUID();
    const stepId = randomUUID();

    await ownerPool.query('delete from public.costing_breakdowns where id = $1', [breakdownId]);
    await ownerPool.query(
      `
        insert into public.costing_breakdowns
          (id, org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
        values ($1, $2, $3, 'cascade-test', 2.00, 20.00, 2.40)
      `,
      [breakdownId, orgA, productA],
    );
    await ownerPool.query(
      `
        insert into public.costing_waterfall_steps
          (id, breakdown_id, step_index, step_name, value_eur, delta_pct)
        values ($1, $2, 1, 'Raw materials', 1.00, 0.00)
      `,
      [stepId, breakdownId],
    );

    await ownerPool.query('delete from public.costing_breakdowns where id = $1', [breakdownId]);

    const remaining = await ownerPool.query<{ count: string }>(
      'select count(*) from public.costing_waterfall_steps where id = $1',
      [stepId],
    );
    expect(remaining.rows[0]?.count).toBe('0');
  });

  it('rejects step_index outside the 1..9 waterfall', async () => {
    const breakdownId = randomUUID();

    await ownerPool.query(
      `
        insert into public.costing_breakdowns
          (id, org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
        values ($1, $2, $3, 'check-test', 3.00, 25.00, 4.00)
      `,
      [breakdownId, orgA, productA],
    );

    await expect(
      ownerPool.query(
        `
          insert into public.costing_waterfall_steps
            (breakdown_id, step_index, step_name, value_eur, delta_pct)
          values ($1, 10, 'Invalid step', 1.00, 0.00)
        `,
        [breakdownId],
      ),
    ).rejects.toThrow(/costing_waterfall_steps_step_index_check|check constraint/i);
  });

  it('scopes breakdowns and waterfall steps through app.current_org_id for app_user', async () => {
    const orgABreakdown = randomUUID();
    const orgBBreakdown = randomUUID();
    const sessionToken = randomUUID();

    await ownerPool.query(
      `
        insert into public.costing_breakdowns
          (id, org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
        values ($1, $2, $3, 'rls-a', 1.00, 15.00, 1.20),
               ($4, $5, $6, 'rls-b', 2.00, 20.00, 2.50)
        on conflict (org_id, product_code, scenario) do nothing
      `,
      [orgABreakdown, orgA, productA, orgBBreakdown, orgB, productB],
    );
    await ownerPool.query(
      `
        insert into public.costing_waterfall_steps
          (breakdown_id, step_index, step_name, value_eur, delta_pct)
        values ($1, 1, 'Raw materials', 1.00, 0.00),
               ($2, 1, 'Raw materials', 2.00, 0.00)
      `,
      [orgABreakdown, orgBBreakdown],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const breakdowns = await client.query<{ id: string; org_id: string }>(
        `
          select id, org_id
          from public.costing_breakdowns
          where scenario in ('rls-a', 'rls-b')
          order by id
        `,
      );
      expect(breakdowns.rows).toEqual([{ id: orgABreakdown, org_id: orgA }]);

      const steps = await client.query<{ breakdown_id: string; step_name: string }>(
        `
          select breakdown_id, step_name
          from public.costing_waterfall_steps
          where breakdown_id in ($1, $2)
          order by breakdown_id
        `,
        [orgABreakdown, orgBBreakdown],
      );
      expect(steps.rows).toEqual([{ breakdown_id: orgABreakdown, step_name: 'Raw materials' }]);

      await expect(
        client.query(
          `
            insert into public.costing_breakdowns
              (org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
            values ($1, $2, 'cross-org-insert', 4.00, 30.00, 5.20)
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
