/**
 * T-056 — departments-rls.integration.test.ts
 *
 * Formalizes the Reference.Departments RLS contract (hotfix applied inline to
 * 011-departments.sql during the 2026-05-07 Wave A consistency audit).
 *
 * Acceptance criteria:
 *  AC1: relrowsecurity=true AND relforcerowsecurity=true AND ≥1 policy in pg_policies.
 *  AC2: app_user with non-Apex org context → 0 rows from Reference.Departments.
 *  AC3: app_user with Apex org context → exactly 7 rows.
 *  AC4: app_user INSERT with mismatched org_id fails with SQLSTATE 42501.
 *
 * Uses getOwnerConnection() for DDL/setup, getAppConnection() for all assertions.
 * Follows the rls.cross-org.integration.test.ts gold-standard harness pattern.
 *
 * // SKIP: requires DATABASE_URL — tests skip gracefully when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection, getAppConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
// // SKIP: requires DATABASE_URL
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');
const rlsBaselineMigrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const appRoleMigrationPath = resolve(packageRoot, 'migrations/006-app-role.sql');
const departmentsMigrationPath = resolve(packageRoot, 'migrations/011-departments.sql');
const apexDepartmentsSeedPath = resolve(packageRoot, 'seeds/apex-departments.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

// ── AC1: static metadata check (no DB required) ───────────────────────────────

describe('011 departments RLS — static contract', () => {
  it('011-departments.sql contains ENABLE ROW LEVEL SECURITY for Reference.Departments', () => {
    const migration = readFileSync(departmentsMigrationPath, 'utf8');
    expect(migration).toMatch(/alter\s+table\s+"Reference"\."Departments"\s+enable\s+row\s+level\s+security/i);
  });

  it('011-departments.sql contains FORCE ROW LEVEL SECURITY for Reference.Departments', () => {
    const migration = readFileSync(departmentsMigrationPath, 'utf8');
    expect(migration).toMatch(/alter\s+table\s+"Reference"\."Departments"\s+force\s+row\s+level\s+security/i);
  });

  it('011-departments.sql contains a CREATE POLICY using app.current_org_id()', () => {
    const migration = readFileSync(departmentsMigrationPath, 'utf8');
    expect(migration).toMatch(/create\s+policy\s+"?Departments_org_isolation"?/i);
    expect(migration).toMatch(/org_id\s*=\s*app\.current_org_id\s*\(\s*\)/i);
  });
});

// ── integration tests (require DATABASE_URL) ──────────────────────────────────

runIntegrationSuite('011 departments RLS — pg_class metadata (AC1)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await adminPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(departmentsMigrationPath, 'utf8'));
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  runIntegrationTest(
    'AC1a: pg_class.relrowsecurity = true for Reference.Departments',
    async () => {
      const result = await adminPool.query<{ relrowsecurity: boolean }>(
        `select relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'Reference'
           and c.relname = 'Departments'`,
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.relrowsecurity).toBe(true);
    },
  );

  runIntegrationTest(
    'AC1b: pg_class.relforcerowsecurity = true for Reference.Departments',
    async () => {
      const result = await adminPool.query<{ relforcerowsecurity: boolean }>(
        `select relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'Reference'
           and c.relname = 'Departments'`,
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.relforcerowsecurity).toBe(true);
    },
  );

  runIntegrationTest(
    'AC1c: pg_policies has at least one policy on Reference.Departments using app.current_org_id()',
    async () => {
      const result = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `select policyname, qual, with_check
         from pg_policies
         where schemaname = 'Reference'
           and tablename  = 'Departments'`,
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const allUseOrgId = result.rows.every(
        (row) =>
          `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()'),
      );
      expect(allUseOrgId).toBe(true);
    },
  );
});

// ── cross-org SELECT isolation and INSERT rejection (AC2, AC3, AC4) ───────────

runIntegrationSuite('011 departments RLS — cross-org isolation (AC2/AC3/AC4)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const apexOrgId = randomUUID();
  const otherOrgId = randomUUID();
  const sessionTokenApex = randomUUID();
  const sessionTokenOther = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    // Apply migrations in dependency order (all idempotent)
    await adminPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(departmentsMigrationPath, 'utf8'));

    // Ensure app_user role login + password is set for this test run
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

    // Grant Reference schema access to app_user
    await adminPool.query(`grant usage on schema "Reference" to app_user`);

    // Seed tenant
    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'RLS-056 Tenant', 'eu', 'https://rls-056.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    // Seed two orgs: "Apex" (has departments) and "Other" (has none)
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Apex Foods (RLS-056)', 'fmcg', 'apex-rls-056')
       on conflict (id) do nothing`,
      [apexOrgId, tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Other Org (RLS-056)', 'bakery')
       on conflict (id) do nothing`,
      [otherOrgId, tenantId],
    );

    // Insert exactly 7 Apex department rows (mirrors the apex seed) as owner
    const apexCodes = [
      ['core',       'Core',       'Core department'],
      ['technical',  'Technical',  'Technical department'],
      ['packaging',  'Packaging',  'Packaging department'],
      ['mrp',        'MRP',        'MRP department'],
      ['planning',   'Planning',   'Planning department'],
      ['production', 'Production', 'Production department'],
      ['price',      'Price',      'Price department'],
    ] as const;

    for (const [code, display_name, role_description] of apexCodes) {
      await adminPool.query(
        `insert into "Reference"."Departments" (id, org_id, code, display_name, role_description)
         values ($1, $2, $3, $4, $5)
         on conflict (org_id, code) do nothing`,
        [randomUUID(), apexOrgId, code, display_name, role_description],
      );
    }

    // Register trusted session tokens for both orgs
    await adminPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2), ($3, $4)
       on conflict (session_token) do nothing`,
      [sessionTokenApex, apexOrgId, sessionTokenOther, otherOrgId],
    );
  });

  afterAll(async () => {
    if (!adminPool) return;

    await adminPool
      .query(`delete from app.session_org_contexts where session_token in ($1, $2)`, [
        sessionTokenApex,
        sessionTokenOther,
      ])
      .catch(() => undefined);

    await adminPool
      .query(`delete from "Reference"."Departments" where org_id in ($1, $2)`, [apexOrgId, otherOrgId])
      .catch(() => undefined);

    await adminPool
      .query(`delete from public.organizations where id in ($1, $2)`, [apexOrgId, otherOrgId])
      .catch(() => undefined);

    await adminPool
      .query(`delete from public.tenants where id = $1`, [tenantId])
      .catch(() => undefined);

    await appPool?.end();
    await adminPool?.end();
  });

  // AC2 ─────────────────────────────────────────────────────────────────────

  runIntegrationTest(
    'AC2: app_user with non-Apex org context returns 0 rows from Reference.Departments',
    async () => {
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1, $2)', [sessionTokenOther, otherOrgId]);

        const result = await client.query<{ id: string }>(
          `select id from "Reference"."Departments"`,
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

  // AC3 ─────────────────────────────────────────────────────────────────────

  runIntegrationTest(
    'AC3: app_user with Apex org context returns exactly 7 rows from Reference.Departments',
    async () => {
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1, $2)', [sessionTokenApex, apexOrgId]);

        const result = await client.query<{ code: string }>(
          `select code from "Reference"."Departments" order by code`,
        );

        await client.query('rollback');
        expect(result.rows).toHaveLength(7);
        const codes = new Set(result.rows.map((r) => r.code));
        expect(codes).toEqual(
          new Set(['core', 'technical', 'packaging', 'mrp', 'planning', 'production', 'price']),
        );
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // AC4 ─────────────────────────────────────────────────────────────────────

  runIntegrationTest(
    'AC4: app_user INSERT with mismatched org_id fails with SQLSTATE 42501 (insufficient_privilege)',
    async () => {
      const client = await appPool.connect();
      try {
        await client.query('begin');
        // Set org context to Apex — but attempt INSERT with otherOrgId (mismatch)
        await client.query('select app.set_org_context($1, $2)', [sessionTokenApex, apexOrgId]);

        let caughtCode: string | undefined;
        try {
          await client.query(
            `insert into "Reference"."Departments" (id, org_id, code, display_name, role_description)
             values ($1, $2, 'rls-cross-insert', 'Cross-Org Insert Attempt', 'Should be rejected by RLS')`,
            [randomUUID(), otherOrgId],
          );
        } catch (insertErr: unknown) {
          caughtCode = (insertErr as { code?: string }).code;
        }

        await client.query('rollback');
        // Must be SQLSTATE 42501 (insufficient_privilege) — not a bare .rejects.toThrow()
        expect(caughtCode, 'expected SQLSTATE 42501 (insufficient_privilege)').toBe('42501');
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );
});
