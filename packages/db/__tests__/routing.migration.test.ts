import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/163-routings.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16300000-0000-4000-8000-000000000001';
const orgA = '16300000-0000-4000-8000-0000000000aa';
const orgB = '16300000-0000-4000-8000-0000000000bb';
const orgARole = '16300000-0000-4000-8000-00000000a111';
const orgBRole = '16300000-0000-4000-8000-00000000b222';
const orgAUser = '16300000-0000-4000-8000-00000000aaaa';
const orgBUser = '16300000-0000-4000-8000-00000000bbbb';
const itemA = '16300000-0000-4000-8000-00000000a001';
const itemB = '16300000-0000-4000-8000-00000000b001';

function appUserConnectionString() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for app_user integration tests');
  }
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function ensureAppUser(adminPool: pg.Pool) {
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
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Routing Tenant', 'eu', 'https://routing.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await adminPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'Routing Org A', 'bakery'),
             ($3, $2, 'Routing Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await adminPool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'routing_user', 'Routing Role A', '[]'::jsonb, true),
             ($3, $4, 'routing_user', 'Routing Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'routing-a@example.test', 'Routing User A', $3),
             ($4, $5, 'routing-b@example.test', 'Routing User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  // items the routings reference (FK -> public.items, migration 153).
  await adminPool.query(
    `
      insert into public.items (id, org_id, item_code, item_type, name, uom_base)
      values ($1, $2, 'T163-FG-A', 'fg', 'Routing FG A', 'kg'),
             ($3, $4, 'T163-FG-B', 'fg', 'Routing FG B', 'kg')
      on conflict (org_id, item_code) do update
        set name = excluded.name
    `,
    [itemA, orgA, itemB, orgB],
  );
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await adminPool.query(
    `delete from public.routing_operations where routing_id in (select id from public.routings where org_id in ($1, $2))`,
    [orgA, orgB],
  );
  await adminPool.query(`delete from public.routings where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('163 routings migration file', () => {
  it('exists, creates both tables, and isolates via app.current_org_id (no raw GUC reads)', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/163-routings.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.routings/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.routing_operations/i);
    expect(migration).toMatch(/routings_org_isolation/i);
    expect(migration).toMatch(/routing_operations_org_isolation/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    // Canonical manufacturing-operation naming (not legacy process_stage/process_code).
    expect(migration).toMatch(/manufacturing_operation_name/i);
    expect(migration).not.toMatch(/\bprocess_stage\b|\bprocess_code\b/i);
    // site_id day-1: nullable, no FK/registry reference.
    expect(migration).toMatch(/site_id\s+uuid\b/i);
    expect(migration).not.toMatch(/site_id\s+uuid[^,;]*references/i);
  });
});

runIntegrationTest('163 routings + routing_operations tables', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    // Apply twice to prove idempotency (create-if-not-exists + drop/create policy).
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
    await cleanupRows(adminPool);
  });

  afterAll(async () => {
    await cleanupRows(adminPool).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
    if (originalDatabaseUrlApp === undefined) {
      delete process.env.DATABASE_URL_APP;
    } else {
      process.env.DATABASE_URL_APP = originalDatabaseUrlApp;
    }
  });

  it('creates both tables with FK to items, cascade FK to routings, and key constraints', async () => {
    const routingCols = await adminPool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='routings' order by ordinal_position`,
    );
    expect(routingCols.rows.map((r) => r.column_name)).toEqual([
      'id',
      'org_id',
      'site_id',
      'item_id',
      'version',
      'status',
      'effective_from',
      'effective_to',
      'approved_by',
      'approved_at',
      'created_by',
      'created_at',
      'updated_at',
    ]);

    const opCols = await adminPool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='routing_operations' order by ordinal_position`,
    );
    expect(opCols.rows.map((r) => r.column_name)).toEqual([
      'id',
      'org_id',
      'site_id',
      'routing_id',
      'op_no',
      'op_code',
      'op_name',
      'line_id',
      'machine_id',
      'setup_time_min',
      'run_time_per_unit_sec',
      'cost_per_hour',
      'manufacturing_operation_name',
      'created_by',
      'created_at',
      'updated_at',
    ]);

    const routingCons = await adminPool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid='public.routings'::regclass order by conname`,
    );
    const routingConText = routingCons.rows.map((r) => `${r.conname}: ${r.def}`).join('\n');
    expect(routingConText).toContain('UNIQUE (org_id, item_id, version)');
    expect(routingConText).toMatch(/FOREIGN KEY \(item_id\) REFERENCES items\(id\)/);

    const opCons = await adminPool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid='public.routing_operations'::regclass order by conname`,
    );
    const opConText = opCons.rows.map((r) => `${r.conname}: ${r.def}`).join('\n');
    expect(opConText).toContain('UNIQUE (routing_id, op_no)');
    expect(opConText).toMatch(/FOREIGN KEY \(routing_id\) REFERENCES routings\(id\) ON DELETE CASCADE/);

    // cost/rate columns are NUMERIC-exact, not float.
    const numericCols = await adminPool.query<{ column_name: string; data_type: string; numeric_precision: number; numeric_scale: number }>(
      `select column_name, data_type, numeric_precision, numeric_scale
        from information_schema.columns
        where table_schema='public' and table_name='routing_operations'
          and column_name in ('run_time_per_unit_sec','cost_per_hour')
        order by column_name`,
    );
    expect(numericCols.rows).toEqual([
      { column_name: 'cost_per_hour', data_type: 'numeric', numeric_precision: 10, numeric_scale: 4 },
      { column_name: 'run_time_per_unit_sec', data_type: 'numeric', numeric_precision: 10, numeric_scale: 2 },
    ]);
  });

  it('forces RLS and publishes one org-isolation policy per table via app.current_org_id only', async () => {
    for (const table of ['routings', 'routing_operations']) {
      const rls = await adminPool.query<{ rowsecurity: boolean; forcerowsecurity: boolean }>(
        `select relrowsecurity as rowsecurity, relforcerowsecurity as forcerowsecurity
          from pg_class where oid = $1::regclass`,
        [`public.${table}`],
      );
      expect(rls.rows, table).toEqual([{ rowsecurity: true, forcerowsecurity: true }]);

      const policies = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `select policyname, qual, with_check from pg_policies
          where schemaname='public' and tablename=$1`,
        [table],
      );
      expect(policies.rows, table).toHaveLength(1);
      const policyText = `${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`;
      expect(policyText, table).toContain('app.current_org_id()');
      expect(policyText, table).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
    }
  });

  it('enforces UNIQUE(routing_id, op_no) for ordered operations under app_user', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version) values ($1, $2, 1) returning id`,
        [orgA, itemA],
      );
      const routingId = routing.rows[0]!.id;
      await client.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name)
          values ($1, $2, 1, 'mix', 'Mix')`,
        [orgA, routingId],
      );
      await expect(
        client.query(
          `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name)
            values ($1, $2, 1, 'cook', 'Cook')`,
          [orgA, routingId],
        ),
      ).rejects.toThrow(/routing_operations_routing_op_no_unique|duplicate key/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('cascade-deletes routing_operations when the parent routing is deleted', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version) values ($1, $2, 7) returning id`,
        [orgA, itemA],
      );
      const routingId = routing.rows[0]!.id;
      await client.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name)
          values ($1, $2, 1, 'mix', 'Mix'), ($1, $2, 2, 'pack', 'Pack')`,
        [orgA, routingId],
      );
      const before = await client.query(
        `select 1 from public.routing_operations where routing_id = $1`,
        [routingId],
      );
      expect(before.rowCount).toBe(2);

      await client.query(`delete from public.routings where id = $1`, [routingId]);

      const after = await client.query(
        `select 1 from public.routing_operations where routing_id = $1`,
        [routingId],
      );
      expect(after.rowCount).toBe(0);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('rejects a duplicate (org_id, item_id, version) routing', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      await client.query(
        `insert into public.routings (org_id, item_id, version) values ($1, $2, 3)`,
        [orgA, itemA],
      );
      await expect(
        client.query(
          `insert into public.routings (org_id, item_id, version) values ($1, $2, 3)`,
          [orgA, itemA],
        ),
      ).rejects.toThrow(/routings_org_item_version_unique|duplicate key/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('isolates routings + routing_operations between two organizations under app_user', async () => {
    const orgASession = randomUUID();
    const orgBSession = randomUUID();
    await seedTrustedOrgContext(adminPool, orgASession, orgA);
    await seedTrustedOrgContext(adminPool, orgBSession, orgB);

    const clientA = await appPool.connect();
    const clientB = await appPool.connect();
    try {
      await clientA.query('begin');
      await clientA.query('select app.set_org_context($1::uuid, $2::uuid)', [orgASession, orgA]);
      const ra = await clientA.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version) values ($1, $2, 9) returning id`,
        [orgA, itemA],
      );
      await clientA.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, cost_per_hour)
          values ($1, $2, 1, 'mix', 'Org A Mix', '42.5000')`,
        [orgA, ra.rows[0]!.id],
      );

      await clientB.query('begin');
      await clientB.query('select app.set_org_context($1::uuid, $2::uuid)', [orgBSession, orgB]);
      const rb = await clientB.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version) values ($1, $2, 9) returning id`,
        [orgB, itemB],
      );
      await clientB.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name)
          values ($1, $2, 1, 'pack', 'Org B Pack')`,
        [orgB, rb.rows[0]!.id],
      );

      const visibleToA = await clientA.query<{ op_name: string; cost_per_hour: string | null }>(
        `select op.op_name, op.cost_per_hour from public.routing_operations op order by op.op_name`,
      );
      expect(visibleToA.rows).toEqual([{ op_name: 'Org A Mix', cost_per_hour: '42.5000' }]);

      const visibleToB = await clientB.query<{ op_name: string }>(
        `select op.op_name from public.routing_operations op order by op.op_name`,
      );
      expect(visibleToB.rows).toEqual([{ op_name: 'Org B Pack' }]);

      // Cross-org spoof on the WITH CHECK predicate is rejected.
      await expect(
        clientA.query(
          `insert into public.routings (org_id, item_id, version) values ($1, $2, 11)`,
          [orgB, itemB],
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
