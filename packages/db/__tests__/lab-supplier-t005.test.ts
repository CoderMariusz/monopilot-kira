import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

/**
 * T-005 — lab_results + supplier_specs migration (162).
 *
 * lab_results is QUALITY-OWNED — Technical reads it READ-ONLY (no Technical
 * write/approve path). supplier_specs is Technical-owned (Phase 1 governance).
 * Both tables: org_id (Wave0 lock), RLS via app.current_org_id(), audit cols,
 * FK indexes, site_id day-1 (nullable, no FK).
 */

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/162-lab-supplier.sql');

const tenantId = '00500000-0000-4000-8000-000000000001';
const orgAId = '00500000-0000-4000-8000-0000000000a1';
const orgBId = '00500000-0000-4000-8000-0000000000b1';

async function seedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

/** Run fn inside an app_user tx bound to orgId via app.set_org_context. */
async function withOrgTx<T>(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  orgId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await seedOrgContext(adminPool, sessionToken, orgId);
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('T-005 lab_results + supplier_specs migration static contract', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  it('uses the Wave0 org_id RLS contract (no tenant_id, no raw current_setting)', () => {
    expect(migration).toMatch(/\borg_id\b/);
    expect(migration).not.toMatch(/\btenant_id\b/);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/);
    expect(migration).not.toMatch(/current_setting\s*\(\s*'app\.(tenant_id|current_org_id)'/i);
  });

  it('creates both tables with RLS enabled + forced', () => {
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.lab_results/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.supplier_specs/i);
    expect(
      (migration.match(/enable\s+row\s+level\s+security/gi) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      (migration.match(/force\s+row\s+level\s+security/gi) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('models site_id day-1 as a plain nullable uuid (no FK, no registry)', () => {
    expect(migration).toMatch(/site_id\s+uuid/i);
    expect(migration).not.toMatch(/site_id\s+uuid[^,]*references/i);
  });

  it('grants DML to app_user on supplier_specs but only SELECT/INSERT on lab_results (Quality-owned, Technical reads only)', () => {
    // Technical never updates/deletes Quality-owned lab rows from this module.
    expect(migration).toMatch(
      /revoke\s+update,\s*delete\s+on\s+public\.lab_results\s+from\s+app_user/i,
    );
    expect(migration).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.supplier_specs\s+to\s+app_user/i,
    );
  });
});

runIntegrationSuite('T-005 lab_results + supplier_specs schema (integration)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let itemAId: string;
  let itemBId: string;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-005 Tenant', 'eu', 'https://t-005.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $3, 'T-005 Org A', 'fmcg'), ($2, $3, 'T-005 Org B', 'fmcg')
       on conflict (id) do nothing`,
      [orgAId, orgBId, tenantId],
    );

    itemAId = randomUUID();
    itemBId = randomUUID();
    await adminPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
       values ($1, $3, 'RM-T005-A', 'rm', 'T-005 RM A', 'kg'),
              ($2, $4, 'RM-T005-B', 'rm', 'T-005 RM B', 'kg')
       on conflict (id) do nothing`,
      [itemAId, itemBId, orgAId, orgBId],
    );
  });

  afterAll(async () => {
    await adminPool
      ?.query(`delete from public.lab_results where org_id in ($1, $2)`, [orgAId, orgBId])
      .catch(() => undefined);
    await adminPool
      ?.query(`delete from public.supplier_specs where org_id in ($1, $2)`, [orgAId, orgBId])
      .catch(() => undefined);
    await adminPool
      ?.query(`delete from public.items where org_id in ($1, $2)`, [orgAId, orgBId])
      .catch(() => undefined);
    await adminPool
      ?.query(`delete from public.organizations where id in ($1, $2)`, [orgAId, orgBId])
      .catch(() => undefined);
    await adminPool?.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1: inserting a lab_result with an invalid test_type is rejected by the CHECK', async () => {
    await expect(
      withOrgTx(appPool, adminPool, orgAId, (client) =>
        client.query(
          `insert into public.lab_results (org_id, item_id, test_type, result_status)
           values ($1, $2, 'not_a_real_test', 'pass')`,
          [orgAId, itemAId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('AC1b: inserting a lab_result with an invalid result_status is rejected by the CHECK', async () => {
    await expect(
      withOrgTx(appPool, adminPool, orgAId, (client) =>
        client.query(
          `insert into public.lab_results (org_id, item_id, test_type, result_status)
           values ($1, $2, 'atp_swab', 'definitely_not_valid')`,
          [orgAId, itemAId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('AC1c: a valid atp_swab lab_result inserts and reads back', async () => {
    const row = await withOrgTx(appPool, adminPool, orgAId, async (client) => {
      const res = await client.query<{ test_type: string; result_status: string; threshold_rlu: string }>(
        `insert into public.lab_results
           (org_id, item_id, test_type, test_code, result_value, result_unit, result_status, threshold_rlu)
         values ($1, $2, 'atp_swab', 'ATP-001', 7.5, 'RLU', 'pass', 10.00)
         returning test_type, result_status, threshold_rlu`,
        [orgAId, itemAId],
      );
      return res.rows[0];
    });
    expect(row.test_type).toBe('atp_swab');
    expect(row.result_status).toBe('pass');
    expect(Number(row.threshold_rlu)).toBe(10);
  });

  it('AC2: declared_allergens round-trips as a TEXT[] array', async () => {
    const arr = await withOrgTx(appPool, adminPool, orgAId, async (client) => {
      const res = await client.query<{ declared_allergens: string[] }>(
        `insert into public.supplier_specs
           (org_id, item_id, supplier_code, spec_version, declared_allergens)
         values ($1, $2, 'SUP-T005', 'v1', $3::text[])
         returning declared_allergens`,
        [orgAId, itemAId, ['milk', 'soy', 'gluten']],
      );
      return res.rows[0].declared_allergens;
    });
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toEqual(['milk', 'soy', 'gluten']);
  });

  it('AC2b: an invalid supplier_specs lifecycle_status is rejected by the status enum CHECK', async () => {
    await expect(
      withOrgTx(appPool, adminPool, orgAId, (client) =>
        client.query(
          `insert into public.supplier_specs
             (org_id, item_id, supplier_code, spec_version, lifecycle_status)
           values ($1, $2, 'SUP-T005-X', 'v1', 'bogus_status')`,
          [orgAId, itemAId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('AC3: with no org context, both tables return zero rows (RLS fail-closed)', async () => {
    // Seed one row in each table for org A.
    await withOrgTx(appPool, adminPool, orgAId, async (client) => {
      await client.query(
        `insert into public.lab_results (org_id, item_id, test_type, result_status)
         values ($1, $2, 'micro_apc', 'pending')`,
        [orgAId, itemAId],
      );
      await client.query(
        `insert into public.supplier_specs (org_id, item_id, supplier_code, spec_version)
         values ($1, $2, 'SUP-NOCTX', 'v1')`,
        [orgAId, itemAId],
      );
    });

    // No app.set_org_context → app.current_org_id() is NULL → zero rows.
    const client = await appPool.connect();
    try {
      const lab = await client.query(`select * from public.lab_results`);
      const spec = await client.query(`select * from public.supplier_specs`);
      expect(lab.rowCount).toBe(0);
      expect(spec.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it('AC3b: cross-org isolation — org B cannot see org A rows (and vice versa)', async () => {
    await withOrgTx(appPool, adminPool, orgAId, (client) =>
      client.query(
        `insert into public.supplier_specs (org_id, item_id, supplier_code, spec_version)
         values ($1, $2, 'SUP-ORG-A', 'v1')`,
        [orgAId, itemAId],
      ),
    );

    const orgBSeesOrgA = await withOrgTx(appPool, adminPool, orgBId, async (client) => {
      const res = await client.query(
        `select id from public.supplier_specs where supplier_code = 'SUP-ORG-A'`,
      );
      return res.rowCount ?? 0;
    });
    expect(orgBSeesOrgA).toBe(0);
  });

  it('lab_results FK to items is enforced (bad item_id rejected)', async () => {
    await expect(
      withOrgTx(appPool, adminPool, orgAId, (client) =>
        client.query(
          `insert into public.lab_results (org_id, item_id, test_type, result_status)
           values ($1, $2, 'atp_swab', 'pass')`,
          [orgAId, randomUUID()],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('supplier_specs partial unique index allows only one active+approved spec per org/item/supplier', async () => {
    const supplierCode = 'SUP-UNIQ-T005';
    await withOrgTx(appPool, adminPool, orgAId, (client) =>
      client.query(
        `insert into public.supplier_specs
           (org_id, item_id, supplier_code, spec_version, lifecycle_status, review_status)
         values ($1, $2, $3, 'v1', 'active', 'approved')`,
        [orgAId, itemAId, supplierCode],
      ),
    );

    await expect(
      withOrgTx(appPool, adminPool, orgAId, (client) =>
        client.query(
          `insert into public.supplier_specs
             (org_id, item_id, supplier_code, spec_version, lifecycle_status, review_status)
           values ($1, $2, $3, 'v2', 'active', 'approved')`,
          [orgAId, itemAId, supplierCode],
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('FK indexes exist on (org_id, item_id) for both tables', async () => {
    const { rows } = await adminPool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = 'public'
         and tablename in ('lab_results', 'supplier_specs')
         and indexdef ilike '%item_id%'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names.some((n) => n.includes('lab_results'))).toBe(true);
    expect(names.some((n) => n.includes('supplier_specs'))).toBe(true);
  });

  it('exactly four org-context RLS policies exist per table, referencing app.current_org_id()', async () => {
    for (const table of ['lab_results', 'supplier_specs']) {
      const { rows } = await adminPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `select policyname, qual, with_check from pg_policies
         where schemaname = 'public' and tablename = $1`,
        [table],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const combined = rows.map((r) => `${r.qual ?? ''} ${r.with_check ?? ''}`).join(' ');
      expect(combined).toMatch(/app\.current_org_id\(\)/);
    }
  });
});
