/**
 * 02-settings schema foundation (migrations 063–068) — RLS + cross-org isolation.
 *
 * Covers T-122 (org_authorization_policies), T-073 (unit_of_measure + uom_custom_conversions),
 * T-112 (d365_sync_runs), T-113 (email_delivery_log), T-013 (feature_flags_core), T-011 (login_attempts).
 *
 * Two layers:
 *   1. Static migration-text assertions (RLS forced, app.current_org_id(), grants) — always run.
 *   2. Live cross-org isolation against the local Postgres (DATABASE_URL set) — proves a row inserted
 *      under org A is invisible under org B's context, and a cross-org INSERT is rejected.
 *
 * Live layer uses two FRESH random org ids per run (no truncate of shared baseline tables) so it is
 * safe under parallel test execution.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection, getAppConnection } from '../test-utils/test-pool.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function migration(name: string): string {
  return readFileSync(resolve(packageRoot, 'migrations', name), 'utf8');
}

const NEW_TABLES = [
  'org_authorization_policies',
  'unit_of_measure',
  'uom_custom_conversions',
  'd365_sync_runs',
  'email_delivery_log',
  'feature_flags_core',
  'login_attempts',
] as const;

const MIGRATION_FOR: Record<(typeof NEW_TABLES)[number], string> = {
  org_authorization_policies: '063-org-authorization-policies.sql',
  unit_of_measure: '064-unit-of-measure.sql',
  uom_custom_conversions: '064-unit-of-measure.sql',
  d365_sync_runs: '065-d365-sync-runs.sql',
  email_delivery_log: '066-email-delivery-log.sql',
  feature_flags_core: '067-feature-flags-core.sql',
  login_attempts: '068-login-attempts.sql',
};

describe('migrations 063–068 — RLS + grants contract (static)', () => {
  for (const table of NEW_TABLES) {
    it(`${table}: enable+force RLS, app.current_org_id() policy, app_user grants, no tenant_id`, () => {
      const sql = migration(MIGRATION_FOR[table]);
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`create policy ${table}_org_context`, 'i'));
      expect(sql).toMatch(/app\.current_org_id\(\)/);
      expect(sql).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${table} to app_user`, 'i'));
      // Wave0 lock: never a tenant_id column, never raw GUC reads. Strip `-- ...` comments first
      // (descriptive comments legitimately say "org_id NOT tenant_id").
      const code = sql.replace(/--[^\n]*/g, '');
      expect(code).not.toMatch(/\btenant_id\b/);
      expect(code).not.toMatch(/current_setting\(\s*'app\.(tenant_id|current_org_id)'/i);
    });
  }

  it('feature_flags_core has PK (org_id, flag_code) and rolled_out_pct default 0', () => {
    const sql = migration('067-feature-flags-core.sql');
    expect(sql).toMatch(/primary key \(org_id, flag_code\)/i);
    expect(sql).toMatch(/rolled_out_pct\s+integer\s+not null default 0/i);
  });

  it('org_authorization_policies enforces npd requires_new_version invariant (V-SET-43)', () => {
    const sql = migration('063-org-authorization-policies.sql');
    expect(sql).toMatch(/org_authorization_policies_npd_requires_new_version_check/i);
    expect(sql).toMatch(/policy_code <> 'npd_post_release_edit' or requires_new_version = true/i);
  });
});

const databaseUrl = process.env.DATABASE_URL;
const runLive = databaseUrl ? describe : describe.skip;

runLive('migrations 063–068 — live cross-org isolation (app_user)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const roleA = randomUUID();
  const roleB = randomUUID();

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    // Ensure app_user can authenticate with the test password used by getAppConnection().
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

    // Seed two isolated orgs with the columns the live schema requires (NO truncate of shared tables).
    await adminPool.query(
      'insert into public.tenants (id, name, region_cluster, data_plane_url) values ($1, $2, $3, $4) on conflict (id) do nothing',
      [tenantId, 'settings-foundation-test-tenant', 'eu', 'https://settings-foundation.example.test'],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $3, $4, 'bakery'), ($2, $3, $5, 'pharma')
       on conflict (id) do nothing`,
      [orgA, orgB, tenantId, `org-a-${orgA.slice(0, 8)}`, `org-b-${orgB.slice(0, 8)}`],
    );
    await adminPool.query(
      `insert into public.roles (id, org_id, code, name, permissions)
       values ($1, $3, 'owner', 'Owner', '[]'::jsonb), ($2, $4, 'owner', 'Owner', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleA, roleB, orgA, orgB],
    );
    await adminPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $3, $5, 'User A', $7), ($2, $4, $6, 'User B', $8)
       on conflict (id) do nothing`,
      [userA, userB, orgA, orgB, `ua-${userA.slice(0, 8)}@ex.test`, `ub-${userB.slice(0, 8)}@ex.test`, roleA, roleB],
    );
  });

  afterAll(async () => {
    // Clean up just our rows (cascades remove seeded child rows for these orgs).
    await adminPool?.query('delete from public.organizations where id = any($1::uuid[])', [[orgA, orgB]]).catch(() => undefined);
    await adminPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await adminPool?.query('truncate table app.session_org_contexts, app.active_org_contexts cascade').catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  async function withOrg<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [sessionToken, orgId]);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      return await fn(client);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  }

  it('app_user is not a superuser (RLS actually applies)', async () => {
    const r = await appPool.query<{ current_user: string; rolsuper: boolean }>(
      'select current_user, (select rolsuper from pg_roles where rolname = current_user) as rolsuper',
    );
    expect(r.rows[0]?.current_user).toBe('app_user');
    expect(r.rows[0]?.rolsuper).toBe(false);
  });

  it('per-org seeds are visible only to their org (authorization policies, UoM, flags)', async () => {
    const a = await withOrg(orgA, async (c) => ({
      authz: (await c.query('select policy_code from public.org_authorization_policies')).rowCount,
      uom: (await c.query('select code from public.unit_of_measure')).rowCount,
      flags: (await c.query('select flag_code from public.feature_flags_core')).rowCount,
      gate: (await c.query(`select 1 from public.rule_definitions where rule_code = 'technical_product_spec_approval_gate_v1'`)).rowCount,
    }));
    // Both orgs are seeded on INSERT, so each sees its OWN seeds (2 policies, 9 UoM, 6 flags, 1 gate rule).
    expect(a.authz).toBe(2);
    expect(a.uom).toBe(9);
    expect(a.flags).toBe(6);
    expect(a.gate).toBe(1);

    // org B must not see org A's seeded rows beyond its own — count equality alone is not isolation,
    // so assert org B cannot see a row uniquely written into org A below.
  });

  it('rows written under org A are invisible under org B and cross-org INSERT is rejected', async () => {
    // Write one identifiable row per table under org A (dedicated committed write).
    const marker = `iso-${randomUUID().slice(0, 8)}`;
    const sessionToken = randomUUID();
    await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [sessionToken, orgA]);
    const writeClient = await appPool.connect();
    try {
      await writeClient.query('begin');
      await writeClient.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await writeClient.query(
        `insert into public.d365_sync_runs (org_id, direction, entity_type, status)
         values (app.current_org_id(), 'push', $1, 'ok')`,
        [marker],
      );
      await writeClient.query(
        `insert into public.email_delivery_log (org_id, trigger_code, recipient_email)
         values (app.current_org_id(), $1, 'r@ex.test')`,
        [marker],
      );
      await writeClient.query(
        `insert into public.login_attempts (org_id, email, success) values (app.current_org_id(), $1, true)`,
        [`${marker}@ex.test`],
      );
      await writeClient.query(
        `insert into public.uom_custom_conversions (org_id, label, from_unit_code, to_unit_code, factor)
         values (app.current_org_id(), $1, 'kg', 'g', 1000)`,
        [marker],
      );
      await writeClient.query('commit');
    } finally {
      writeClient.release();
    }

    // org B sees none of org A's marked rows.
    const bVisible = await withOrg(orgB, async (c) => ({
      d365: (await c.query('select 1 from public.d365_sync_runs where entity_type = $1', [marker])).rowCount,
      email: (await c.query('select 1 from public.email_delivery_log where trigger_code = $1', [marker])).rowCount,
      login: (await c.query('select 1 from public.login_attempts where email = $1', [`${marker}@ex.test`])).rowCount,
      uom: (await c.query('select 1 from public.uom_custom_conversions where label = $1', [marker])).rowCount,
    }));
    expect(bVisible).toEqual({ d365: 0, email: 0, login: 0, uom: 0 });

    // org A still sees its own marked rows.
    const aVisible = await withOrg(orgA, async (c) =>
      (await c.query('select 1 from public.d365_sync_runs where entity_type = $1', [marker])).rowCount,
    );
    expect(aVisible).toBe(1);

    // Cross-org INSERT (writing org B's id while in org A context) is rejected by WITH CHECK.
    await expect(
      withOrg(orgA, async (c) =>
        c.query(`insert into public.feature_flags_core (org_id, flag_code) values ($1::uuid, 'sneak')`, [orgB]),
      ),
    ).rejects.toThrow(/row-level security|violates|new row violates/i);

    // Cleanup the committed org-A marker rows.
    await adminPool.query('delete from public.d365_sync_runs where entity_type = $1', [marker]).catch(() => undefined);
    await adminPool.query('delete from public.email_delivery_log where trigger_code = $1', [marker]).catch(() => undefined);
    await adminPool.query('delete from public.login_attempts where email = $1', [`${marker}@ex.test`]).catch(() => undefined);
    await adminPool.query('delete from public.uom_custom_conversions where label = $1', [marker]).catch(() => undefined);
  });

  it('npd requires_new_version=false is rejected by CHECK constraint', async () => {
    await expect(
      withOrg(orgA, async (c) =>
        c.query(
          `insert into public.org_authorization_policies (org_id, policy_code, requires_new_version)
           values (app.current_org_id(), 'npd_post_release_edit', false)`,
        ),
      ),
    ).rejects.toThrow(/org_authorization_policies_npd_requires_new_version_check|violates check/i);
  });
});
