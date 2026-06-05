import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

type D365RefreshRow = {
  code: string;
  status: 'Found' | 'NoCost' | 'Missing';
  comment?: string | null;
};

declare global {
  var __T051_D365_CACHE_REFRESH__: undefined | ((orgId: string) => Promise<D365RefreshRow[]>);
}

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const tenantId = randomUUID();
const orgId = randomUUID();
const otherOrgId = randomUUID();
const managerUserId = randomUUID();
const managerRoleId = randomUUID();
const npdUserId = randomUUID();
const npdRoleId = randomUUID();
const otherUserId = randomUUID();
const otherRoleId = randomUUID();

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
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

async function seedOrg(targetOrgId: string, targetUserId: string, targetRoleId: string, roleCode: string, permissions: string[]): Promise<void> {
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, $3, 'fmcg')
     on conflict (id) do nothing`,
    [targetOrgId, tenantId, `T-051 ${roleCode}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, $4, $5::jsonb, true, 10)
     on conflict (id) do nothing`,
    [targetRoleId, targetOrgId, roleCode, roleCode.replaceAll('_', ' '), JSON.stringify(permissions)],
  );
  for (const permission of permissions) {
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, $2)
       on conflict do nothing`,
      [targetRoleId, permission],
    );
  }
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do nothing`,
    [targetUserId, targetOrgId, `${targetUserId}@t051.example.test`, `T-051 ${roleCode}`, targetRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3)
     on conflict do nothing`,
    [targetUserId, targetRoleId, targetOrgId],
  );
}

async function seedProducts(): Promise<void> {
  await owner.query(
    `insert into "Reference"."AlertThresholds" (org_id, threshold_key, value_int)
     values
       ($1, 'launch_alert_red_days', 10),
       ($1, 'launch_alert_yellow_days', 21),
       ($2, 'launch_alert_red_days', 10),
       ($2, 'launch_alert_yellow_days', 21)
     on conflict (org_id, threshold_key) do update set value_int = excluded.value_int`,
    [orgId, otherOrgId],
  );
  await owner.query(
    `insert into "Reference"."DeptColumns" (org_id, dept_code, column_key, field_type, required_for_done, display_order)
     values
       ($1, 'mrp', 'mrp_box', 'string', true, 1),
       ($1, 'commercial', 'article_number', 'string', true, 2),
       ($2, 'mrp', 'mrp_box', 'string', true, 1)
     on conflict (org_id, dept_code, column_key) do update
       set required_for_done = excluded.required_for_done,
           display_order = excluded.display_order`,
    [orgId, otherOrgId],
  );
  await owner.query(
    `insert into public.product (
       product_code, product_name, org_id, launch_date, built, status_overall,
       done_mrp, done_commercial, mrp_box, article_number, created_by_user
     )
     values
       ('T051-ACTIVE-MRP', 'MRP visible active', $1, current_date + 7, false, 'InProgress', false, true, null, 'A-1', $3),
       ('T051-DONE-MRP', 'MRP done active', $1, current_date + 30, false, 'Pending', true, false, 'BOX-1', null, $3),
       ('T051-BUILT', 'Built should hide by default', $1, current_date + 2, true, 'InProgress', false, true, null, 'A-2', $3),
       ('T051-OTHER', 'Other org invisible', $2, current_date + 1, false, 'InProgress', false, true, null, 'B-1', $4)
     on conflict (org_id, product_code) do update
       set product_name = excluded.product_name,
           org_id = excluded.org_id,
           launch_date = excluded.launch_date,
           built = excluded.built,
           status_overall = excluded.status_overall,
           done_mrp = excluded.done_mrp,
           done_commercial = excluded.done_commercial,
           mrp_box = excluded.mrp_box,
           article_number = excluded.article_number`,
    [orgId, otherOrgId, managerUserId, otherUserId],
  );
}

async function seed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, data_plane_url)
     values ($1, 'T-051 Tenant', 'https://t051.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await seedOrg(orgId, managerUserId, managerRoleId, 'dept_manager_mrp', ['npd.dashboard.view']);
  await seedOrg(orgId, npdUserId, npdRoleId, 't051_npd_manager', ['npd.dashboard.view', 'npd.d365_builder.execute']);
  await seedOrg(otherOrgId, otherUserId, otherRoleId, 't051_other_manager', ['npd.dashboard.view', 'npd.d365_builder.execute']);
  await seedProducts();
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.d365_import_cache where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from "Reference"."DeptColumns" where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from "Reference"."AlertThresholds" where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.role_permissions where role_id in ($1, $2, $3)`, [managerRoleId, npdRoleId, otherRoleId]).catch(() => undefined);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
}

run('NPD dashboard Server Actions (T-051 real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for seeding/cleanup; actions under test use withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = managerUserId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    await seed();
  }, 120000);

  afterAll(async () => {
    delete globalThis.__T051_D365_CACHE_REFRESH__;
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await cleanup();
    await owner.end();
  });

  it('filters per-dept breakdown to only MRP for an MRP department manager while preserving summary counters', async () => {
    const { getDashboardSummary } = await import('../get-dashboard-summary');

    const result = await getDashboardSummary();

    expect(result.summary.totalActive).toBeGreaterThanOrEqual(3);
    expect(result.summary.pending).toBeGreaterThanOrEqual(2);
    expect(result.perDept).toEqual([
      expect.objectContaining({ dept: 'mrp', done: 1, pending: 2 }),
    ]);
  });

  it('rejects the second D365 refresh within 60 seconds and emits one outbox event after successful sync only', async () => {
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = npdUserId;
    globalThis.__T051_D365_CACHE_REFRESH__ = vi.fn(async () => [
      { code: 'RM-T051-1', status: 'Found', comment: 'synced' },
    ]);
    const { refreshD365Cache } = await import('../refresh-d365-cache');

    const first = await refreshD365Cache();
    await expect(refreshD365Cache()).rejects.toThrow(/THROTTLED/);

    expect(first.ok).toBe(true);
    expect(first.ok ? first.lastSyncedAt : null).toEqual(expect.any(String));
    expect(globalThis.__T051_D365_CACHE_REFRESH__).toHaveBeenCalledTimes(1);
    const outbox = await owner.query<{ count: string }>(
      `select count(*)::text
       from public.outbox_events
       where org_id = $1 and event_type = 'd365.cache.refreshed'`,
      [orgId],
    );
    expect(outbox.rows[0]?.count).toBe('1');
  });

  it('returns a clear not-configured result when the D365 adapter is not wired', async () => {
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = npdUserId;
    delete globalThis.__T051_D365_CACHE_REFRESH__;
    const { refreshD365Cache } = await import('../refresh-d365-cache');

    await expect(refreshD365Cache()).resolves.toEqual({
      ok: false,
      error: 'not_configured',
      message: 'D365 cache refresh adapter is not configured.',
    });
  });

  it('excludes built FAs from launch alerts by default', async () => {
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = managerUserId;
    const { getLaunchAlerts } = await import('../get-launch-alerts');

    const result = await getLaunchAlerts();

    expect(result.alerts.map((alert) => alert.productCode)).toContain('T051-ACTIVE-MRP');
    expect(result.alerts.map((alert) => alert.productCode)).not.toContain('T051-BUILT');
    expect(result.alerts.map((alert) => alert.productCode)).not.toContain('T051-OTHER');
  });
});
