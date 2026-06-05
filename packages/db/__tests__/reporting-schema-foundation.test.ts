import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 12-Reporting — schema foundation (migrations 213 + 214). READ-MOSTLY CONSUMER.
// Covers T-003/004/006/007/008/014 (config tables + cross-module fact MVs) + T-001/T-028 (rpt.* RBAC).
//
// Asserts: reporting-owned config tables + org_id NOT NULL; RLS enabled+forced + app.current_org_id()
// policies with NO GUC reads; cross-org isolation; report_exports 7y GENERATED retention; mv_refresh_log
// duration_ms GENERATED; dashboards_catalog seed (10 P1); the 7 cross-module fact MVs exist with UNIQUE
// indexes that back REFRESH MATERIALIZED VIEW CONCURRENTLY; the throughput MV BUILDS FROM the canonical
// 08-production wo_outputs producer; site_id day-1 nullable; CANONICAL-OWNER SEPARATION — migration 213
// created NO base copy of wo_outputs/oee_snapshots/downtime_events/schedule_outputs/license_plates/
// quality_holds (only the MVs read them); rpt.* permission seed grants the org-admin family the full
// family in BOTH stores + idempotent.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '12010000-0000-4000-8000-000000000001';
const orgAId = '12010000-0000-4000-8000-0000000000a0';
const orgBId = '12010000-0000-4000-8000-0000000000b0';

const REPORTING_CONFIG_TABLES = [
  'report_definitions',
  'saved_report_configs',
  'scheduled_export_configs',
  'saved_filter_presets',
  'report_exports',
  'mv_refresh_log',
  'report_access_audits',
] as const;

// dashboards_catalog is intentionally NOT in REPORTING_CONFIG_TABLES — it is a GLOBAL reference table
// with no org_id and no RLS (gated by feature_flag + RBAC at the rule layer).

const REPORTING_MVS = [
  'mv_reporting_production_throughput',
  'mv_reporting_yield_by_line_week',
  'mv_reporting_oee_rollup',
  'mv_reporting_quality_hold_rate',
  'mv_reporting_downtime_by_line',
  'mv_reporting_schedule_adherence',
  'mv_reporting_inventory_aging',
] as const;

// Canonical producer tables reporting CONSUMES but must NEVER own/create.
const CANONICAL_PRODUCERS = [
  'wo_outputs',
  'wo_material_consumption',
  'oee_snapshots',
  'downtime_events',
  'schedule_outputs',
  'license_plates',
  'quality_holds',
] as const;

const REPORTING_PERMISSIONS = [
  'rpt.dashboard.view',
  'rpt.export.csv',
  'rpt.export.pdf',
  'rpt.preset.save',
  'rpt.preset.share',
  'rpt.preset.delete',
  'rpt.schedule.create',
  'rpt.schedule.run_now',
  'rpt.schedule.delete',
  'rpt.settings.read',
  'rpt.settings.edit',
  'rpt.mv.refresh',
  'rpt.integration.read',
  'rpt.rules_usage.read',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

const P1_DASHBOARD_IDS = [
  'factory-overview',
  'yield-by-line',
  'yield-by-sku',
  'qc-holds',
  'oee-summary',
  'inventory-aging',
  'wo-status',
  'shipment-otd',
  'integration-health',
  'rules-usage',
].sort();

async function seedOrgs(adminPool: pg.Pool): Promise<void> {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-reporting Tenant', 'eu', 'https://t-reporting.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-reporting-a'],
    [orgBId, 't-reporting-b'],
  ]) {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Reporting Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function cleanup(adminPool: pg.Pool): Promise<void> {
  for (const orgId of [orgAId, orgBId]) {
    await adminPool.query(`delete from public.report_access_audits where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.mv_refresh_log where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.report_exports where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.saved_filter_presets where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.scheduled_export_configs where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.saved_report_configs where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.report_definitions where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.wo_outputs where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.work_orders where org_id = $1`, [orgId]).catch(() => undefined);
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
       values ($1, $2, 'rpt-test', 'rpt-test', 'RPT Test', '[]'::jsonb, false, 999)`,
      [roleId, orgId],
    );
  }
  const id = randomUUID();
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $3, 'RPT User', $4)`,
    [id, orgId, `rpt-${id.slice(0, 8)}@example.test`, roleId],
  );
  return id;
}

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

// Seed a 08-production wo_outputs row (the canonical producer) so the throughput MV can build FROM it.
async function seedWoOutput(
  adminPool: pg.Pool,
  orgId: string,
  userId: string,
  qtyKg: number,
): Promise<void> {
  // work_orders requires a wo_number + product_id + planned_quantity + uom + item_type_at_creation.
  const woId = randomUUID();
  await adminPool.query(
    `insert into public.work_orders
       (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status, created_by)
     values ($1, $2, $3, $4, 'fg', 1000, 'kg', 'DRAFT', $5)`,
    [woId, orgId, `WO-${woId.slice(0, 8)}`, randomUUID(), userId],
  );
  await adminPool.query(
    `insert into public.wo_outputs
       (org_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg, registered_by, created_by)
     values ($1, $2, $3, 'primary', $4, $5, $6, $7, $7)`,
    [orgId, randomUUID(), woId, randomUUID(), `B-${randomUUID().slice(0, 8)}`, qtyKg, userId],
  );
}

runIntegrationSuite('12-reporting schema foundation (migrations 213 + 214)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let userA: string;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgs(adminPool);
    await cleanup(adminPool);
    userA = await makeUser(adminPool, orgAId);
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

  it('AC1 — all reporting config tables exist with org_id NOT NULL; dashboards_catalog is global', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [[...REPORTING_CONFIG_TABLES, 'dashboards_catalog']],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual(
      [...REPORTING_CONFIG_TABLES, 'dashboards_catalog'].sort(),
    );

    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [REPORTING_CONFIG_TABLES as unknown as string[]],
    );
    expect(orgCols).toHaveLength(REPORTING_CONFIG_TABLES.length);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }

    // dashboards_catalog has NO org_id (global registry).
    const { rows: catalogOrg } = await adminPool.query<{ c: string }>(
      `select count(*)::text as c from information_schema.columns
       where table_schema='public' and table_name='dashboards_catalog' and column_name='org_id'`,
    );
    expect(catalogOrg[0].c).toBe('0');
  });

  it('AC2 — site_id is day-1 NULLABLE on every reporting operational table', async () => {
    const { rows } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema='public' and column_name='site_id' and table_name = any($1::text[])`,
      [REPORTING_CONFIG_TABLES as unknown as string[]],
    );
    // every config table carries a site_id and it is nullable.
    expect(rows.length).toBe(REPORTING_CONFIG_TABLES.length);
    for (const row of rows) {
      expect(row.is_nullable, `${row.table_name}.site_id nullable`).toBe('YES');
    }
  });

  it('AC3 — RLS enabled+forced on config tables; policies reference app.current_org_id(), no GUC', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [REPORTING_CONFIG_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(REPORTING_CONFIG_TABLES.length);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} rowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} forcerowsecurity`).toBe(true);
    }

    const { rows: policies } = await adminPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [REPORTING_CONFIG_TABLES as unknown as string[]],
    );
    expect(policies.length).toBe(REPORTING_CONFIG_TABLES.length);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} references app.current_org_id()`).toContain('app.current_org_id()');
      expect(blob, `${p.tablename} no tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} no current_org_id GUC`).not.toMatch(
        /current_setting\(\s*'app\.current_org_id'/,
      );
    }
  });

  it('AC4 — report_exports.retention_until is GENERATED STORED = exported_at + 7y (BRCGS §14.1)', async () => {
    const { rows: gen } = await adminPool.query<{ is_generated: string }>(
      `select is_generated from information_schema.columns
       where table_schema='public' and table_name='report_exports' and column_name='retention_until'`,
    );
    expect(gen[0].is_generated).toBe('ALWAYS');

    const { rows } = await adminPool.query<{ retention_until: string }>(
      `insert into public.report_exports
         (org_id, user_id, dashboard_id, report_type, date_range, format, sha256_hash, exported_at)
       values ($1, $2, 'factory-overview', 'pdf', '{}'::jsonb, 'pdf', repeat('a',64), '2026-05-14T00:00:00Z')
       returning retention_until::text as retention_until`,
      [orgAId, userA],
    );
    expect(rows[0].retention_until).toBe('2033-05-14');

    // sha256_hash NOT NULL (V-RPT-EXPORT-2) + format CHECK.
    await expect(
      adminPool.query(
        `insert into public.report_exports (org_id, user_id, dashboard_id, report_type, date_range, format, sha256_hash)
         values ($1, $2, 'x', 'pdf', '{}'::jsonb, 'exe', repeat('a',64))`,
        [orgAId, userA],
      ),
    ).rejects.toThrow();
  });

  it('AC5 — mv_refresh_log.duration_ms is GENERATED = (completed_at - started_at) in ms', async () => {
    const { rows: gen } = await adminPool.query<{ is_generated: string }>(
      `select is_generated from information_schema.columns
       where table_schema='public' and table_name='mv_refresh_log' and column_name='duration_ms'`,
    );
    expect(gen[0].is_generated).toBe('ALWAYS');

    const { rows } = await adminPool.query<{ duration_ms: number }>(
      `insert into public.mv_refresh_log (org_id, view_name, started_at, completed_at, status)
       values ($1, 'mv_reporting_production_throughput',
               '2026-05-14T00:00:00Z', '2026-05-14T00:00:02.500Z', 'completed')
       returning duration_ms`,
      [orgAId],
    );
    expect(rows[0].duration_ms).toBe(2500);
  });

  it('AC6 — dashboards_catalog seeds exactly the 10 P1 dashboards', async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `select id from public.dashboards_catalog where phase = 'P1' order by id`,
    );
    expect(rows.map((r) => r.id).sort()).toEqual(P1_DASHBOARD_IDS);
  });

  it('AC7 — cross-org isolation: org B cannot see org A report_definitions under app_user RLS', async () => {
    const defId = randomUUID();
    await adminPool.query(
      `insert into public.report_definitions (id, org_id, report_key, name)
       values ($1, $2, 'factory-overview', 'Factory Overview')`,
      [defId, orgAId],
    );

    const clientB = await appPool.connect();
    try {
      await clientB.query('begin');
      await bindOrg(adminPool, clientB, orgBId);
      const { rows } = await clientB.query<{ id: string }>(`select id from public.report_definitions`);
      expect(rows.map((r) => r.id)).not.toContain(defId);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }
  });

  it('AC8 — all 7 cross-module fact MVs exist with a UNIQUE index (REFRESH CONCURRENTLY prerequisite)', async () => {
    const { rows: mvs } = await adminPool.query<{ matviewname: string }>(
      `select matviewname from pg_matviews where schemaname = 'public' and matviewname = any($1::text[])`,
      [REPORTING_MVS as unknown as string[]],
    );
    expect(mvs.map((r) => r.matviewname).sort()).toEqual([...REPORTING_MVS].sort());

    for (const mv of REPORTING_MVS) {
      const { rows: idx } = await adminPool.query<{ indexname: string; indexdef: string }>(
        `select indexname, indexdef from pg_indexes where schemaname='public' and tablename = $1`,
        [mv],
      );
      const hasUnique = idx.some((r) => r.indexdef.toLowerCase().includes('unique'));
      expect(hasUnique, `${mv} must have a UNIQUE index for REFRESH CONCURRENTLY`).toBe(true);
    }
  });

  it('AC9 — fact MV builds FROM the canonical 08-production wo_outputs; REFRESH CONCURRENTLY works', async () => {
    await seedWoOutput(adminPool, orgAId, userA, 950);
    await seedWoOutput(adminPool, orgAId, userA, 50);

    // CONCURRENTLY requires a prior non-concurrent populate (clean DB MV starts unpopulated-but-scannable
    // after creation; refresh concurrently is the worker path under test).
    await adminPool.query(`refresh materialized view public.mv_reporting_production_throughput`);
    await adminPool.query(`refresh materialized view concurrently public.mv_reporting_production_throughput`);

    const { rows } = await adminPool.query<{ total_kg_output: string }>(
      `select sum(total_kg_output)::text as total_kg_output
       from public.mv_reporting_production_throughput where org_id = $1`,
      [orgAId],
    );
    // 950 + 50 = 1000 kg, mass-summed from the canonical producer.
    expect(Number(rows[0].total_kg_output)).toBe(1000);
  });

  it('AC10 — CANONICAL-OWNER SEPARATION: migration 213 created NO base copy of producer tables', async () => {
    // 213 is recorded as applied.
    const { rows: applied } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations where filename = $1`,
      ['213-reporting-read-models-and-config.sql'],
    );
    expect(applied).toHaveLength(1);

    // Each canonical producer is a BASE TABLE owned by ITS module — NOT a reporting object, and NOT a
    // materialized view (reporting only declares MVs that read them). If reporting had created a base
    // copy, the producer name would collide / there'd be a reporting-owned table; assert each producer
    // is still a plain base relation that exists (created by its owner) and reporting owns no same-named MV.
    const { rows: producerTables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public' and tablename = any($1::text[])`,
      [CANONICAL_PRODUCERS as unknown as string[]],
    );
    expect(producerTables.map((r) => r.tablename).sort()).toEqual([...CANONICAL_PRODUCERS].sort());

    // No reporting MV shares a producer's name (reporting MVs are all mv_reporting_*).
    const { rows: collision } = await adminPool.query<{ matviewname: string }>(
      `select matviewname from pg_matviews where schemaname='public' and matviewname = any($1::text[])`,
      [CANONICAL_PRODUCERS as unknown as string[]],
    );
    expect(collision).toHaveLength(0);

    // The reporting MVs depend on (read) the producers — assert at least the throughput MV references
    // wo_outputs via pg_depend → pg_rewrite, proving consumer (not owner) relationship.
    const { rows: deps } = await adminPool.query<{ refobj: string }>(
      `select distinct cl.relname as refobj
         from pg_rewrite rw
         join pg_depend dep on dep.objid = rw.oid
         join pg_class cl on cl.oid = dep.refobjid
        where rw.ev_class = 'public.mv_reporting_production_throughput'::regclass
          and cl.relname = 'wo_outputs'`,
    );
    expect(deps.map((r) => r.refobj)).toContain('wo_outputs');
  });

  it('AC11 — rpt.* RBAC seed grants the org-admin family the full family in BOTH stores; idempotent', async () => {
    await adminPool.query(`select public.seed_reporting_permissions_for_org($1)`, [orgAId]);

    const { rows: normalized } = await adminPool.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'rpt.%' order by rp.permission`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    expect(normalized.map((r) => r.permission)).toEqual(REPORTING_PERMISSIONS);

    const { rows: jsonbRows } = await adminPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
                where p like 'rpt.%') as perms
       from public.roles r
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    expect(jsonbRows.length).toBeGreaterThan(0);
    for (const row of jsonbRows) {
      expect(row.perms ?? []).toEqual(REPORTING_PERMISSIONS);
    }

    // idempotent: re-run produces no duplicate role_permissions rows.
    await adminPool.query(`select public.seed_reporting_permissions_for_org($1)`, [orgAId]);
    const { rows: dupes } = await adminPool.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'rpt.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [orgAId],
    );
    expect(dupes).toEqual([]);
  });
});
