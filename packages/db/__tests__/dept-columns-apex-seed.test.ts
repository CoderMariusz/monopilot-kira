/**
 * T-016 — Reference.DeptColumns Apex baseline seed (69 cols)
 *
 * RED phase: tests assert the 69-col Apex baseline rows exist in
 * Reference.DeptColumns after the 095 migration runs. Tests use the
 * Apex org UUID and run against the real DB when DATABASE_URL is set.
 *
 * PRD refs: docs/prd/01-NPD-PRD.md §5.1-§5.10
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection, getAppConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env['DATABASE_URL'];
const runIntegration = databaseUrl ? describe : describe.skip;

const APEX_ORG_ID = '00000000-0000-0000-0000-000000000002';

async function selectAsAppUser<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    'insert into app.session_org_contexts (session_token, org_id) values ($1, $2) on conflict (session_token) do update set org_id = excluded.org_id',
    [sessionToken, APEX_ORG_ID],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, APEX_ORG_ID]);
    const result = await client.query<T>(query, params);
    await client.query('rollback');
    return result.rows;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

runIntegration('T-016 Reference.DeptColumns Apex baseline seed', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(() => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  // AC1: count = 69 for Apex org
  it('AC1: seeds exactly 69 DeptColumns baseline rows for the Apex org', async () => {
    const rows = await selectAsAppUser<{ count: string }>(
      appPool,
      ownerPool,
      `select count(*)::text as count
       from "Reference"."DeptColumns"
       where org_id = $1::uuid`,
      [APEX_ORG_ID],
    );
    expect(rows[0]?.count).toBe('69');
  });

  // AC2: idempotency — after running the seed function again, count stays 69
  it('AC2: idempotent — re-seeding keeps row count at 69', async () => {
    // Call the migration-seeded function directly to prove idempotency
    await ownerPool.query('select "Reference".seed_dept_columns_apex()');

    const rows = await selectAsAppUser<{ count: string }>(
      appPool,
      ownerPool,
      `select count(*)::text as count
       from "Reference"."DeptColumns"
       where org_id = $1::uuid`,
      [APEX_ORG_ID],
    );
    expect(rows[0]?.count).toBe('69');
  });

  // AC3: blocking_rule for 'price' column = 'Core + Production done' (Phase D #7)
  it('AC3: Price column has blocking_rule = "Core + Production done"', async () => {
    const rows = await selectAsAppUser<{ blocking_rule: string }>(
      appPool,
      ownerPool,
      `select blocking_rule
       from "Reference"."DeptColumns"
       where org_id = $1::uuid
         and lower(column_key) = 'price'`,
      [APEX_ORG_ID],
    );
    expect(rows[0]?.blocking_rule).toBe('Core + Production done');
  });

  // Additional: all 7 dept codes are present
  it('covers all 8 dept codes (Core, Planning, Commercial, Production, Technical, MRP, Procurement, System)', async () => {
    const rows = await selectAsAppUser<{ dept_code: string; cnt: string }>(
      appPool,
      ownerPool,
      `select dept_code, count(*)::text as cnt
       from "Reference"."DeptColumns"
       where org_id = $1::uuid
       group by dept_code
       order by dept_code`,
      [APEX_ORG_ID],
    );

    const deptMap = Object.fromEntries(rows.map((r) => [r.dept_code, Number(r.cnt)]));
    // Verify the exact counts from PRD §5.1
    expect(deptMap['Core']).toBe(8);
    expect(deptMap['Planning']).toBe(4);
    expect(deptMap['Commercial']).toBe(8);
    expect(deptMap['Production']).toBe(19);
    expect(deptMap['Technical']).toBe(2);
    expect(deptMap['MRP']).toBe(13);
    expect(deptMap['Procurement']).toBe(5);
    expect(deptMap['System']).toBe(10);
  });

  // Required_for_done red-line: auto-derived cols must NOT have required_for_done = true
  it('risk guard: auto-derived cols (Ingredient_Codes, Equipment_Setup) have required_for_done = false', async () => {
    const rows = await selectAsAppUser<{ column_key: string; required_for_done: boolean }>(
      appPool,
      ownerPool,
      `select column_key, required_for_done
       from "Reference"."DeptColumns"
       where org_id = $1::uuid
         and lower(column_key) in ('ingredient_codes', 'equipment_setup',
           'intermediate_code_p1', 'intermediate_code_p2',
           'intermediate_code_p3', 'intermediate_code_p4',
           'intermediate_code_final')`,
      [APEX_ORG_ID],
    );
    for (const row of rows) {
      expect(row.required_for_done).toBe(false);
    }
  });

  // New-org trigger: seeding propagates to a freshly-created org
  it('new-org trigger: DeptColumns are seeded into a newly created org via trigger', async () => {
    const freshTenantId = '00b16000-0000-4000-8000-000000000016';
    const freshOrgId = '00b16001-0000-4000-8000-000000000016';
    try {
      await ownerPool.query(
        `insert into public.tenants (id, name, region_cluster, data_plane_url)
         values ($1::uuid, 'T-016 fresh tenant', 'eu', 'local')
         on conflict (id) do update set name = excluded.name`,
        [freshTenantId],
      );
      await ownerPool.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1::uuid, $2::uuid, 'T-016 fresh org', 'bakery')
         on conflict (id) do update set name = excluded.name`,
        [freshOrgId, freshTenantId],
      );

      const rows = await ownerPool.query<{ count: string }>(
        `select count(*)::text as count
         from "Reference"."DeptColumns"
         where org_id = $1::uuid`,
        [freshOrgId],
      );
      expect(rows.rows[0]?.count).toBe('69');
    } finally {
      await ownerPool
        .query(`delete from public.organizations where id = $1::uuid`, [freshOrgId])
        .catch(() => undefined);
      await ownerPool
        .query(`delete from public.tenants where id = $1::uuid`, [freshTenantId])
        .catch(() => undefined);
    }
  });
});
