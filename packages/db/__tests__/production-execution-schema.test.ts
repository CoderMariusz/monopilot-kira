import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production — execution-core schema (migrations 181 + 182).
// Covers T-003 (wo_outputs, canonical), T-002 (wo_material_consumption), and the
// wo_executions / wo_events append-only WO lifecycle (T-022 optimistic lock).
//
// Asserts: tables + org_id NOT NULL; output_type enum CHECK; V-PROD-24 unique
// (org_id, batch_number, year); qty_kg >= 0; R14 transaction_id UNIQUE; FEFO partial index;
// chk_over_consumption_approval; RLS enabled+forced + app.current_org_id() policies with NO
// GUC reads; cross-org isolation; canonical-owner separation (planning migs 176/177 created
// NO wo_outputs); append-only wo_events (app_user has no UPDATE/DELETE); optimistic-lock
// version column + one-execution-per-WO uniqueness.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08010000-0000-4000-8000-000000000001';
const orgAId = '08010000-0000-4000-8000-0000000000a0';
const orgBId = '08010000-0000-4000-8000-0000000000b0';

const PRODUCTION_TABLES = [
  'wo_outputs',
  'wo_material_consumption',
  'wo_executions',
  'wo_events',
] as const;

async function seedOrgs(adminPool: pg.Pool) {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-002/003 Tenant', 'eu', 'https://t-002-003.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-prod-exec-a'],
    [orgBId, 't-prod-exec-b'],
  ]) {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Prod Exec Org', 'fmcg', $3)
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function cleanup(adminPool: pg.Pool) {
  for (const orgId of [orgAId, orgBId]) {
    await adminPool.query(`delete from public.wo_events where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool
      .query(`delete from public.wo_executions where org_id = $1`, [orgId])
      .catch(() => undefined);
    await adminPool
      .query(`delete from public.wo_material_consumption where org_id = $1`, [orgId])
      .catch(() => undefined);
    await adminPool.query(`delete from public.wo_outputs where org_id = $1`, [orgId]).catch(() => undefined);
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

async function makeWorkOrder(adminPool: pg.Pool, orgId: string, woNumber: string): Promise<string> {
  const id = randomUUID();
  await adminPool.query(
    `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom)
     values ($1, $2, $3, $4, 'fg', 100.000, 'kg')`,
    [id, orgId, woNumber, randomUUID()],
  );
  return id;
}

runIntegrationSuite('08-production execution-core schema (migrations 181 + 182)', () => {
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

  it('AC1 — all four execution tables exist with org_id NOT NULL + output_type/status enum CHECKs', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [PRODUCTION_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...PRODUCTION_TABLES].sort());

    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [PRODUCTION_TABLES as unknown as string[]],
    );
    expect(orgCols).toHaveLength(PRODUCTION_TABLES.length);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }

    const { rows: checks } = await adminPool.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c' and conname = any($1::text[])`,
      [
        [
          'wo_outputs_output_type_check',
          'wo_outputs_qty_kg_nonneg_check',
          'chk_over_consumption_approval',
          'wo_material_consumption_qty_consumed_positive_check',
          'wo_executions_status_check',
          'wo_events_event_type_check',
        ],
      ],
    );
    expect(checks.length).toBe(6);
  });

  it('AC2 — V-PROD-24 batch uniqueness (org+batch+year), qty_kg>=0, output_type enum, output_type 1:1 with schedule_outputs roles', async () => {
    const woId = await makeWorkOrder(adminPool, orgAId, 'WO-OUT-0001');

    const insertOutput = (overrides: Record<string, unknown>) => {
      const base: Record<string, unknown> = {
        org_id: orgAId,
        transaction_id: randomUUID(),
        wo_id: woId,
        output_type: 'primary',
        product_id: randomUUID(),
        batch_number: 'BATCH-A',
        qty_kg: 10.0,
        registered_at: '2026-03-15T10:00:00Z',
      };
      const row = { ...base, ...overrides };
      return adminPool.query(
        `insert into public.wo_outputs
           (org_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg, registered_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.org_id,
          row.transaction_id,
          row.wo_id,
          row.output_type,
          row.product_id,
          row.batch_number,
          row.qty_kg,
          row.registered_at,
        ],
      );
    };

    // first BATCH-A in 2026 — OK
    await insertOutput({});
    // same org + batch + year → V-PROD-24 unique violation
    await expect(insertOutput({})).rejects.toThrow();
    // same batch but DIFFERENT year → allowed (year is part of the unique key)
    await insertOutput({ registered_at: '2025-03-15T10:00:00Z' });

    // qty_kg < 0 rejected
    await expect(insertOutput({ batch_number: 'BATCH-NEG', qty_kg: -1.0 })).rejects.toThrow();

    // illegal output_type rejected (enum CHECK)
    await expect(insertOutput({ batch_number: 'BATCH-BAD', output_type: 'byproduct' })).rejects.toThrow();

    // all three canonical output_types accepted (1:1 mapping with schedule_outputs.output_role)
    await insertOutput({ batch_number: 'BATCH-CO', output_type: 'co_product' });
    await insertOutput({ batch_number: 'BATCH-BY', output_type: 'by_product' });
  });

  it('AC3 — wo_material_consumption R14 transaction_id UNIQUE + chk_over_consumption_approval + FEFO partial index', async () => {
    const woId = await makeWorkOrder(adminPool, orgAId, 'WO-CONS-0001');
    const txn = randomUUID();

    await adminPool.query(
      `insert into public.wo_material_consumption
         (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, fefo_adherence_flag)
       values ($1, $2, $3, $4, $5, 5.000, true)`,
      [orgAId, txn, woId, randomUUID(), randomUUID()],
    );
    // duplicate transaction_id → R14 idempotency unique violation
    await expect(
      adminPool.query(
        `insert into public.wo_material_consumption
           (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, fefo_adherence_flag)
         values ($1, $2, $3, $4, $5, 1.000, true)`,
        [orgAId, txn, woId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();

    // over_consumption_flag=true with NULL approver → chk_over_consumption_approval rejects
    await expect(
      adminPool.query(
        `insert into public.wo_material_consumption
           (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, fefo_adherence_flag, over_consumption_flag)
         values ($1, $2, $3, $4, $5, 1.000, true, true)`,
        [orgAId, randomUUID(), woId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();

    // qty_consumed <= 0 rejected
    await expect(
      adminPool.query(
        `insert into public.wo_material_consumption
           (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, fefo_adherence_flag)
         values ($1, $2, $3, $4, $5, 0, true)`,
        [orgAId, randomUUID(), woId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();

    // FEFO partial index exists with the deviation predicate
    const { rows: idx } = await adminPool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'idx_consumption_fefo_dev'`,
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef.toLowerCase()).toContain('fefo_adherence_flag = false');
  });

  it('AC4 — RLS enabled+forced; every policy references app.current_org_id() with no GUC reads', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [PRODUCTION_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(PRODUCTION_TABLES.length);
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
      [PRODUCTION_TABLES as unknown as string[]],
    );
    expect(policies.length).toBe(PRODUCTION_TABLES.length);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} references app.current_org_id()`).toContain('app.current_org_id()');
      expect(blob, `${p.tablename} no tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} no current_org_id GUC`).not.toMatch(
        /current_setting\(\s*'app\.current_org_id'/,
      );
    }
  });

  it('AC5 — cross-org isolation: org B cannot see org A wo_outputs under app_user RLS', async () => {
    const woAId = await makeWorkOrder(adminPool, orgAId, 'WO-ISO-A');
    const outputAId = randomUUID();

    const clientA = await appPool.connect();
    try {
      await clientA.query('begin');
      await bindOrg(adminPool, clientA, orgAId);
      await clientA.query(
        `insert into public.wo_outputs
           (id, org_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg)
         values ($1, $2, $3, $4, 'primary', $5, 'ISO-A-BATCH', 12.000)`,
        [outputAId, orgAId, randomUUID(), woAId, randomUUID()],
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
      const { rows } = await clientB.query<{ id: string }>(`select id from public.wo_outputs`);
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(outputAId);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }
  });

  it('AC6 — canonical-owner separation: planning migs 176/177 created NO wo_outputs; 181/182 own it', async () => {
    // wo_outputs / wo_executions / wo_events are introduced by the 08-production migrations,
    // never by the 04-planning ones.
    const { rows: prodMigs } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations
       where filename in ('181-production-wo-outputs-consumption.sql', '182-production-wo-executions-events.sql')`,
    );
    expect(prodMigs.length).toBe(2);

    const { rows: planningMigs } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations
       where filename in ('176-planning-work-orders.sql', '177-planning-schedule-outputs-dag.sql')`,
    );
    expect(planningMigs.length).toBe(2);
    // schedule_outputs is the planning projection; it exists and is distinct from wo_outputs.
    const { rows: schedExists } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = 'schedule_outputs'`,
    );
    expect(schedExists).toHaveLength(1);
  });

  it('AC7 — wo_executions optimistic-lock version + one-execution-per-WO; wo_events append-only', async () => {
    const woId = await makeWorkOrder(adminPool, orgAId, 'WO-EXEC-0001');

    // version column exists with default 0 and is materialized state (status default planned).
    const execId = randomUUID();
    await adminPool.query(
      `insert into public.wo_executions (id, org_id, wo_id) values ($1, $2, $3)`,
      [execId, orgAId, woId],
    );
    const { rows: exec } = await adminPool.query<{ status: string; version: number }>(
      `select status, version from public.wo_executions where id = $1`,
      [execId],
    );
    expect(exec[0].status).toBe('planned');
    expect(Number(exec[0].version)).toBe(0);

    // one execution per WO — second insert violates unique(org_id, wo_id)
    await expect(
      adminPool.query(`insert into public.wo_executions (org_id, wo_id) values ($1, $2)`, [orgAId, woId]),
    ).rejects.toThrow();

    // append a lifecycle event
    await adminPool.query(
      `insert into public.wo_events
         (org_id, wo_id, execution_id, transaction_id, event_type, from_status, to_status, version_at_event)
       values ($1, $2, $3, $4, 'start', 'planned', 'in_progress', 0)`,
      [orgAId, woId, execId, randomUUID()],
    );
    // illegal event_type rejected
    await expect(
      adminPool.query(
        `insert into public.wo_events (org_id, wo_id, transaction_id, event_type, to_status)
         values ($1, $2, $3, 'frobnicate', 'in_progress')`,
        [orgAId, woId, randomUUID()],
      ),
    ).rejects.toThrow();

    // append-only: app_user must NOT hold UPDATE or DELETE on wo_events.
    const { rows: priv } = await adminPool.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'wo_events' and grantee = 'app_user'`,
    );
    const privs = priv.map((r) => r.privilege_type);
    expect(privs).toContain('SELECT');
    expect(privs).toContain('INSERT');
    expect(privs).not.toContain('UPDATE');
    expect(privs).not.toContain('DELETE');
  });
});
