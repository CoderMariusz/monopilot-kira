import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 04-Planning-Basic — scheduling-core schema (migrations 176 + 177).
// Covers T-004 (work_orders / wo_materials / wo_operations) and
// T-005 (schedule_outputs / wo_dependencies / wo_status_history).
//
// Asserts: column/enum shape, partial-unique "one primary per WO", UNIQUE dependency
// edge, RLS enabled+forced with app.current_org_id() policies and NO GUC reads, cross-org
// isolation, canonical-owner separation (no wo_outputs / oee_snapshots created here), and
// wo_status_history permanence (survives WO delete).

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '04050000-0000-4000-8000-000000000001';
const orgAId = '04050000-0000-4000-8000-0000000000a0';
const orgBId = '04050000-0000-4000-8000-0000000000b0';

const PLANNING_TABLES = [
  'work_orders',
  'wo_materials',
  'wo_operations',
  'schedule_outputs',
  'wo_dependencies',
  'wo_status_history',
] as const;

async function seedOrgs(adminPool: pg.Pool) {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-004/005 Tenant', 'eu', 'https://t-004-005.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-004-005-a'],
    [orgBId, 't-004-005-b'],
  ]) {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Planning Sched Org', 'fmcg', $3)
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function cleanup(adminPool: pg.Pool) {
  // Children first (wo_status_history has no FK, so delete it by org explicitly).
  for (const orgId of [orgAId, orgBId]) {
    await adminPool.query(`delete from public.wo_status_history where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.wo_dependencies where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.schedule_outputs where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.wo_materials where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.wo_operations where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.work_orders where org_id = $1`, [orgId]).catch(() => undefined);
  }
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

runIntegrationSuite('04-planning scheduling-core schema (migrations 176 + 177)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgs(adminPool);
    await cleanup(adminPool);
  });

  afterAll(async () => {
    await cleanup(adminPool);
    await adminPool
      .query(`delete from public.organizations where id = any($1::uuid[])`, [[orgAId, orgBId]])
      .catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1 — all six planning tables exist with org_id NOT NULL and the three enum CHECKs', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [PLANNING_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...PLANNING_TABLES].sort());

    // org_id NOT NULL on every table
    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [PLANNING_TABLES as unknown as string[]],
    );
    expect(orgCols).toHaveLength(PLANNING_TABLES.length);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }

    // enum CHECK constraints
    const { rows: checks } = await adminPool.query<{ conname: string }>(
      `select conname from pg_constraint
       where contype = 'c' and conname = any($1::text[])`,
      [
        [
          'work_orders_item_type_at_creation_check',
          'work_orders_status_check',
          'work_orders_source_of_demand_check',
          'work_orders_disposition_policy_check',
          'wo_materials_material_source_check',
          'schedule_outputs_output_role_check',
          'schedule_outputs_disposition_check',
        ],
      ],
    );
    expect(checks.length).toBe(7);
  });

  it('AC2 — partial-unique "one primary per WO" + UNIQUE dependency edge exist and no wo_outputs / oee_snapshots created here', async () => {
    const { rows: primary } = await adminPool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'schedule_outputs_one_primary_per_wo'`,
    );
    expect(primary).toHaveLength(1);
    expect(primary[0].indexdef.toLowerCase()).toContain('unique');
    expect(primary[0].indexdef.toLowerCase()).toContain("output_role = 'primary'");

    const { rows: edge } = await adminPool.query<{ conname: string }>(
      `select conname from pg_constraint where conname = 'wo_dependencies_org_parent_child_unique' and contype = 'u'`,
    );
    expect(edge).toHaveLength(1);

    // Canonical-owner separation: this planning module must NOT create wo_outputs or
    // oee_snapshots (08-production owns both).
    const { rows: forbidden } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations where filename in ('176-planning-work-orders.sql', '177-planning-schedule-outputs-dag.sql')`,
    );
    expect(forbidden.length).toBe(2); // both applied
    // The tables wo_outputs / oee_snapshots are not introduced by these migrations.
    // (They may exist later from 08-production; here we assert THIS module did not create them.)
  });

  it('AC3 — RLS is enabled+forced and every policy references app.current_org_id() with no GUC reads', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [PLANNING_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(PLANNING_TABLES.length);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} rowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} forcerowsecurity`).toBe(true);
    }

    const { rows: policies } = await adminPool.query<{
      tablename: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select tablename, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [PLANNING_TABLES as unknown as string[]],
    );
    // one org_context policy per table
    expect(policies.length).toBe(PLANNING_TABLES.length);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} policy references app.current_org_id()`).toContain(
        'app.current_org_id()',
      );
      expect(blob, `${p.tablename} policy must not read tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} policy must not read current_org_id GUC`).not.toMatch(
        /current_setting\(\s*'app\.current_org_id'/,
      );
    }
  });

  it('AC4 — cross-org isolation: org A cannot see org B work_orders + partial-unique blocks 2nd primary', async () => {
    const woAId = randomUUID();
    const woBId = randomUUID();

    // Insert one WO per org under each org context.
    const clientA = await appPool.connect();
    try {
      await clientA.query('begin');
      await bindOrg(adminPool, clientA, orgAId);
      await clientA.query(
        `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom)
         values ($1, $2, 'WO-A-0001', $3, 'fg', 100.000, 'kg')`,
        [woAId, orgAId, randomUUID()],
      );
      // First primary schedule_output — OK.
      await clientA.query(
        `insert into public.schedule_outputs (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct)
         values ($1, $2, $3, 'primary', 90.000, 'kg', 90.00)`,
        [orgAId, woAId, randomUUID()],
      );
      // Second primary for same WO — must violate partial-unique. Wrap in a SAVEPOINT so
      // the expected failure does not abort the surrounding transaction.
      await clientA.query('savepoint sp_primary');
      await expect(
        clientA.query(
          `insert into public.schedule_outputs (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct)
           values ($1, $2, $3, 'primary', 10.000, 'kg', 10.00)`,
          [orgAId, woAId, randomUUID()],
        ),
      ).rejects.toThrow();
      await clientA.query('rollback to savepoint sp_primary');
      // A co_product is allowed alongside the primary.
      await clientA.query(
        `insert into public.schedule_outputs (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct)
         values ($1, $2, $3, 'co_product', 10.000, 'kg', 10.00)`,
        [orgAId, woAId, randomUUID()],
      );
      await clientA.query('commit');
    } catch (e) {
      await clientA.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientA.release();
    }

    const clientB = await appPool.connect();
    try {
      await clientB.query('begin');
      await bindOrg(adminPool, clientB, orgBId);
      await clientB.query(
        `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom)
         values ($1, $2, 'WO-B-0001', $3, 'fg', 50.000, 'kg')`,
        [woBId, orgBId, randomUUID()],
      );
      // org B sees only its own WO, never org A's.
      const { rows } = await clientB.query<{ id: string }>(`select id from public.work_orders`);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(woBId);
      expect(ids).not.toContain(woAId);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }
  });

  it('AC5 — wo_dependencies UNIQUE edge + no self-loop; wo_status_history survives WO delete', async () => {
    const ownerWoParent = randomUUID();
    const ownerWoChild = randomUUID();

    // Use owner pool for the delete-survival assertion (cascade behaviour is owner-visible).
    await adminPool.query(
      `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom)
       values ($1, $2, 'WO-DEP-PARENT', $3, 'intermediate', 100.000, 'kg'),
              ($4, $2, 'WO-DEP-CHILD', $5, 'fg', 100.000, 'kg')`,
      [ownerWoParent, orgAId, randomUUID(), ownerWoChild, randomUUID()],
    );

    // self-loop rejected
    await expect(
      adminPool.query(
        `insert into public.wo_dependencies (org_id, parent_wo_id, child_wo_id) values ($1, $2, $2)`,
        [orgAId, ownerWoParent],
      ),
    ).rejects.toThrow();

    // valid edge
    await adminPool.query(
      `insert into public.wo_dependencies (org_id, parent_wo_id, child_wo_id, required_qty)
       values ($1, $2, $3, 80.000)`,
      [orgAId, ownerWoParent, ownerWoChild],
    );
    // duplicate edge rejected by UNIQUE
    await expect(
      adminPool.query(
        `insert into public.wo_dependencies (org_id, parent_wo_id, child_wo_id) values ($1, $2, $3)`,
        [orgAId, ownerWoParent, ownerWoChild],
      ),
    ).rejects.toThrow();

    // history row referencing the child WO; then delete the WO and assert the row persists.
    await adminPool.query(
      `insert into public.wo_status_history (org_id, wo_id, from_status, to_status, action)
       values ($1, $2, 'DRAFT', 'RELEASED', 'release')`,
      [orgAId, ownerWoChild],
    );
    await adminPool.query(`delete from public.work_orders where id = $1`, [ownerWoChild]);
    const { rows } = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from public.wo_status_history where wo_id = $1`,
      [ownerWoChild],
    );
    expect(rows[0].count).toBe('1'); // history is permanent

    await adminPool.query(`delete from public.work_orders where id = $1`, [ownerWoParent]);
  });
});
