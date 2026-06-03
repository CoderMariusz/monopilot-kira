import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const apexOrgId = '00000000-0000-0000-0000-000000000002';

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    'insert into app.session_org_contexts (session_token, org_id) values ($1, $2) on conflict (session_token) do update set org_id = excluded.org_id',
    [sessionToken, orgId],
  );
}

async function selectAsAppUser<T>(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  query: string,
  params: unknown[] = [],
) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(adminPool, sessionToken, apexOrgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, apexOrgId]);
    const result = await client.query<T>(query, params);
    await client.query('rollback');
    return result.rows;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

runIntegrationTest('Reference.D365_Constants Apex seed', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(() => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  it('creates an org-scoped table with forced RLS using app.current_org_id()', async () => {
    const table = await adminPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `
        select c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'Reference'
          and c.relname = 'D365_Constants'
      `,
    );

    expect(table.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await adminPool.query<{ qual: string | null; with_check: string | null }>(
      `
        select qual, with_check
        from pg_policies
        where schemaname = 'Reference'
          and tablename = 'D365_Constants'
      `,
    );

    expect(policies.rows.length).toBeGreaterThanOrEqual(1);
    expect(policies.rows.some((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes('app.current_org_id()'))).toBe(true);
  });

  it('seeds exactly 12 Apex constants visible to app_user under Apex org context', async () => {
    const rows = await selectAsAppUser<{ count: string }>(
      appPool,
      adminPool,
      'select count(*)::text from "Reference"."D365_Constants" where org_id = $1::uuid',
      [apexOrgId],
    );

    expect(rows[0]?.count).toBe('12');
  });

  it("seeds PRODUCTIONSITEID as FNOR", async () => {
    const rows = await selectAsAppUser<{ constant_value: string }>(
      appPool,
      adminPool,
      `
        select constant_value
        from "Reference"."D365_Constants"
        where org_id = $1::uuid
          and constant_key = 'PRODUCTIONSITEID'
      `,
      [apexOrgId],
    );

    expect(rows[0]?.constant_value).toBe('FNOR');
  });

  it('is idempotent: re-running the seed keeps 12 rows and preserves values', async () => {
    const before = await adminPool.query<{ digest: string; count: string }>(
      `
        select
          count(*)::text,
          md5(string_agg(constant_key || ':' || coalesce(constant_value, '<NULL>') || ':' || description, '|' order by constant_key)) as digest
        from "Reference"."D365_Constants"
        where org_id = $1::uuid
      `,
      [apexOrgId],
    );

    await adminPool.query('select "Reference".seed_d365_constants_apex()');

    const after = await adminPool.query<{ digest: string; count: string }>(
      `
        select
          count(*)::text,
          md5(string_agg(constant_key || ':' || coalesce(constant_value, '<NULL>') || ':' || description, '|' order by constant_key)) as digest
        from "Reference"."D365_Constants"
        where org_id = $1::uuid
      `,
      [apexOrgId],
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(after.rows[0]?.count).toBe('12');
  });

  it('leaves PRODUCTGROUPID_PR unconfigured as NULL, not a placeholder value', async () => {
    const rows = await adminPool.query<{ constant_value: string | null }>(
      `
        select constant_value
        from "Reference"."D365_Constants"
        where org_id = $1::uuid
          and constant_key = 'PRODUCTGROUPID_PR'
      `,
      [apexOrgId],
    );

    expect(rows.rows[0]?.constant_value).toBeNull();
  });
});
