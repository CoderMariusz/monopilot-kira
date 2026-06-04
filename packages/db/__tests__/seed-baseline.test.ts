/**
 * T-070 — Seed: 03-technical baseline (alert_thresholds + iso4217)
 *
 * Scope clarification (verified against the repo, not the stale task draft):
 *   - The manufacturing_operations seed already ships (packages/db/seeds/
 *     manufacturing-operations.sql + migration 078) and is intentionally
 *     org-industry-gated, so it is NOT re-seeded here.
 *   - The MISSING T-070 portions are:
 *       1. The two 03-TECHNICAL alert_thresholds defaults that the PRD calls for
 *          but migration 096 (01-NPD) never seeded:
 *            • atp_swab_rlu_max          = 10   (PRD §10.6 — ATP swab ≤10 RLU)
 *            • catch_weight_variance_pct = 5    (PRD §8.5/§8.6 — default 5.0%)
 *       2. A global ISO-4217 currency reference table (PRD §11.6 V-TEC-52:
 *          "Currency ∈ ISO 4217 supported list"; §11.3 multi-currency Phase 2).
 *
 * Delivered as migration 167 (the deploy runner skips seeds/*; seed rows must
 * live in a numbered migration to reach Supabase).
 *
 * Static contract tests run with no DB. Integration tests require DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_OWNER;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const migrationPath = resolve(packageRoot, 'migrations', '167-technical-baseline-seed.sql');

const APEX_ORG_ID = '00000000-0000-0000-0000-000000000002';

// New 03-TECHNICAL alert_thresholds defaults this migration must add.
const TECHNICAL_THRESHOLDS = [
  { threshold_key: 'atp_swab_rlu_max', value_int: 10 },
  { threshold_key: 'catch_weight_variance_pct', value_int: 5 },
] as const;

// A representative subset of the ISO-4217 supported list that must be present.
const REQUIRED_CURRENCIES = [
  { code: 'PLN', minor_unit: 2 },
  { code: 'EUR', minor_unit: 2 },
  { code: 'USD', minor_unit: 2 },
  { code: 'GBP', minor_unit: 2 },
  { code: 'JPY', minor_unit: 0 },
] as const;

// ============================================================
// Static contract tests (no DB required)
// ============================================================
describe('T-070 technical-baseline-seed — static contract (migration 167)', () => {
  it('migration file 167-technical-baseline-seed.sql exists', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('uses ON CONFLICT DO NOTHING (idempotent inserts)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+NOTHING/i);
  });

  it('scopes org-scoped seeds by org_id — never tenant_id or raw current_setting', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\./i);
  });

  it('contains both new 03-TECHNICAL threshold keys', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('atp_swab_rlu_max');
    expect(sql).toContain('catch_weight_variance_pct');
  });

  it('creates the global iso4217 reference table', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.iso4217/i);
  });

  it('iso4217 is an un-scoped global reference table (no org_id column)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    // The iso4217 CREATE TABLE block must not introduce an org_id column.
    const createMatch = sql.match(/create\s+table\s+if\s+not\s+exists\s+public\.iso4217[\s\S]*?\);/i);
    expect(createMatch, 'iso4217 CREATE TABLE block must be present').not.toBeNull();
    expect(createMatch![0]).not.toMatch(/\borg_id\b/i);
  });

  it('grants SELECT on iso4217 to app_user and revokes from public (read-only ref)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.iso4217\s+from\s+public/i);
    expect(sql).toMatch(/grant\s+select\s+on\s+public\.iso4217\s+to\s+app_user/i);
  });

  it('does not clobber the generic per-org reference seed trigger', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).not.toMatch(/seed_reference_data_on_org_insert/i);
  });
});

// ============================================================
// Integration tests (require DATABASE_URL)
// ============================================================
runIntegrationSuite('T-070 technical-baseline-seed — integration (database)', () => {
  let adminPool: pg.Pool;
  const tenantId = randomUUID();
  const secondOrgId = randomUUID();

  beforeAll(async () => {
    adminPool = getOwnerConnection();

    const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
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

    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-070 Tenant', 'eu', 'https://t-070.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
  });

  afterAll(async () => {
    if (!adminPool) return;
    await adminPool
      .query(`delete from "Reference"."AlertThresholds" where org_id = $1`, [secondOrgId])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.organizations where id = $1`, [secondOrgId])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.tenants where id = $1`, [tenantId])
      .catch(() => undefined);
    await adminPool.end();
  });

  // --- alert_thresholds ---
  runIntegrationTest('AC: Apex org has both new 03-TECHNICAL threshold rows with correct values', async () => {
    const result = await adminPool.query<{ threshold_key: string; value_int: number | null }>(
      `select threshold_key, value_int
         from "Reference"."AlertThresholds"
        where org_id = $1
          and threshold_key in ('atp_swab_rlu_max', 'catch_weight_variance_pct')
        order by threshold_key`,
      [APEX_ORG_ID],
    );
    expect(result.rows).toHaveLength(2);
    const byKey = Object.fromEntries(result.rows.map((r) => [r.threshold_key, r.value_int]));
    for (const t of TECHNICAL_THRESHOLDS) {
      expect(byKey[t.threshold_key]).toBe(t.value_int);
    }
  });

  runIntegrationTest('AC: re-invoking the per-org seed fn is idempotent (no duplicate threshold rows)', async () => {
    await adminPool.query(`select public.seed_alert_thresholds_for_org($1::uuid)`, [APEX_ORG_ID]);
    const count = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
         from "Reference"."AlertThresholds"
        where org_id = $1
          and threshold_key in ('atp_swab_rlu_max', 'catch_weight_variance_pct')`,
      [APEX_ORG_ID],
    );
    expect(count.rows[0]?.count).toBe('2');
  });

  runIntegrationTest('AC: a new org created after the migration gets the new thresholds via the existing trigger', async () => {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'T-070 Second Org', 'fmcg', 't-070-second-org')
       on conflict (id) do nothing`,
      [secondOrgId, tenantId],
    );
    const result = await adminPool.query<{ threshold_key: string; value_int: number | null }>(
      `select threshold_key, value_int
         from "Reference"."AlertThresholds"
        where org_id = $1
          and threshold_key in ('atp_swab_rlu_max', 'catch_weight_variance_pct')
        order by threshold_key`,
      [secondOrgId],
    );
    expect(result.rows).toHaveLength(2);
  });

  // --- iso4217 ---
  runIntegrationTest('AC: iso4217 global reference table exists with code PK + minor_unit', async () => {
    const reg = await adminPool.query<{ t: string | null }>(
      `select to_regclass('public.iso4217')::text as t`,
    );
    expect(reg.rows[0]?.t).toBe('iso4217');

    const cols = await adminPool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = 'iso4217'
        order by ordinal_position`,
    );
    const names = cols.rows.map((c) => c.column_name);
    expect(names).toContain('code');
    expect(names).toContain('currency_name');
    expect(names).toContain('minor_unit');
  });

  runIntegrationTest('AC: iso4217 is seeded with the required ISO-4217 currencies (idempotent)', async () => {
    const result = await adminPool.query<{ code: string; minor_unit: number }>(
      `select code, minor_unit from public.iso4217
        where code = any($1::text[]) order by code`,
      [REQUIRED_CURRENCIES.map((c) => c.code)],
    );
    expect(result.rows).toHaveLength(REQUIRED_CURRENCIES.length);
    const byCode = Object.fromEntries(result.rows.map((r) => [r.code, r.minor_unit]));
    for (const c of REQUIRED_CURRENCIES) {
      expect(byCode[c.code]).toBe(c.minor_unit);
    }

    // PLN (the organizations.currency default) must be present so V-TEC-52 holds.
    const pln = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from public.iso4217 where code = 'PLN'`,
    );
    expect(pln.rows[0]?.count).toBe('1');
  });

  runIntegrationTest('AC: iso4217 is read-only for app_user (RLS-free global ref, no INSERT grant)', async () => {
    const granted = await adminPool.query<{ priv: string }>(
      `select privilege_type as priv
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'iso4217' and grantee = 'app_user'
        order by privilege_type`,
    );
    const privs = granted.rows.map((r) => r.priv);
    expect(privs).toContain('SELECT');
    expect(privs).not.toContain('INSERT');
    expect(privs).not.toContain('UPDATE');
    expect(privs).not.toContain('DELETE');
  });
});
