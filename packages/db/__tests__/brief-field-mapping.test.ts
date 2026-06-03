import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedBriefFieldMappingApex } from '../seeds/brief-field-mapping-apex.js';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const apexTenantId = '00000000-0000-0000-0000-000000000102';
const apexOrgId = '00000000-0000-0000-0000-000000000002';
const otherTenantId = '00320000-0000-4000-8000-0000000000bb';
const otherOrgId = '00320000-0000-4000-8000-00000000000b';

const expectedBriefCols = Array.from({ length: 20 }, (_, index) => `C${index + 1}`);

async function bootstrapOrg(ownerPool: pg.Pool, tenantId: string, orgId: string, name: string) {
  await ownerPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, $2, 'eu', 'local')
      on conflict (id) do update set name = excluded.name
    `,
    [tenantId, `${name} Tenant`],
  );

  await ownerPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1::uuid, $2::uuid, $3, 'bakery')
      on conflict (id) do update set name = excluded.name
    `,
    [orgId, tenantId, name],
  );
}

async function setOrgContext(client: pg.PoolClient, ownerPool: pg.Pool, orgId: string) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1::uuid, $2::uuid)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
}

runIntegrationTest('Reference.BriefFieldMapping Apex seed', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await bootstrapOrg(ownerPool, apexTenantId, apexOrgId, 'T-032 Apex Org');
    await bootstrapOrg(ownerPool, otherTenantId, otherOrgId, 'T-032 Other Org');
    await seedBriefFieldMappingApex(process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it("seeds C1 as fa.product_name with a 1:1 transform", async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await setOrgContext(client, ownerPool, apexOrgId);
      const rows = await client.query<{ fa_target: string; transform: string }>(
        `
          select fa_target, transform
          from "Reference"."BriefFieldMapping"
          where brief_col = 'C1'
        `,
      );
      await client.query('rollback');

      expect(rows.rows).toEqual([{ fa_target: 'fa.product_name', transform: '1:1' }]);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('is idempotent when the Apex seed is run twice', async () => {
    const before = await ownerPool.query<{ row_count: string; digest: string }>(
      `
        select
          count(*)::text as row_count,
          md5(string_agg(brief_col || ':' || fa_target || ':' || transform || ':' || marker, '|' order by brief_col)) as digest
        from "Reference"."BriefFieldMapping"
        where org_id = $1::uuid
      `,
      [apexOrgId],
    );

    await seedBriefFieldMappingApex(process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL!);

    const after = await ownerPool.query<{ row_count: string; digest: string }>(
      `
        select
          count(*)::text as row_count,
          md5(string_agg(brief_col || ':' || fa_target || ':' || transform || ':' || marker, '|' order by brief_col)) as digest
        from "Reference"."BriefFieldMapping"
        where org_id = $1::uuid
      `,
      [apexOrgId],
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(after.rows[0]?.row_count).toBe('20');
  });

  it('omits C21-C37 and seeds exactly the explicit C1-C20 mapping set', async () => {
    const rows = await ownerPool.query<{ brief_col: string }>(
      `
        select brief_col
        from "Reference"."BriefFieldMapping"
        where org_id = $1::uuid
        order by substring(brief_col from 2)::integer
      `,
      [apexOrgId],
    );

    expect(rows.rows.map((row) => row.brief_col)).toEqual(expectedBriefCols);
    expect(rows.rows).toHaveLength(20);
  });

  it('enforces forced org RLS with invisible cross-org rows and rejected cross-org inserts', async () => {
    await ownerPool.query(
      `
        insert into "Reference"."BriefFieldMapping" (
          org_id,
          brief_col,
          fa_target,
          transform,
          marker,
          schema_version
        )
        values ($1::uuid, 'C1', 'fa.other_product_name', '1:1', 'UNIVERSAL', 1)
        on conflict (org_id, brief_col) do update set
          fa_target = excluded.fa_target,
          transform = excluded.transform,
          marker = excluded.marker
      `,
      [otherOrgId],
    );

    const metadata = await ownerPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policy_expr: string;
    }>(
      `
        select
          c.relrowsecurity,
          c.relforcerowsecurity,
          string_agg(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''), ' ') as policy_expr
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
        where n.nspname = 'Reference'
          and c.relname = 'BriefFieldMapping'
        group by c.relrowsecurity, c.relforcerowsecurity
      `,
    );
    expect(metadata.rows[0]?.relrowsecurity).toBe(true);
    expect(metadata.rows[0]?.relforcerowsecurity).toBe(true);
    expect(metadata.rows[0]?.policy_expr).toContain('app.current_org_id()');

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await setOrgContext(client, ownerPool, apexOrgId);

      const visibleRows = await client.query<{ org_id: string; fa_target: string }>(
        `
          select org_id::text, fa_target
          from "Reference"."BriefFieldMapping"
          where brief_col = 'C1'
          order by org_id
        `,
      );
      expect(visibleRows.rows).toEqual([{ org_id: apexOrgId, fa_target: 'fa.product_name' }]);

      await expect(
        client.query(
          `
            insert into "Reference"."BriefFieldMapping" (
              org_id,
              brief_col,
              fa_target,
              transform,
              marker
            )
            values ($1::uuid, 'C2', 'fa.cross_org_volume', '1:1', 'EVOLVING')
          `,
          [otherOrgId],
        ),
      ).rejects.toThrow(/row-level security policy|violates row-level security/i);

      await client.query('rollback');
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
