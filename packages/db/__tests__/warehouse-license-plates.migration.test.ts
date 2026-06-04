import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 05-Warehouse — migrations 191 (license_plates + FEFO read model) + 192 (outbox CHECK + RBAC seed).
// Foundation collected from a rate-limited agent that NEVER wrote its tests — this file is the
// missing RED→GREEN DB-integration suite. Models on:
//   - items.migration.test.ts        (migration/schema columns + indexes + forced RLS + org isolation)
//   - technical-permission-seed.test.ts / production-permission-seed.test.ts (RBAC seed family)
//   - risk-created-outbox-event.test.ts (outbox CHECK accept/reject)
//
// These tests are RED if the 191/192 schema were absent (table/view/policy/seed/CHECK missing) and
// GREEN against a DB migrated through 192.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mig191Path = resolve(packageRoot, 'migrations/191-warehouse-license-plates-fefo.sql');
const mig192Path = resolve(packageRoot, 'migrations/192-warehouse-outbox-and-rbac-seed.sql');
const permissionsEnumPath = resolve(packageRoot, '../rbac/src/permissions.enum.ts');
const eventsEnumPath = resolve(packageRoot, '../outbox/src/events.enum.ts');

// Complete warehouse.* family (PRD §3 RBAC). Mirrors ALL_WAREHOUSE_PERMISSIONS / mig-192 v_all_perms.
const WAREHOUSE_PERMISSIONS = [
  'warehouse.lp.create',
  'warehouse.lp.split',
  'warehouse.lp.merge',
  'warehouse.lp.reserve',
  'warehouse.lp.consume',
  'warehouse.lp.block',
  'warehouse.lp.ship',
  'warehouse.lp.force_unlock',
  'warehouse.grn.receive',
  'warehouse.stock.move',
  'warehouse.stock.adjust',
  'warehouse.inventory.read',
  'warehouse.fefo.override',
].sort();

// The 4 warehouse.* outbox events (PRD §11). Mirrors ALL_WAREHOUSE_EVENTS.
const WAREHOUSE_EVENTS = [
  'warehouse.lp.received',
  'warehouse.lp.transitioned',
  'warehouse.material.consumed',
  'warehouse.lp.shipped',
];

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

// ===========================================================================
// (0) Static migration-file contract — runs without a DB. Cheap drift gate.
// ===========================================================================
describe('191/192 warehouse migration files', () => {
  it('191 creates license_plates + v_inventory_available via app.current_org_id (no raw tenant/org GUC)', () => {
    expect(existsSync(mig191Path), 'expected packages/db/migrations/191-warehouse-license-plates-fefo.sql').toBe(
      true,
    );
    const sql = readFileSync(mig191Path, 'utf8');

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.license_plates/i);
    expect(sql).toMatch(/create\s+view\s+public\.v_inventory_available/i);
    expect(sql).toMatch(/license_plates_org_context/i);
    expect(sql).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(sql).toMatch(/enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/force\s+row\s+level\s+security/i);
    // NUMERIC-exact (never float) on the quantity columns.
    expect(sql).toMatch(/quantity\s+numeric\(18,\s*6\)/i);
    expect(sql).toMatch(/reserved_qty\s+numeric\(18,\s*6\)/i);
    expect(sql).toMatch(/catch_weight_kg\s+numeric\(18,\s*6\)/i);
    // The FEFO index is declared with explicit `expiry_date asc nulls last` in the migration
    // source (Postgres normalises this to the default and drops it from pg_indexes.indexdef).
    expect(sql).toMatch(/expiry_date\s+asc\s+nulls\s+last/i);
    // Wave0 lock: org isolation must NOT be read via a raw current_setting GUC.
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });

  it('192 extends the outbox CHECK with the 4 warehouse.* events and seeds the warehouse.* RBAC family', () => {
    expect(existsSync(mig192Path), 'expected packages/db/migrations/192-warehouse-outbox-and-rbac-seed.sql').toBe(
      true,
    );
    const sql = readFileSync(mig192Path, 'utf8');

    expect(sql).toMatch(/drop constraint if exists outbox_events_event_type_check/i);
    expect(sql).toMatch(/add constraint outbox_events_event_type_check check/i);
    for (const event of WAREHOUSE_EVENTS) {
      expect(sql).toContain(`'${event}'`);
    }
    expect(sql).toMatch(/seed_warehouse_permissions_for_org/i);
    expect(sql).toMatch(/trg_zzz_seed_warehouse_permissions/i);
    // Wave0 lock: no raw current_setting GUC read for org/tenant scope.
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });

  // Byte-match a couple of the seeded permission strings back to the canonical enum so the
  // migration cannot drift from packages/rbac/src/permissions.enum.ts.
  it('seeded permission strings byte-match permissions.enum.ts', () => {
    const enumSrc = readFileSync(permissionsEnumPath, 'utf8');
    expect(enumSrc).toContain("WAREHOUSE_LP_CONSUME: 'warehouse.lp.consume'");
    expect(enumSrc).toContain("WAREHOUSE_INVENTORY_READ: 'warehouse.inventory.read'");
    const mig = readFileSync(mig192Path, 'utf8');
    expect(mig).toContain("'warehouse.lp.consume'");
    expect(mig).toContain("'warehouse.inventory.read'");
  });

  // The 4 warehouse.* events must exist in events.enum.ts (drift gate covers enum↔CHECK; this
  // focuses the enum side so the CHECK list cannot silently outgrow the canonical vocabulary).
  it('the 4 warehouse.* events are present in events.enum.ts', () => {
    const enumSrc = readFileSync(eventsEnumPath, 'utf8');
    expect(enumSrc).toContain("WAREHOUSE_LP_RECEIVED = 'warehouse.lp.received'");
    expect(enumSrc).toContain("WAREHOUSE_LP_TRANSITIONED = 'warehouse.lp.transitioned'");
    expect(enumSrc).toContain("WAREHOUSE_MATERIAL_CONSUMED = 'warehouse.material.consumed'");
    expect(enumSrc).toContain("WAREHOUSE_LP_SHIPPED = 'warehouse.lp.shipped'");
  });
});

// ===========================================================================
// (1) Migration / schema — table, columns, NUMERIC, FEFO view, indexes.
// ===========================================================================
runIntegrationSuite('191 license_plates schema + FEFO read model', () => {
  let ownerPool: pg.Pool;

  beforeAll(() => {
    ownerPool = getOwnerConnection();
  });

  afterAll(async () => {
    await ownerPool?.end();
  });

  runIntegrationTest('public.license_plates exists with the expected PRD column set', async () => {
    const { rows } = await ownerPool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable
       from information_schema.columns
       where table_schema = 'public' and table_name = 'license_plates'
       order by column_name`,
    );
    const names = rows.map((r) => r.column_name);
    // Core columns from migration 191.
    for (const col of [
      'id',
      'org_id',
      'site_id',
      'warehouse_id',
      'lp_number',
      'product_id',
      'quantity',
      'reserved_qty',
      'uom',
      'catch_weight_kg',
      'status',
      'qa_status',
      'expiry_date',
      'location_id',
      'origin',
    ]) {
      expect(names, `missing column ${col}`).toContain(col);
    }
    // site_id is day-1 NULLABLE (per-site scoping lands later via 14-MS T-030).
    const siteId = rows.find((r) => r.column_name === 'site_id');
    expect(siteId?.is_nullable).toBe('YES');
  });

  runIntegrationTest('quantity / reserved_qty / catch_weight_kg are NUMERIC(18,6) — never float', async () => {
    const { rows } = await ownerPool.query<{
      column_name: string;
      data_type: string;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>(
      `select column_name, data_type, numeric_precision, numeric_scale
       from information_schema.columns
       where table_schema = 'public' and table_name = 'license_plates'
         and column_name in ('quantity', 'reserved_qty', 'catch_weight_kg')
       order by column_name`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.data_type, `${row.column_name} must be numeric not float`).toBe('numeric');
      expect(row.numeric_precision).toBe(18);
      expect(row.numeric_scale).toBe(6);
    }
  });

  runIntegrationTest('the FEFO and (org, site) indexes exist with the expected definitions', async () => {
    const { rows } = await ownerPool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef
       from pg_indexes
       where schemaname = 'public' and tablename = 'license_plates'
       order by indexname`,
    );
    const indexMap = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    // FEFO composite — (org, warehouse, product, status, expiry) — the <500ms picker SLO depends on it.
    // Postgres normalises the declared `expiry_date asc nulls last` to the ASC default and omits
    // NULLS LAST from indexdef, so the NULLS-LAST ordering is asserted against the migration source.
    expect(indexMap.has('license_plates_fefo_idx')).toBe(true);
    const fefoDef = indexMap.get('license_plates_fefo_idx') ?? '';
    expect(fefoDef).toMatch(/\(org_id, warehouse_id, product_id, status, expiry_date\)/);
    const mig191Sql = readFileSync(mig191Path, 'utf8');
    expect(mig191Sql).toMatch(/license_plates_fefo_idx[\s\S]*expiry_date\s+asc\s+nulls\s+last/i);

    // (org_id, site_id) index — day-1 multi-site tagging.
    expect(indexMap.has('license_plates_org_site_idx')).toBe(true);
    expect(indexMap.get('license_plates_org_site_idx')).toMatch(/\(org_id, site_id\)/);
  });

  runIntegrationTest('v_inventory_available FEFO read model exists and is a security_invoker view', async () => {
    const view = await ownerPool.query<{ viewname: string }>(
      `select viewname from pg_views where schemaname = 'public' and viewname = 'v_inventory_available'`,
    );
    expect(view.rows).toEqual([{ viewname: 'v_inventory_available' }]);

    // security_invoker = true → underlying license_plates RLS applies to the querying app_user.
    const opts = await ownerPool.query<{ reloptions: string[] | null }>(
      `select c.reloptions
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'v_inventory_available'`,
    );
    expect(opts.rows[0]?.reloptions ?? []).toContain('security_invoker=true');

    // The view exposes the derived available_qty column (quantity - reserved_qty).
    const cols = await ownerPool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'v_inventory_available'`,
    );
    expect(cols.rows.map((r) => r.column_name)).toContain('available_qty');
  });

  runIntegrationTest('RLS is ENABLED + FORCED on license_plates and the org policy uses app.current_org_id', async () => {
    const rls = await ownerPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
      `select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
       from pg_class where oid = 'public.license_plates'::regclass`,
    );
    expect(rls.rows).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);

    const policies = await ownerPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `select policyname, qual, with_check
       from pg_policies where schemaname = 'public' and tablename = 'license_plates'`,
    );
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]?.policyname).toBe('license_plates_org_context');
    const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
    expect(policyText).toContain('app.current_org_id()');
    expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
  });
});

// ===========================================================================
// (2) RLS isolation — two orgs each see only their own license_plates rows under app_user.
// ===========================================================================
runIntegrationSuite('191 license_plates RLS org isolation', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const warehouseA = randomUUID();
  const warehouseB = randomUUID();
  const productA = randomUUID();
  const productB = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WH LP RLS tenant', 'eu', 'https://wh-lp-rls.example') on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $3, 'WH LP Org A', $4, 'fmcg'),
              ($2, $3, 'WH LP Org B', $5, 'fmcg')
       on conflict (id) do nothing`,
      [orgA, orgB, tenantId, `whlp-a-${orgA.slice(0, 8)}`, `whlp-b-${orgB.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    if (ownerPool) {
      await ownerPool.query(`delete from public.license_plates where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
      await ownerPool
        .query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB])
        .catch(() => undefined);
      await ownerPool.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
      await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    }
    await appPool?.end();
    await ownerPool?.end();
  });

  runIntegrationTest('each org sees only its own LP rows; cross-org SELECT returns 0 (not an error)', async () => {
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionA, orgA],
    );
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionB, orgB],
    );

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionA, orgA]);
      await clientA.query(
        `insert into public.license_plates (org_id, warehouse_id, lp_number, product_id, quantity, uom)
         values ($1, $2, 'LP-A-001', $3, '100.250000', 'kg')`,
        [orgA, warehouseA, productA],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionB, orgB]);
      await clientB.query(
        `insert into public.license_plates (org_id, warehouse_id, lp_number, product_id, quantity, uom)
         values ($1, $2, 'LP-B-001', $3, '42.000000', 'kg')`,
        [orgB, warehouseB, productB],
      );

      // Org A sees only its own row — NUMERIC round-trips exact.
      const visibleToA = await clientA.query<{ lp_number: string; quantity: string }>(
        `select lp_number, quantity from public.license_plates order by lp_number`,
      );
      expect(visibleToA.rows).toEqual([{ lp_number: 'LP-A-001', quantity: '100.250000' }]);

      // Org B sees only its own row.
      const visibleToB = await clientB.query<{ lp_number: string }>(
        `select lp_number from public.license_plates order by lp_number`,
      );
      expect(visibleToB.rows).toEqual([{ lp_number: 'LP-B-001' }]);

      // Cross-org SELECT for B's row under A's context returns 0 rows — silent, NOT an error.
      const crossOrg = await clientA.query(
        `select lp_number from public.license_plates where lp_number = 'LP-B-001'`,
      );
      expect(crossOrg.rowCount).toBe(0);

      // Cross-org INSERT (spoofing org B under A's context) is blocked by the WITH CHECK clause.
      await expect(
        clientA.query(
          `insert into public.license_plates (org_id, warehouse_id, lp_number, product_id, quantity, uom)
           values ($1, $2, 'LP-SPOOF-B', $3, '1.000000', 'kg')`,
          [orgB, warehouseB, productB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await clientA.query('rollback').catch(() => undefined);
      await clientB.query('rollback').catch(() => undefined);
      clientA.release();
      clientB.release();
    }
  });
});

// ===========================================================================
// (3) RBAC seed (mig 192) — warehouse.* granted to org-admin family in BOTH stores; fresh-org trigger.
// ===========================================================================
runIntegrationSuite('192 warehouse permission org-admin seed', () => {
  let ownerPool: pg.Pool;
  const tenantId = randomUUID();
  const newOrgId = randomUUID();
  const operatorRoleId = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WH RBAC seed tenant', 'eu', 'https://wh-rbac.example') on conflict (id) do nothing`,
      [tenantId],
    );
    // New org → AFTER INSERT trigger chain (080 role seed + 192 warehouse seed) fires for the admin family.
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'WH RBAC Seed Org', $3, 'fmcg') on conflict (id) do nothing`,
      [newOrgId, tenantId, `whrbac-${newOrgId.slice(0, 8)}`],
    );
    // Add an explicit warehouse operator role, then re-run the seed so it gets its subset.
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'warehouse_operator', 'warehouse_operator', 'Warehouse Operator', '[]'::jsonb, true, 220)
       on conflict do nothing`,
      [operatorRoleId, newOrgId],
    );
    await ownerPool.query(`select public.seed_warehouse_permissions_for_org($1)`, [newOrgId]);
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool
      .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = $1`, [
        newOrgId,
      ])
      .catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  runIntegrationTest('a freshly inserted org grants the full warehouse.* family to the admin role family in role_permissions', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'warehouse.%' order by rp.permission`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.map((r) => r.permission)).toEqual(WAREHOUSE_PERMISSIONS);
  });

  runIntegrationTest('the legacy roles.permissions jsonb cache also carries the full warehouse.* family for admin roles', async () => {
    const { rows } = await ownerPool.query<{ code: string; perms: string[] }>(
      `select r.code,
              (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
               where p like 'warehouse.%') as perms
       from public.roles r
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[])) order by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.perms ?? []).toEqual(WAREHOUSE_PERMISSIONS);
    }
  });

  runIntegrationTest('warehouse operator gets the operator subset, NOT the elevated SoD strings', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'warehouse.%' order by permission`,
      [operatorRoleId],
    );
    const opPerms = rows.map((r) => r.permission);
    // operator can receive/create/consume/move/read but NOT force_unlock / stock.adjust / fefo.override.
    expect(opPerms).toContain('warehouse.grn.receive');
    expect(opPerms).toContain('warehouse.lp.consume');
    expect(opPerms).toContain('warehouse.inventory.read');
    expect(opPerms).not.toContain('warehouse.lp.force_unlock');
    expect(opPerms).not.toContain('warehouse.stock.adjust');
    expect(opPerms).not.toContain('warehouse.fefo.override');
  });

  runIntegrationTest('non-admin / non-operator roles receive NO warehouse.* strings from this seed', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and r.code not in ('org.access.admin','org.platform.admin','owner','admin','org_admin',
                            'operator','warehouse_operator','warehouse_clerk','scanner','scanner_operator',
                            'production_operator','line_operator')
         and rp.permission like 'warehouse.%'`,
      [newOrgId],
    );
    expect(rows).toEqual([]);
  });

  runIntegrationTest('re-running the seed is idempotent (no duplicate rows, stable jsonb)', async () => {
    await ownerPool.query(`select public.seed_warehouse_permissions_for_org($1)`, [newOrgId]);
    await ownerPool.query(`select public.seed_warehouse_permissions_for_org($1)`, [newOrgId]);

    const dupes = await ownerPool.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'warehouse.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [newOrgId],
    );
    expect(dupes.rows).toEqual([]);

    const jsonbDupes = await ownerPool.query<{ total: string; distinct_count: string }>(
      `select count(*)::text as total, count(distinct p)::text as distinct_count
       from public.roles r
       cross join lateral jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[])) and p like 'warehouse.%'
       group by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    for (const row of jsonbDupes.rows) {
      expect(row.total).toEqual(row.distinct_count);
    }
  });
});

// ===========================================================================
// (4) Outbox CHECK (mig 192) — warehouse.material.consumed accepted, warehouse.bogus rejected.
// ===========================================================================
runIntegrationSuite('192 warehouse outbox event CHECK', () => {
  let ownerPool: pg.Pool;

  beforeAll(() => {
    ownerPool = getOwnerConnection();
  });

  afterAll(async () => {
    await ownerPool?.end();
  });

  runIntegrationTest('the outbox CHECK accepts all 4 warehouse.* event types', async () => {
    for (const event of WAREHOUSE_EVENTS) {
      const orgId = randomUUID();
      const aggId = randomUUID();
      const result = await ownerPool.query<{ event_type: string }>(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'license_plate', $3, $4::jsonb, 'warehouse-test-v1')
         returning event_type`,
        [orgId, event, aggId, JSON.stringify({ org_id: orgId, lp_id: aggId })],
      );
      expect(result.rows).toEqual([{ event_type: event }]);
      // Clean up so the suite leaves no rows behind.
      await ownerPool.query(`delete from public.outbox_events where aggregate_id = $1`, [aggId]);
    }
  });

  runIntegrationTest('the outbox CHECK rejects a bogus warehouse.bogus event type', async () => {
    const orgId = randomUUID();
    const aggId = randomUUID();
    await expect(
      ownerPool.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, 'warehouse.bogus', 'license_plate', $2, '{}'::jsonb, 'warehouse-test-v1')`,
        [orgId, aggId],
      ),
    ).rejects.toThrow(/outbox_events_event_type_check|violates check constraint/i);
  });
});
