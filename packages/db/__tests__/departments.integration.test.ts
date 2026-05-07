/**
 * T-019 — departments.integration.test.ts
 * Integration tests for Reference.Departments taxonomy seed (ADR-030).
 *
 * Acceptance criteria:
 *  AC1: Given Apex departments seed runs, SELECT code WHERE org_id=apex → exactly
 *       {core, technical, packaging, mrp, planning, production, price}
 *  AC2: A second org can insert dept_overrides JSONB and it roundtrips exactly.
 *  AC3: Every Apex row has marker = 'APEX-CONFIG'.
 *
 * Skips gracefully when DATABASE_URL is not set (CI without Postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection, getAppConnection } from '../test-utils/test-pool.js';

const appUserPassword = ['app', 'user', 'test', 'password'].join('_');

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? it : it.skip;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rlsBaselineMigrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');

const baselineMigrationPath      = resolve(packageRoot, 'migrations/001-baseline.sql');
const departmentsMigrationPath   = resolve(packageRoot, 'migrations/011-departments.sql');
const apexDepartmentsSeedPath    = resolve(packageRoot, 'seeds/apex-departments.sql');

// ── static shape contract (no DB required) ────────────────────────────────────

describe('011 departments migration — static shape contract', () => {
  it('migration file exists at the required path', () => {
    expect(existsSync(departmentsMigrationPath), 'expected packages/db/migrations/011-departments.sql to exist').toBe(true);
  });

  it('migration creates Reference.Departments with the required columns', () => {
    const migration = readFileSync(departmentsMigrationPath, 'utf8');
    expect(migration).toMatch(/create\s+schema\s+if\s+not\s+exists\s+"?Reference"?/i);
    expect(migration).toMatch(/"Reference"\."Departments"/);
    expect(migration).toMatch(/\bcode\b/);
    expect(migration).toMatch(/\bdisplay_name\b/);
    expect(migration).toMatch(/\brole_description\b/);
    expect(migration).toMatch(/\bmarker\b/);
    expect(migration).toMatch(/\borg_id\b/);
  });

  it('migration adds dept_overrides JSONB column to organizations', () => {
    const migration = readFileSync(departmentsMigrationPath, 'utf8');
    expect(migration).toMatch(/dept_overrides\s+jsonb/i);
    expect(migration).toMatch(/alter\s+table\s+public\.organizations/i);
  });

  it('apex-departments seed file exists at the required path', () => {
    expect(existsSync(apexDepartmentsSeedPath), 'expected packages/db/seeds/apex-departments.sql to exist').toBe(true);
  });

  it('apex-departments seed targets all 7 Apex department codes', () => {
    const seed = readFileSync(apexDepartmentsSeedPath, 'utf8');
    for (const code of ['core', 'technical', 'packaging', 'mrp', 'planning', 'production', 'price']) {
      expect(seed, `seed must include code '${code}'`).toMatch(new RegExp(`'${code}'`));
    }
    expect(seed).toMatch(/APEX-CONFIG/);
    expect(seed).toMatch(/on conflict.*do nothing/i);
  });
});

// ── integration tests (require DATABASE_URL) ──────────────────────────────────

runIntegrationSuite('011 departments integration — Postgres', () => {
  let pool: pg.Pool;
  let apexOrgId: string;
  let secondOrgId: string;
  const tenantId = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }

    pool = getOwnerConnection();

    // Run baseline + departments migrations (idempotent)
    await pool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await pool.query(readFileSync(departmentsMigrationPath, 'utf8'));

    // Insert a tenant
    await pool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Test Tenant', 'eu', 'https://test.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    // Insert Apex org (external_id = 'apex')
    apexOrgId = randomUUID();
    await pool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Apex Foods', 'fmcg', 'apex')
       on conflict (id) do nothing`,
      [apexOrgId, tenantId],
    );

    // Insert second org (no external_id = 'apex', for dept_overrides test)
    secondOrgId = randomUUID();
    await pool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Other Foods', 'bakery')
       on conflict (id) do nothing`,
      [secondOrgId, tenantId],
    );

    // Seed Apex departments — replace external_id lookup with v_apex_org_id forced
    // by inserting directly using the known apexOrgId (mirrors what the seed does).
    const seedSql = readFileSync(apexDepartmentsSeedPath, 'utf8');
    // Re-seed by running the seed file (the 'apex' external_id row was just inserted above)
    await pool.query(seedSql);
  });

  afterAll(async () => {
    if (!pool) return;

    // Clean up in dependency order
    await pool.query(
      `delete from "Reference"."Departments" where org_id in ($1, $2)`,
      [apexOrgId, secondOrgId],
    ).catch(() => undefined);

    await pool.query(
      `delete from public.organizations where id in ($1, $2)`,
      [apexOrgId, secondOrgId],
    ).catch(() => undefined);

    await pool.query(
      `delete from public.tenants where id = $1`,
      [tenantId],
    ).catch(() => undefined);

    await pool.end();
  });

  // AC1 ─────────────────────────────────────────────────────────────────────

  runIntegrationTest(
    'AC1: SELECT code FROM Reference.Departments WHERE org_id=apex returns exactly the 7 expected codes',
    async () => {
      const result = await pool.query<{ code: string }>(
        `select code from "Reference"."Departments" where org_id = $1 order by code`,
        [apexOrgId],
      );

      const codes = new Set(result.rows.map((row) => row.code));
      expect(codes).toEqual(new Set(['core', 'technical', 'packaging', 'mrp', 'planning', 'production', 'price']));
      expect(result.rows).toHaveLength(7);
    },
  );

  // AC2 ─────────────────────────────────────────────────────────────────────

  runIntegrationTest(
    'AC2: A second org inserting dept_overrides JSONB roundtrips the value exactly',
    async () => {
      const overrides = { merge: { 'mrp+planning': 'supply_chain' } };

      await pool.query(
        `update public.organizations set dept_overrides = $1::jsonb where id = $2`,
        [JSON.stringify(overrides), secondOrgId],
      );

      const result = await pool.query<{ dept_overrides: unknown }>(
        `select dept_overrides from public.organizations where id = $1`,
        [secondOrgId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.dept_overrides).toEqual(overrides);
    },
  );

  // AC3 ─────────────────────────────────────────────────────────────────────

  runIntegrationTest(
    'AC3: Every Apex department row has marker = APEX-CONFIG',
    async () => {
      const result = await pool.query<{ code: string; marker: string }>(
        `select code, marker from "Reference"."Departments" where org_id = $1 order by code`,
        [apexOrgId],
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(7);
      for (const row of result.rows) {
        expect(row.marker, `dept '${row.code}' must have marker='APEX-CONFIG'`).toBe('APEX-CONFIG');
      }
    },
  );

  // dept_overrides default ──────────────────────────────────────────────────

  runIntegrationTest(
    'organizations.dept_overrides defaults to empty JSONB object for new rows',
    async () => {
      const result = await pool.query<{ dept_overrides: unknown }>(
        `select dept_overrides from public.organizations where id = $1`,
        [apexOrgId],
      );

      expect(result.rows[0]?.dept_overrides).toEqual({});
    },
  );

  // Reference schema visibility ─────────────────────────────────────────────

  runIntegrationTest(
    'Reference.Departments table exists in information_schema with required columns',
    async () => {
      const result = await pool.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_schema = 'Reference'
           and table_name   = 'Departments'
         order by ordinal_position`,
      );

      const colNames = result.rows.map((row) => row.column_name);
      expect(colNames).toEqual(expect.arrayContaining(['id', 'org_id', 'code', 'display_name', 'role_description', 'marker', 'created_at']));
    },
  );
});

// ── RLS cross-org isolation (HOTFIX T-019) ────────────────────────────────────

runIntegrationSuite('011 departments RLS — cross-org isolation', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId  = randomUUID();
  const orgAId    = randomUUID();
  const orgBId    = randomUUID();
  const deptId    = randomUUID();
  const sessionTokenA = randomUUID();
  const sessionTokenB = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    adminPool = getOwnerConnection();
    appPool   = getAppConnection();

    // Apply required migrations in dependency order
    await adminPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(departmentsMigrationPath, 'utf8'));

    // Ensure app_user role exists with the test password
    await adminPool.query(`
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

    // Grant Reference schema access (HOTFIX policy grants to PUBLIC; also need schema usage)
    await adminPool.query(`grant usage on schema "Reference" to app_user`);

    // Seed tenant and two orgs
    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'RLS Test Tenant', 'eu', 'https://rls-test.example')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Org A (RLS Test)', 'fmcg'),
              ($3, $2, 'Org B (RLS Test)', 'bakery')
       on conflict (id) do nothing`,
      [orgAId, tenantId, orgBId],
    );

    // Insert a department row belonging to Org A (as superuser / owner)
    await adminPool.query(
      `insert into "Reference"."Departments" (id, org_id, code, display_name, role_description)
       values ($1, $2, 'rls-test-dept', 'RLS Test Dept', 'Created for RLS isolation test')
       on conflict (org_id, code) do nothing`,
      [deptId, orgAId],
    );

    // Register trusted session tokens for both orgs in app.session_org_contexts
    await adminPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2), ($3, $4)
       on conflict (session_token) do nothing`,
      [sessionTokenA, orgAId, sessionTokenB, orgBId],
    );
  });

  afterAll(async () => {
    if (!adminPool) return;

    await adminPool.query(
      `delete from app.session_org_contexts where session_token in ($1, $2)`,
      [sessionTokenA, sessionTokenB],
    ).catch(() => undefined);

    await adminPool.query(
      `delete from "Reference"."Departments" where org_id = $1`,
      [orgAId],
    ).catch(() => undefined);

    await adminPool.query(
      `delete from public.organizations where id in ($1, $2)`,
      [orgAId, orgBId],
    ).catch(() => undefined);

    await adminPool.query(
      `delete from public.tenants where id = $1`,
      [tenantId],
    ).catch(() => undefined);

    await appPool?.end();
    await adminPool?.end();
  });

  runIntegrationTest(
    'RLS isolation: app_user with Org B context sees 0 rows from Org A departments',
    async () => {
      // app.current_org_id() is transaction-scoped — wrap set + select in one txn
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1, $2)', [sessionTokenB, orgBId]);

        const result = await client.query<{ id: string }>(
          `select id from "Reference"."Departments" where org_id = $1`,
          [orgAId],
        );

        await client.query('rollback');
        expect(result.rows).toHaveLength(0);
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );

  runIntegrationTest(
    'RLS isolation: app_user with Org A context can see Org A department',
    async () => {
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1, $2)', [sessionTokenA, orgAId]);

        const result = await client.query<{ id: string }>(
          `select id from "Reference"."Departments" where id = $1`,
          [deptId],
        );

        await client.query('rollback');
        expect(result.rows).toHaveLength(1);
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );
});
