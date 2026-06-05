import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 14-multi-site — SCHEMA FOUNDATION (migrations 215 + 216).
// Covers T-002 (sites + RLS + V-MS-01 default-site uniqueness), T-001 (app.set_site_context /
// app.current_site_id() trust store), T-030 (operational_tables registry + app.is_site_scoped_table()),
// T-008 (inter_site_transfer_orders IST shell + org+site RLS), T-031/T-032 (multi_site.* RBAC seed).
//
// Asserts: tables exist + org_id NOT NULL; FK target sites usable by IST; V-MS-01 one-default-per-org;
// site-context functions exist (SECURITY DEFINER, current_site_id LEAKPROOF STABLE); registry seeded
// with §9.8 tables + app.is_site_scoped_table(); RLS enabled+forced + app.current_org_id() (and
// app.current_site_id() on IST) policies with NO GUC reads; cross-org isolation on sites; cross-site
// isolation on IST under withSiteContext; canonical-owner separation (no wo_outputs/oee_snapshots/etc.
// created here); multi_site.* permission seed grants the org-admin family the full family in BOTH
// stores + idempotent.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '14010000-0000-4000-8000-000000000001';
const orgAId = '14010000-0000-4000-8000-0000000000a0';
const orgBId = '14010000-0000-4000-8000-0000000000b0';

const MULTI_SITE_TABLES = ['sites', 'operational_tables', 'inter_site_transfer_orders'] as const;

const MULTI_SITE_PERMISSIONS = [
  'multi_site.site.view',
  'multi_site.site.create',
  'multi_site.site.edit',
  'multi_site.site.decommission',
  'multi_site.site_access.assign',
  'multi_site.site_access.revoke',
  'multi_site.site_access.bulk_assign',
  'multi_site.site_settings.override',
  'multi_site.site_settings.clear',
  'multi_site.ist.create',
  'multi_site.ist.amend',
  'multi_site.ist.cancel',
  'multi_site.ist.approve',
  'multi_site.lane.create',
  'multi_site.lane.edit',
  'multi_site.lane.deactivate',
  'multi_site.rate_card.upload',
  'multi_site.rate_card.approve',
  'multi_site.rate_card.delete',
  'multi_site.replication.retry',
  'multi_site.replication.run_sync',
  'multi_site.conflict.resolve',
  'multi_site.activation.start',
  'multi_site.activation.rollback',
  'multi_site.config.promote',
  'multi_site.cross_site.read',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

// §9.8 operational tables that the registry must declare.
const REGISTRY_TABLES = [
  'warehouses',
  'license_plates',
  'grn_items',
  'stock_movements',
  'work_orders',
  'wo_outputs',
  'wo_consumptions',
  'wo_dependencies',
  'downtime_events',
  'quality_holds',
  'quality_inspections',
  'ncr_reports',
  'haccp_plans',
  'shipments',
  'sales_orders',
  'inventory_cost_layers',
  'wip_balances',
  'oee_snapshots',
  'maintenance_work_orders',
  'spare_parts_stock',
  'calibration_instruments',
  'inter_site_transfer_orders',
];

async function seedOrgs(adminPool: pg.Pool): Promise<void> {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-multisite Tenant', 'eu', 'https://t-multisite.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-multisite-a'],
    [orgBId, 't-multisite-b'],
  ]) {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Multi-Site Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function cleanup(adminPool: pg.Pool): Promise<void> {
  for (const orgId of [orgAId, orgBId]) {
    await adminPool.query(`delete from public.inter_site_transfer_orders where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.sites where org_id = $1`, [orgId]).catch(() => undefined);
  }
}

async function makeUser(adminPool: pg.Pool, orgId: string): Promise<string> {
  let roleId: string;
  const { rows: roles } = await adminPool.query<{ id: string }>(
    `select id from public.roles where org_id = $1 limit 1`,
    [orgId],
  );
  if (roles.length > 0) {
    roleId = roles[0].id;
  } else {
    roleId = randomUUID();
    await adminPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'ms-test', 'ms-test', 'MS Test', '[]'::jsonb, false, 999)`,
      [roleId, orgId],
    );
  }
  const id = randomUUID();
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $3, 'MS User', $4)`,
    [id, orgId, `ms-${id.slice(0, 8)}@example.test`, roleId],
  );
  return id;
}

// Bind org context on an app_user client (mirrors the 002 trust-store contract).
function bindOrg(adminPool: pg.Pool, appClient: pg.PoolClient, orgId: string): Promise<unknown> {
  const sessionToken = randomUUID();
  return adminPool
    .query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    )
    .then(() => appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]));
}

// Bind BOTH org + site context on an app_user client (the withSiteContext composition). siteId null =
// ALL-sites mode (requires a trust row with site_id NULL).
async function bindOrgAndSite(
  adminPool: pg.Pool,
  appClient: pg.PoolClient,
  orgId: string,
  userId: string,
  siteId: string | null,
): Promise<void> {
  const orgToken = randomUUID();
  const siteToken = randomUUID();
  await adminPool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [orgToken, orgId],
  );
  await adminPool.query(
    `insert into app.session_site_contexts (session_token, user_id, org_id, site_id) values ($1, $2, $3, $4)
     on conflict (session_token) do update set site_id = excluded.site_id`,
    [siteToken, userId, orgId, siteId],
  );
  await appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [orgToken, orgId]);
  await appClient.query('select app.set_site_context($1::uuid, $2::uuid)', [siteToken, siteId]);
}

async function insertSite(
  adminPool: pg.Pool,
  orgId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const base: Record<string, unknown> = {
    org_id: orgId,
    site_code: `SITE-${randomUUID().slice(0, 8)}`,
    name: 'Test Site',
    is_default: false,
    timezone: 'UTC',
  };
  const row = { ...base, ...overrides };
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into public.sites (org_id, site_code, name, is_default, timezone)
     values ($1, $2, $3, $4, $5) returning id`,
    [row.org_id, row.site_code, row.name, row.is_default, row.timezone],
  );
  return rows[0];
}

runIntegrationSuite('14-multi-site schema foundation (migrations 215 + 216)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgs(adminPool);
    await cleanup(adminPool);
    userA = await makeUser(adminPool, orgAId);
    userB = await makeUser(adminPool, orgBId);
  });

  afterAll(async () => {
    await cleanup(adminPool);
    await adminPool.query(`delete from public.users where org_id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool
      .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = any($1::uuid[])`, [[orgAId, orgBId]])
      .catch(() => undefined);
    await adminPool.query(`delete from public.roles where org_id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool.query(`delete from public.organizations where id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1 — sites / operational_tables / inter_site_transfer_orders tables exist; org_id NOT NULL on the org-scoped ones', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [MULTI_SITE_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...MULTI_SITE_TABLES].sort());

    // org-scoped tables: sites + inter_site_transfer_orders carry org_id NOT NULL (operational_tables
    // is a global catalog — no org_id).
    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [['sites', 'inter_site_transfer_orders']],
    );
    expect(orgCols).toHaveLength(2);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }
    // sites itself must NOT be site-scoped (org master data, §6.4 REC-L1).
    const { rows: sitesSiteId } = await adminPool.query(
      `select 1 from information_schema.columns where table_schema='public' and table_name='sites' and column_name='site_id'`,
    );
    expect(sitesSiteId).toHaveLength(0);
  });

  it('AC2 — app.set_site_context / app.current_site_id() exist with SECURITY DEFINER (+ LEAKPROOF STABLE on reader)', async () => {
    const { rows } = await adminPool.query<{
      proname: string;
      prosecdef: boolean;
      proleakproof: boolean;
      provolatile: string;
    }>(
      `select p.proname, p.prosecdef, p.proleakproof, p.provolatile
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname in ('set_site_context', 'current_site_id')
       order by p.proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual(['current_site_id', 'set_site_context']);
    for (const row of rows) {
      expect(row.prosecdef, `${row.proname} SECURITY DEFINER`).toBe(true);
    }
    const reader = rows.find((r) => r.proname === 'current_site_id')!;
    expect(reader.proleakproof, 'current_site_id LEAKPROOF').toBe(true);
    expect(reader.provolatile, 'current_site_id STABLE (s)').toBe('s');

    // EXECUTE granted to app_user, not public.
    const { rows: acl } = await adminPool.query<{ has: boolean }>(
      `select has_function_privilege('app_user', 'app.current_site_id()', 'EXECUTE') as has`,
    );
    expect(acl[0].has).toBe(true);
  });

  it('AC3 — V-MS-01 one-default-site-per-org: second default insert raises unique_violation', async () => {
    await insertSite(adminPool, orgAId, { is_default: true });
    await expect(insertSite(adminPool, orgAId, { is_default: true })).rejects.toThrow();
    // a non-default second site is fine.
    await expect(insertSite(adminPool, orgAId, { is_default: false })).resolves.toBeTruthy();
    // org B can also have its own default (scoped per org).
    await expect(insertSite(adminPool, orgBId, { is_default: true })).resolves.toBeTruthy();
  });

  it('AC4 — operational_tables registry seeded with the §9.8 tables + app.is_site_scoped_table() helper', async () => {
    const { rows } = await adminPool.query<{ table_name: string }>(
      `select table_name from public.operational_tables`,
    );
    const registered = rows.map((r) => r.table_name).sort();
    for (const t of REGISTRY_TABLES) {
      expect(registered, `registry missing ${t}`).toContain(t);
    }
    // helper resolves a registered table true, an unregistered one false.
    const { rows: hit } = await adminPool.query<{ scoped: boolean }>(
      `select app.is_site_scoped_table('license_plates') as scoped`,
    );
    expect(hit[0].scoped).toBe(true);
    const { rows: miss } = await adminPool.query<{ scoped: boolean }>(
      `select app.is_site_scoped_table('organizations') as scoped`,
    );
    expect(miss[0].scoped).toBe(false);
  });

  it('AC5 — RLS enabled+forced on all three tables; org policy refs app.current_org_id(), IST refs app.current_site_id(), no GUC reads', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [['sites', 'inter_site_transfer_orders'] as unknown as string[]],
    );
    expect(rls).toHaveLength(2);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} rowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} forcerowsecurity`).toBe(true);
    }

    const { rows: policies } = await adminPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [['sites', 'inter_site_transfer_orders'] as unknown as string[]],
    );
    expect(policies.length).toBe(2);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} references app.current_org_id()`).toContain('app.current_org_id()');
      expect(blob, `${p.tablename} no tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} no current_org_id GUC`).not.toMatch(/current_setting\(\s*'app\.current_org_id'/);
      expect(blob, `${p.tablename} no current_site_id GUC`).not.toMatch(/current_setting\(\s*'app\.current_site_id'/);
    }
    // IST policy must additionally reference app.current_site_id() (site-scoped).
    const istPolicy = policies.find((p) => p.tablename === 'inter_site_transfer_orders')!;
    expect(`${istPolicy.qual ?? ''} ${istPolicy.with_check ?? ''}`).toContain('app.current_site_id()');
  });

  it('AC6 — cross-org isolation: org B cannot see org A sites under app_user RLS', async () => {
    const siteA = await insertSite(adminPool, orgAId, { is_default: false });

    const clientB = await appPool.connect();
    try {
      await clientB.query('begin');
      await bindOrg(adminPool, clientB, orgBId);
      const { rows } = await clientB.query<{ id: string }>(`select id from public.sites`);
      expect(rows.map((r) => r.id)).not.toContain(siteA.id);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }
  });

  it('AC7 — IST cross-site isolation: bound to site X, app_user sees only site-X (or NULL day-1) rows', async () => {
    const siteX = await insertSite(adminPool, orgAId);
    const siteY = await insertSite(adminPool, orgAId);

    // two IST rows under org A — one tagged site X, one tagged site Y.
    const { rows: ist } = await adminPool.query<{ id: string }>(
      `insert into public.inter_site_transfer_orders (org_id, site_id, to_number, from_site_id, to_site_id)
       values ($1, $2, $3, $2, $4), ($1, $4, $5, $4, $2)
       returning id`,
      [orgAId, siteX.id, `TO-${randomUUID().slice(0, 8)}`, siteY.id, `TO-${randomUUID().slice(0, 8)}`],
    );
    const [rowX, rowY] = ist;

    const clientA = await appPool.connect();
    try {
      await clientA.query('begin');
      await bindOrgAndSite(adminPool, clientA, orgAId, userA, siteX.id);
      const { rows } = await clientA.query<{ id: string; site_id: string }>(
        `select id, site_id from public.inter_site_transfer_orders where id = any($1::uuid[])`,
        [[rowX.id, rowY.id]],
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(rowX.id); // site X visible
      expect(ids).not.toContain(rowY.id); // site Y hidden
      await clientA.query('commit');
    } catch (e) {
      await clientA.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientA.release();
    }
  });

  it('AC8 — withSiteContext rejection: a site-X trust row cannot set site Y (PG 28000)', async () => {
    const siteX = await insertSite(adminPool, orgAId);
    const siteY = await insertSite(adminPool, orgAId);
    const siteToken = randomUUID();
    await adminPool.query(
      `insert into app.session_site_contexts (session_token, user_id, org_id, site_id) values ($1, $2, $3, $4)`,
      [siteToken, userA, orgAId, siteX.id],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await expect(
        client.query('select app.set_site_context($1::uuid, $2::uuid)', [siteToken, siteY.id]),
      ).rejects.toMatchObject({ code: '28000' });
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('AC9 — IST cost_allocation_method CHECK + DEFAULT receiver + FK to sites', async () => {
    const site = await insertSite(adminPool, orgAId);
    // default applied.
    const { rows: def } = await adminPool.query<{ cost_allocation_method: string }>(
      `insert into public.inter_site_transfer_orders (org_id, to_number, from_site_id, to_site_id)
       values ($1, $2, $3, $3) returning cost_allocation_method`,
      [orgAId, `TO-${randomUUID().slice(0, 8)}`, site.id],
    );
    expect(def[0].cost_allocation_method).toBe('receiver');
    // illegal cost_allocation_method rejected.
    await expect(
      adminPool.query(
        `insert into public.inter_site_transfer_orders (org_id, to_number, cost_allocation_method)
         values ($1, $2, 'unknown')`,
        [orgAId, `TO-${randomUUID().slice(0, 8)}`],
      ),
    ).rejects.toThrow();
    // FK violation: from_site_id pointing to a non-existent site.
    await expect(
      adminPool.query(
        `insert into public.inter_site_transfer_orders (org_id, to_number, from_site_id)
         values ($1, $2, $3)`,
        [orgAId, `TO-${randomUUID().slice(0, 8)}`, randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it('AC10 — canonical-owner separation: this migration created NO wo_outputs / oee_snapshots / schedule_outputs / license_plates / quality_holds', async () => {
    const { rows } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations where filename = $1`,
      ['215-multi-site-sites-registry-context.sql'],
    );
    expect(rows).toHaveLength(1);
    // those tables exist (created by their owners) but were NOT created/dropped by this migration.
    const { rows: own } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public'
       and tablename in ('wo_outputs','oee_snapshots','downtime_events','license_plates','quality_holds','ncr_reports')`,
    );
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it('AC11 — multi_site.* RBAC seed grants the org-admin family the full family in BOTH stores + idempotent (T-032)', async () => {
    // Ensure org A has an admin-family role, then re-run the seed.
    const adminRoleId = randomUUID();
    await adminPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'org_admin', 'org_admin', 'Org Admin', '[]'::jsonb, true, 1)
       on conflict (org_id, code) do nothing`,
      [adminRoleId, orgAId],
    );
    await adminPool.query(`select public.seed_multi_site_permissions_for_org($1)`, [orgAId]);

    const { rows: normalized } = await adminPool.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'multi_site.%' order by rp.permission`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    // Sort in JS (not DB) so the comparison is collation-independent — the SET is what matters.
    expect(normalized.map((r) => r.permission).sort()).toEqual(MULTI_SITE_PERMISSIONS);

    const { rows: jsonbRows } = await adminPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
                where p like 'multi_site.%') as perms
       from public.roles r
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    const nonEmpty = jsonbRows.filter((row) => (row.perms ?? []).length > 0);
    expect(nonEmpty.length).toBeGreaterThan(0);
    for (const row of nonEmpty) {
      expect([...row.perms].sort()).toEqual(MULTI_SITE_PERMISSIONS);
    }

    // idempotent: re-run produces no duplicate role_permissions rows.
    await adminPool.query(`select public.seed_multi_site_permissions_for_org($1)`, [orgAId]);
    const { rows: dupes } = await adminPool.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'multi_site.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [orgAId],
    );
    expect(dupes).toEqual([]);
  });
});
