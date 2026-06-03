import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const tenantId = '00500000-0000-4000-8000-000000000001';
const orgA = '00500000-0000-4000-8000-0000000000aa';
const orgB = '00500000-0000-4000-8000-0000000000bb';

const lookupTables = [
  { name: 'PackSizes', pk: ['org_id', 'value'] },
  { name: 'Templates', pk: ['org_id', 'template_name'] },
  { name: 'Lines_By_PackSize', pk: ['org_id', 'line'] },
  { name: 'Equipment_Setup_By_Line_Pack', pk: ['org_id', 'line', 'pack_size'] },
  { name: 'CloseConfirm', pk: ['org_id', 'value'] },
] as const;

async function seedOrg(pool: pg.Pool, orgId: string, name: string) {
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Reference Lookup Test Tenant', 'eu', 'https://reference-lookups.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, $3, 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgId, tenantId, name],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await callback(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('079 reference lookup migration source', () => {
  it('uses 3-digit filename, org_id scope, app.current_org_id RLS, and no tenant/current_setting policy reads', () => {
    const sql = readFileSync(resolve(process.cwd(), 'migrations/079-reference-lookups.sql'), 'utf8');

    expect(sql).toMatch(/org_id\s+uuid\s+not\s+null/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/i);
    expect(sql).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/i);
    for (const { name } of lookupTables) {
      expect(sql).toMatch(new RegExp(`alter\\s+table\\s+"Reference"\\."${name}"\\s+force\\s+row\\s+level\\s+security`, 'i'));
      expect(sql).toMatch(new RegExp(`grant\\s+select,\\s*insert,\\s*update,\\s*delete\\s+on\\s+"Reference"\\."${name}"\\s+to\\s+app_user`, 'i'));
    }
  });
});

runIntegrationTest('Reference lookup tables', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrg(ownerPool, orgA, 'Reference Lookup Org A');
    await seedOrg(ownerPool, orgB, 'Reference Lookup Org B');
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('creates all five Reference lookup tables with org-scoped primary keys and forced RLS', async () => {
    for (const { name, pk } of lookupTables) {
      const table = await ownerPool.query<{ table_name: string }>(
        `
          select table_name
          from information_schema.tables
          where table_schema = 'Reference'
            and table_name = $1
        `,
        [name],
      );
      expect(table.rows, `${name} exists`).toHaveLength(1);

      const columns = await ownerPool.query<{ column_name: string }>(
        `
          select column_name
          from information_schema.columns
          where table_schema = 'Reference'
            and table_name = $1
        `,
        [name],
      );
      const columnNames = new Set(columns.rows.map((row) => row.column_name));
      expect(columnNames.has('org_id'), `${name} has org_id`).toBe(true);
      expect(columnNames.has('tenant_id'), `${name} must not have tenant_id`).toBe(false);

      const primaryKey = await ownerPool.query<{ column_name: string }>(
        `
          select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_schema = tc.constraint_schema
           and kcu.constraint_name = tc.constraint_name
           and kcu.table_schema = tc.table_schema
           and kcu.table_name = tc.table_name
          where tc.table_schema = 'Reference'
            and tc.table_name = $1
            and tc.constraint_type = 'PRIMARY KEY'
          order by kcu.ordinal_position
        `,
        [name],
      );
      expect(primaryKey.rows.map((row) => row.column_name)).toEqual(pk);

      const rls = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `
          select relrowsecurity, relforcerowsecurity
          from pg_class
          where oid = format('%I.%I', 'Reference', $1::text)::regclass
        `,
        [name],
      );
      expect(rls.rows[0], `${name} RLS`).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    }
  });

  it('enforces primary keys for duplicate org-scoped lookup values', async () => {
    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await client.query('delete from "Reference"."PackSizes" where value = $1', ['250g']);
      await client.query('insert into "Reference"."PackSizes" (org_id, value) values ($1, $2)', [orgA, '250g']);
      await expect(
        client.query('insert into "Reference"."PackSizes" (org_id, value) values ($1, $2)', [orgA, '250g']),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it("matches Lines_By_PackSize rows using array containment for pack size '250g'", async () => {
    const rows = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await client.query('delete from "Reference"."Lines_By_PackSize" where line = $1', ['L1']);
      await client.query(
        `
          insert into "Reference"."Lines_By_PackSize" (org_id, line, supported_pack_sizes)
          values ($1, 'L1', array['250g','500g']::text[])
        `,
        [orgA],
      );
      const result = await client.query<{ line: string; supported_pack_sizes: string[] }>(
        `
          select line, supported_pack_sizes
          from "Reference"."Lines_By_PackSize"
          where supported_pack_sizes @> array['250g']::text[]
        `,
      );
      return result.rows;
    });

    expect(rows).toEqual([{ line: 'L1', supported_pack_sizes: ['250g', '500g'] }]);
  });

});
