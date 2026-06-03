/**
 * 072 — integration-settings.integration.test.ts (02-settings W7)
 *
 * Validates the integration_settings RLS + isolation contract introduced by
 * migration 072-integration-settings.sql. This table backs the email provider
 * loader (apps/web/actions/email/load-email-config.ts), which previously failed
 * closed via to_regclass() because no migration created the table.
 *
 * Acceptance criteria (mirrors departments-rls.integration.test.ts gold standard):
 *  AC1: relrowsecurity=true AND relforcerowsecurity=true AND ≥1 policy using app.current_org_id().
 *  AC2: app_user with org-A context cannot SELECT org-B's row (0 rows).
 *  AC3: app_user with org-A context reads exactly its own row.
 *  AC4: app_user INSERT with mismatched org_id fails with SQLSTATE 42501.
 *  AC5: unique(org_id, category) is enforced.
 *
 * Uses getOwnerConnection() for DDL/setup, getAppConnection() for all assertions.
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
const integrationSettingsMigrationPath = resolve(packageRoot, 'migrations/072-integration-settings.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

// ── AC1: static metadata check (no DB required) ───────────────────────────────

describe('072 integration_settings — static contract', () => {
  it('migration enables ROW LEVEL SECURITY for public.integration_settings', () => {
    const migration = readFileSync(integrationSettingsMigrationPath, 'utf8');
    expect(migration).toMatch(
      /alter\s+table\s+public\.integration_settings\s+enable\s+row\s+level\s+security/i,
    );
  });

  it('migration FORCES ROW LEVEL SECURITY for public.integration_settings', () => {
    const migration = readFileSync(integrationSettingsMigrationPath, 'utf8');
    expect(migration).toMatch(
      /alter\s+table\s+public\.integration_settings\s+force\s+row\s+level\s+security/i,
    );
  });

  it('migration CREATEs a POLICY using app.current_org_id()', () => {
    const migration = readFileSync(integrationSettingsMigrationPath, 'utf8');
    expect(migration).toMatch(/create\s+policy\s+integration_settings_org_context/i);
    expect(migration).toMatch(/org_id\s*=\s*app\.current_org_id\s*\(\s*\)/i);
  });

  it('migration grants only to app_user and revokes from public', () => {
    const migration = readFileSync(integrationSettingsMigrationPath, 'utf8');
    expect(migration).toMatch(/revoke\s+all\s+on\s+public\.integration_settings\s+from\s+public/i);
    expect(migration).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.integration_settings\s+to\s+app_user/i,
    );
  });

  it('migration declares unique(org_id, category)', () => {
    const migration = readFileSync(integrationSettingsMigrationPath, 'utf8');
    expect(migration).toMatch(/unique\s*\(\s*org_id\s*,\s*category\s*\)/i);
  });
});

// ── integration tests (require DATABASE_URL) ──────────────────────────────────

runIntegrationSuite('072 integration_settings — RLS isolation (AC1–AC5)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const sessionTokenA = randomUUID();
  const sessionTokenB = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    // Apply migrations in dependency order (all idempotent)
    await adminPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
    await adminPool.query(readFileSync(integrationSettingsMigrationPath, 'utf8'));

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

    // Seed tenant + two orgs
    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'INT-072 Tenant', 'eu', 'https://int-072.example')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Org A (INT-072)', 'fmcg', 'orga-int-072')
       on conflict (id) do nothing`,
      [orgA, tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Org B (INT-072)', 'bakery', 'orgb-int-072')
       on conflict (id) do nothing`,
      [orgB, tenantId],
    );

    // One email-config row per org (owner-side seed)
    await adminPool.query(
      `insert into public.integration_settings (id, org_id, category, provider, config, is_active)
       values ($1, $2, 'email', 'Resend', '{"from_email":"a@example.com"}'::jsonb, true)
       on conflict (org_id, category) do nothing`,
      [randomUUID(), orgA],
    );
    await adminPool.query(
      `insert into public.integration_settings (id, org_id, category, provider, config, is_active)
       values ($1, $2, 'email', 'Postmark', '{"from_email":"b@example.com"}'::jsonb, true)
       on conflict (org_id, category) do nothing`,
      [randomUUID(), orgB],
    );

    // Register trusted session tokens
    await adminPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2), ($3, $4)
       on conflict (session_token) do nothing`,
      [sessionTokenA, orgA, sessionTokenB, orgB],
    );
  });

  afterAll(async () => {
    if (!adminPool) return;

    await adminPool
      .query(`delete from app.session_org_contexts where session_token in ($1, $2)`, [
        sessionTokenA,
        sessionTokenB,
      ])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.integration_settings where org_id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);

    await appPool?.end();
    await adminPool?.end();
  });

  // AC1 ─────────────────────────────────────────────────────────────────────
  runIntegrationTest('AC1: forced RLS + policy uses app.current_org_id()', async () => {
    const meta = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'integration_settings'`,
    );
    expect(meta.rows).toHaveLength(1);
    expect(meta.rows[0]?.relrowsecurity).toBe(true);
    expect(meta.rows[0]?.relforcerowsecurity).toBe(true);

    const policies = await adminPool.query<{ qual: string | null; with_check: string | null }>(
      `select qual, with_check from pg_policies
        where schemaname = 'public' and tablename = 'integration_settings'`,
    );
    expect(policies.rows.length).toBeGreaterThanOrEqual(1);
    expect(
      policies.rows.every((r) => `${r.qual ?? ''} ${r.with_check ?? ''}`.includes('app.current_org_id()')),
    ).toBe(true);
  });

  // AC2 + AC3 ─────────────────────────────────────────────────────────────────
  runIntegrationTest('AC2/AC3: org-A context reads only its own row', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1, $2)', [sessionTokenA, orgA]);
      const result = await client.query<{ provider: string; from_email: string }>(
        `select provider, config->>'from_email' as from_email from public.integration_settings`,
      );
      await client.query('rollback');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.provider).toBe('Resend');
      expect(result.rows[0]?.from_email).toBe('a@example.com');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  // AC4 ─────────────────────────────────────────────────────────────────────
  runIntegrationTest('AC4: INSERT with mismatched org_id fails SQLSTATE 42501', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1, $2)', [sessionTokenA, orgA]);
      let caughtCode: string | undefined;
      try {
        await client.query(
          `insert into public.integration_settings (id, org_id, category, provider)
           values ($1, $2, 'sms', 'Twilio')`,
          [randomUUID(), orgB],
        );
      } catch (insertErr: unknown) {
        caughtCode = (insertErr as { code?: string }).code;
      }
      await client.query('rollback');
      expect(caughtCode, 'expected SQLSTATE 42501 (insufficient_privilege)').toBe('42501');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  // AC5 ─────────────────────────────────────────────────────────────────────
  runIntegrationTest('AC5: unique(org_id, category) is enforced', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1, $2)', [sessionTokenA, orgA]);
      let caughtCode: string | undefined;
      try {
        await client.query(
          `insert into public.integration_settings (id, org_id, category, provider)
           values ($1, $2, 'email', 'SES')`,
          [randomUUID(), orgA],
        );
      } catch (dupErr: unknown) {
        caughtCode = (dupErr as { code?: string }).code;
      }
      await client.query('rollback');
      // 23505 = unique_violation
      expect(caughtCode, 'expected SQLSTATE 23505 (unique_violation)').toBe('23505');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
});
