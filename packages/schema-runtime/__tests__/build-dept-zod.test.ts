import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';

import { buildDeptZod, clearDeptZodCache } from '../src/build-dept-zod.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = randomUUID();
const orgA = randomUUID();
const orgB = randomUUID();
const dept = `core_t014_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

async function setOrgContext(client: pg.PoolClient, owner: pg.Pool, orgId: string) {
  const sessionToken = randomUUID();
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
  return sessionToken;
}

async function withOrgClient<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await setOrgContext(client, ownerPool, orgId);
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

run('buildDeptZod runtime generator', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    owner = getOwnerConnection();
    app = getAppConnection();

    await owner.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1::uuid, 'T-014 Tenant', 'eu', 'https://t-014.example.test')
       on conflict (id) do update set name = excluded.name`,
      [tenantId],
    );
    await owner.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values
         ($1::uuid, $3::uuid, 'T-014 Org A', 'fmcg', 't-014-org-a'),
         ($2::uuid, $3::uuid, 'T-014 Org B', 'fmcg', 't-014-org-b')
       on conflict (id) do update set name = excluded.name`,
      [orgA, orgB, tenantId],
    );
  });

  beforeEach(async () => {
    clearDeptZodCache();
    await owner.query(`delete from "Reference"."DeptColumns" where org_id in ($1::uuid, $2::uuid)`, [
      orgA,
      orgB,
    ]);
    await owner.query(`delete from "Reference"."PackSizes" where org_id in ($1::uuid, $2::uuid)`, [
      orgA,
      orgB,
    ]);
  });

  afterAll(async () => {
    await owner?.query(`delete from "Reference"."DeptColumns" where org_id in ($1::uuid, $2::uuid)`, [
      orgA,
      orgB,
    ]).catch(() => undefined);
    await owner?.query(`delete from "Reference"."PackSizes" where org_id in ($1::uuid, $2::uuid)`, [
      orgA,
      orgB,
    ]).catch(() => undefined);
    await owner?.query(`delete from public.organizations where id in ($1::uuid, $2::uuid)`, [
      orgA,
      orgB,
    ]).catch(() => undefined);
    await owner?.query(`delete from public.tenants where id = $1::uuid`, [tenantId]).catch(() => undefined);
    await app?.end();
    await owner?.end();
  });

  it('requires required_for_done text columns with a required message', async () => {
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (org_id, dept_code, column_key, data_type, field_type, required_for_done, schema_version)
       values ($1::uuid, $2, 'product_name', 'text', 'string', true, 1)`,
      [orgA, dept],
    );

    const schema = await withOrgClient(app, owner, orgA, (client) =>
      buildDeptZod(orgA, dept, { db: client }),
    );
    const result = schema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['product_name'],
          message: expect.stringMatching(/required/i),
        }),
      );
    }
  });

  it('builds dropdown enums from org-scoped Reference lookup rows', async () => {
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (org_id, dept_code, column_key, data_type, field_type, dropdown_source, required_for_done, schema_version)
       values ($1::uuid, $2, 'pack_size', 'dropdown', 'enum', 'PackSizes', true, 1)`,
      [orgA, dept],
    );
    await owner.query(
      `insert into "Reference"."PackSizes" (org_id, value)
       values ($1::uuid, '250g'), ($1::uuid, '500g')`,
      [orgA],
    );

    const schema = await withOrgClient(app, owner, orgA, (client) =>
      buildDeptZod(orgA, dept, { db: client }),
    );

    expect(schema.safeParse({ pack_size: '250g' }).success).toBe(true);
    const invalid = schema.safeParse({ pack_size: '1kg' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.code).toBe('invalid_enum_value');
    }
  });

  it('busts cache when schema_version increments', async () => {
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (org_id, dept_code, column_key, data_type, field_type, required_for_done, schema_version)
       values ($1::uuid, $2, 'product_name', 'text', 'string', true, 1)`,
      [orgA, dept],
    );

    const v1 = await withOrgClient(app, owner, orgA, (client) =>
      buildDeptZod(orgA, dept, { db: client }),
    );

    await owner.query(
      `update "Reference"."DeptColumns"
       set schema_version = 2
       where org_id = $1::uuid and dept_code = $2 and column_key = 'product_name'`,
      [orgA, dept],
    );

    const v2 = await withOrgClient(app, owner, orgA, (client) =>
      buildDeptZod(orgA, dept, { db: client }),
    );

    expect(v2).not.toBe(v1);
  });

  it('uses app_user RLS on the default connection instead of owner BYPASSRLS', async () => {
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (org_id, dept_code, column_key, data_type, field_type, required_for_done, schema_version)
       values ($1::uuid, $2, 'rls_hidden_required', 'text', 'string', true, 1)`,
      [orgA, dept],
    );

    const schema = await buildDeptZod(orgA, dept);

    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ rls_hidden_required: 'visible only with org context' }).success).toBe(true);
  });

  it('coerces boolean columns and skips formula columns without poisoning the dept schema', async () => {
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (org_id, dept_code, column_key, field_type, required_for_done, schema_version)
       values
         ($1::uuid, $2, 'requires_approval', 'boolean', true, 1),
         ($1::uuid, $2, 'computed_margin', 'formula', true, 1)`,
      [orgA, dept],
    );

    const schema = await withOrgClient(app, owner, orgA, (client) =>
      buildDeptZod(orgA, dept, { db: client }),
    );

    expect(schema.safeParse({ requires_approval: 'true' }).success).toBe(true);

    const missingBoolean = schema.safeParse({});
    expect(missingBoolean.success).toBe(false);
    if (!missingBoolean.success) {
      expect(missingBoolean.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['requires_approval'],
          message: 'requires_approval is required',
        }),
      );
      expect(missingBoolean.error.issues).not.toContainEqual(
        expect.objectContaining({
          path: ['computed_margin'],
        }),
      );
    }
  });

  it('uses app_user RLS non-vacuously for DeptColumns and rejects cross-org writes', async () => {
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (org_id, dept_code, column_key, data_type, field_type, required_for_done, schema_version)
       values
         ($1::uuid, $3, 'visible_name', 'text', 'string', true, 1),
         ($2::uuid, $3, 'hidden_name', 'text', 'string', true, 1)`,
      [orgA, orgB, dept],
    );

    const client = await app.connect();
    try {
      await client.query('begin');
      await setOrgContext(client, owner, orgA);

      const rows = await client.query<{ column_key: string }>(
        `select column_key
         from "Reference"."DeptColumns"
         where dept_code = $1
         order by column_key`,
        [dept],
      );

      expect(rows.rows).toEqual([{ column_key: 'visible_name' }]);
      await expect(
        client.query(
          `insert into "Reference"."DeptColumns"
             (org_id, dept_code, column_key, data_type, field_type, required_for_done, schema_version)
           values ($1::uuid, $2, 'bad_cross_org', 'text', 'string', true, 1)`,
          [orgB, dept],
        ),
      ).rejects.toMatchObject({ code: '42501' });

      await client.query('rollback');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});
