import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '03600000-0000-4000-8000-000000000001';
const orgId = '03600000-0000-4000-8000-000000000002';

async function seedOrg(adminPool: pg.Pool) {
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-036 Tenant', 'eu', 'https://t-036.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await adminPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code, external_id)
      values ($1, $2, 'T-036 Org', 'bakery', 't-036-allergens')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code,
            external_id = excluded.external_id
    `,
    [orgId, tenantId],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
) {
  const sessionToken = randomUUID();
  await adminPool.query(
    'insert into app.session_org_contexts (session_token, org_id) values ($1, $2) on conflict (session_token) do update set org_id = excluded.org_id',
    [sessionToken, orgId],
  );

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await fn(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

runIntegrationSuite('T-036 allergen reference schemas', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrg(adminPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  it('seeds exactly the EU14 allergens for a new org and exposes them through org RLS', async () => {
    const result = await withOrgContext(appPool, adminPool, (client) =>
      client.query<{ count: string }>(
        'select count(*) from "Reference"."Allergens" where org_id = $1',
        [orgId],
      ),
    );

    expect(Number(result.rows[0]?.count)).toBe(14);
  });

  it('rejects duplicate org + ingredient_codes + allergen_code mappings', async () => {
    await withOrgContext(appPool, adminPool, async (client) => {
      await client.query(
        `
          insert into "Reference"."Allergens_by_RM"
            (org_id, ingredient_codes, allergen_code, confidence, source)
          values ($1, 'RM1939', 'gluten', 'confirmed', 'supplier_spec')
        `,
        [orgId],
      );

      await expect(
        client.query(
          `
            insert into "Reference"."Allergens_by_RM"
              (org_id, ingredient_codes, allergen_code, confidence, source)
            values ($1, 'RM1939', 'gluten', 'confirmed', 'supplier_spec')
          `,
          [orgId],
        ),
      ).rejects.toThrow(/duplicate key value|unique/i);
    });
  });

  it('stores the EU FIC framework and localized display names for gluten', async () => {
    const result = await withOrgContext(appPool, adminPool, (client) =>
      client.query<{
        regulatory_framework: string;
        display_name_pl: string;
      }>(
        `
          select regulatory_framework, display_name_pl
          from "Reference"."Allergens"
          where org_id = $1 and allergen_code = 'gluten'
        `,
        [orgId],
      ),
    );

    expect(result.rows).toEqual([
      {
        regulatory_framework: 'EU_FIC_1169_2011',
        display_name_pl: 'Gluten',
      },
    ]);
  });

  it('enables forced RLS on all three allergen reference tables using app.current_org_id()', async () => {
    const tables = ['Allergens', 'Allergens_by_RM', 'Allergens_added_by_Process'];

    for (const table of tables) {
      const rls = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `
          select relrowsecurity, relforcerowsecurity
          from pg_class
          where oid = to_regclass($1)
        `,
        [`"Reference"."${table}"`],
      );
      expect(rls.rows[0], `${table} RLS`).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });

      const policies = await adminPool.query<{ qual: string | null; with_check: string | null }>(
        `
          select qual, with_check
          from pg_policies
          where schemaname = 'Reference'
            and tablename = $1
            and 'app_user' = any(roles)
        `,
        [table],
      );
      expect(policies.rows.length, `${table} app_user policies`).toBeGreaterThan(0);
      const policyText = policies.rows.map((row) => `${row.qual ?? ''} ${row.with_check ?? ''}`).join('\n');
      expect(policyText).toContain('app.current_org_id()');
      expect(policyText).not.toMatch(/current_setting\('app\.(tenant_id|current_org_id)'/);
    }
  });
});
