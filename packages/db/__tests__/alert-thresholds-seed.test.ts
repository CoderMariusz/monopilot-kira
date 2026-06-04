/**
 * T-050 — Reference.AlertThresholds default seed
 *
 * Integration tests asserting:
 *  AC1 — Apex org gets the canonical default rows after migration 096 runs
 *  AC2 — Seed is idempotent (re-running leaves the row set unchanged)
 *  AC3 — A second org created after migration gets the same defaults via trigger
 *
 * Note: migration 167 (T-070) extends the SAME per-org seed function with two
 * 03-TECHNICAL defaults (atp_swab_rlu_max, catch_weight_variance_pct), so the
 * canonical default set is now 5 rows. EXPECTED_DEFAULTS reflects that.
 *
 * Static tests (no DB) verify the migration file contract:
 *  - uses ON CONFLICT DO NOTHING (idempotent)
 *  - uses org_id (not tenant_id)
 *  - contains the three canonical threshold keys
 *  - references a DISTINCTLY named function (not clobbering existing seed triggers)
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const migrationPath = resolve(packageRoot, 'migrations', '096-alert-thresholds-default-seed.sql');

const APEX_ORG_ID = '00000000-0000-0000-0000-000000000002';

// Expected default rows per PRD §11.3 + §17.11.3 (migration 096)
// plus the two 03-TECHNICAL defaults added by migration 167 / T-070
// (PRD §10.6 ATP swab ≤10 RLU, §8.5/§8.6 catch-weight variance default 5%).
const EXPECTED_DEFAULTS = [
  { threshold_key: 'launch_alert_red_days',     value_int: 10,  value_text: null },
  { threshold_key: 'launch_alert_yellow_days',   value_int: 21,  value_text: null },
  { threshold_key: 'costing_margin_warn_pct',    value_int: 15,  value_text: null },
  { threshold_key: 'atp_swab_rlu_max',           value_int: 10,  value_text: null },
  { threshold_key: 'catch_weight_variance_pct',  value_int: 5,   value_text: null },
] as const;

const EXPECTED_COUNT = EXPECTED_DEFAULTS.length;

// ============================================================
// Static contract tests (no DB required)
// ============================================================
describe('T-050 alert-thresholds-seed — static contract (migration 096)', () => {
  it('migration file 096-alert-thresholds-default-seed.sql exists', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('uses ON CONFLICT DO NOTHING (idempotent inserts)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+NOTHING/i);
  });

  it('scopes by org_id — never uses tenant_id or current_setting', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\./i);
  });

  it('contains all three canonical threshold keys', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('launch_alert_red_days');
    expect(sql).toContain('launch_alert_yellow_days');
    expect(sql).toContain('costing_margin_warn_pct');
  });

  it('defines a distinctly named seed function (not overwriting existing seed_reference_data_on_org_insert)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    // Must define the alert-threshold-specific function
    expect(sql).toMatch(/seed_alert_thresholds_on_org_insert/i);
    // Must NOT redefine the pre-existing generic reference seed trigger
    expect(sql).not.toMatch(/seed_reference_data_on_org_insert/i);
  });

  it('seeds the Apex org (00000000-0000-0000-0000-000000000002)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('00000000-0000-0000-0000-000000000002');
  });
});

// ============================================================
// Integration tests (require DATABASE_URL)
// ============================================================
runIntegrationSuite('T-050 alert-thresholds-seed — integration (database)', () => {
  let adminPool: pg.Pool;

  const tenantId = randomUUID();
  const secondOrgId = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;
    adminPool = getOwnerConnection();

    // Ensure app_user exists (mirrors pattern from other integration tests)
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

    // Create a tenant + second org for the trigger test (AC3)
    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-050 Tenant', 'eu', 'https://t-050.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
  });

  afterAll(async () => {
    if (!adminPool) return;

    await adminPool
      .query(
        `delete from "Reference"."AlertThresholds" where org_id = $1`,
        [secondOrgId],
      )
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.organizations where id = $1`, [secondOrgId])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.tenants where id = $1`, [tenantId])
      .catch(() => undefined);

    await adminPool.end();
  });

  runIntegrationTest('AC1: Apex org has exactly the canonical default AlertThreshold rows with correct values', async () => {
    const result = await adminPool.query<{
      threshold_key: string;
      value_int: number | null;
      value_text: string | null;
    }>(
      `select threshold_key, value_int, value_text
         from "Reference"."AlertThresholds"
        where org_id = $1
        order by threshold_key`,
      [APEX_ORG_ID],
    );

    expect(result.rows).toHaveLength(EXPECTED_COUNT);

    // Sort both arrays by threshold_key for stable comparison
    const sorted = [...EXPECTED_DEFAULTS].sort((a, b) =>
      a.threshold_key.localeCompare(b.threshold_key),
    );
    for (let i = 0; i < sorted.length; i++) {
      expect(result.rows[i].threshold_key).toBe(sorted[i].threshold_key);
      expect(result.rows[i].value_int).toBe(sorted[i].value_int);
      expect(result.rows[i].value_text).toBe(sorted[i].value_text);
    }
  });

  runIntegrationTest('AC2: Running seed function again is idempotent — row count unchanged, updated_at unchanged', async () => {
    // Capture current updated_at values
    const before = await adminPool.query<{ threshold_key: string; updated_at: Date }>(
      `select threshold_key, updated_at
         from "Reference"."AlertThresholds"
        where org_id = $1
        order by threshold_key`,
      [APEX_ORG_ID],
    );
    expect(before.rows).toHaveLength(EXPECTED_COUNT);

    // Re-invoke the seed function directly
    await adminPool.query(`select public.seed_alert_thresholds_for_org($1::uuid)`, [APEX_ORG_ID]);

    const after = await adminPool.query<{ threshold_key: string; updated_at: Date }>(
      `select threshold_key, updated_at
         from "Reference"."AlertThresholds"
        where org_id = $1
        order by threshold_key`,
      [APEX_ORG_ID],
    );

    expect(after.rows).toHaveLength(EXPECTED_COUNT);

    // updated_at must not have changed (ON CONFLICT DO NOTHING)
    for (let i = 0; i < before.rows.length; i++) {
      expect(after.rows[i].threshold_key).toBe(before.rows[i].threshold_key);
      expect(after.rows[i].updated_at.toISOString()).toBe(
        before.rows[i].updated_at.toISOString(),
      );
    }
  });

  runIntegrationTest('AC3: A new org created after migration gets the default threshold rows via trigger', async () => {
    // Insert a second org — the trigger should fire and seed AlertThresholds
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'T-050 Second Org', 'fmcg', 't-050-second-org')
       on conflict (id) do nothing`,
      [secondOrgId, tenantId],
    );

    const result = await adminPool.query<{
      threshold_key: string;
      value_int: number | null;
    }>(
      `select threshold_key, value_int
         from "Reference"."AlertThresholds"
        where org_id = $1
        order by threshold_key`,
      [secondOrgId],
    );

    expect(result.rows).toHaveLength(EXPECTED_COUNT);

    const sorted = [...EXPECTED_DEFAULTS].sort((a, b) =>
      a.threshold_key.localeCompare(b.threshold_key),
    );
    for (let i = 0; i < sorted.length; i++) {
      expect(result.rows[i].threshold_key).toBe(sorted[i].threshold_key);
      expect(result.rows[i].value_int).toBe(sorted[i].value_int);
    }
  });
});
