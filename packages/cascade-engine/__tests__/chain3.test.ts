import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../../db/test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext } from './owner-org-context.js';

import {
  deriveIngredientCodes,
  handleRecipeComponentsChanged,
  parseRecipeComponents,
} from '../src/chain3-recipe.js';

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '01200000-0000-4000-8000-000000000012';
const orgA = '01200000-1111-4000-8111-000000000012';
const orgB = '01200000-2222-4000-8222-000000000012';
const orgAUser = '01200000-aaaa-4000-8aaa-000000000012';
const orgBUser = '01200000-bbbb-4000-8bbb-000000000012';
const orgARole = '01200000-0a11-4000-8a11-000000000012';
const orgBRole = '01200000-0b22-4000-8b22-000000000012';

describe('chain3 recipe parsing', () => {
  it('splits comma-separated recipe components, trims whitespace, and derives RM ingredient codes', () => {
    expect(parseRecipeComponents(' PR123H,PR456A,  , PR789Z ')).toEqual([
      'PR123H',
      'PR456A',
      'PR789Z',
    ]);
    expect(deriveIngredientCodes(['PR123H', 'PR456A'])).toBe('RM123, RM456');
  });
});

runIntegration('chain3 recipe component sync', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it("syncs 'PR123H' to 'PR123H, PR456A', updates ingredient_codes, emits fa.recipe_changed, and proves RLS isolation", async () => {
    const productA = `T012-A-${randomUUID()}`;
    const productB = `T012-B-${randomUUID()}`;
    await seedProducts(ownerPool, productA, productB);

    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await handleRecipeComponentsChanged(client, {
        orgId: orgA,
        productCode: productA,
        previousRecipeComponents: 'PR123H',
        nextRecipeComponents: 'PR123H, PR456A',
        appVersion: 't012-test',
      });

      const synced = await client.query<{
        product_code: string;
        ingredient_codes: string;
        intermediate_code: string;
        component_index: number;
      }>(
        `
          select p.product_code, p.ingredient_codes, pd.intermediate_code, pd.component_index
          from public.product p
          join public.prod_detail pd on pd.product_code = p.product_code
          where p.product_code in ($1, $2)
          order by pd.component_index
        `,
        [productA, productB],
      );

      expect(synced.rows).toEqual([
        {
          product_code: productA,
          ingredient_codes: 'RM123, RM456',
          intermediate_code: 'PR123H',
          component_index: 1,
        },
        {
          product_code: productA,
          ingredient_codes: 'RM123, RM456',
          intermediate_code: 'PR456A',
          component_index: 2,
        },
      ]);

      await client.query('savepoint cross_org_reject');
      await expect(
        client.query(
          `
            insert into public.prod_detail (product_code, org_id, intermediate_code, component_index)
            values ($1, $2::uuid, 'PR999X', 99)
          `,
          [productB, orgB],
        ),
      ).rejects.toThrow(/row-level security|violates row-level security|permission denied/i);
      await client.query('rollback to savepoint cross_org_reject');
      await client.query('release savepoint cross_org_reject');
    }, { rollback: false });

    const ownerRows = await ownerPool.query<{
      ingredient_codes: string;
      detail_count: string;
    }>(
      `
        select p.ingredient_codes,
               count(pd.id)::text as detail_count
        from public.product p
        left join public.prod_detail pd on pd.product_code = p.product_code and pd.org_id = p.org_id
        where p.product_code = $1
        group by p.product_code, p.ingredient_codes
      `,
      [productA],
    );
    const events = await ownerPool.query<{ payload: { diff: { added: string[]; removed: string[] } } }>(
      `
        select payload
        from public.outbox_events
        where org_id = $1::uuid
          and event_type = 'fa.recipe_changed'
          and aggregate_id = $2
        order by id
      `,
      [orgA, productA],
    );

    expect(ownerRows.rows[0]).toMatchObject({
      ingredient_codes: 'RM123, RM456',
      detail_count: '2',
    });
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.payload.diff.added).toEqual(['PR456A']);
    expect(events.rows[0]?.payload.diff.removed).toEqual([]);
  });

  it('is idempotent: running the same value twice keeps prod_detail at 2 rows and inserts no new rows', async () => {
    const productA = `T012-IDEMP-${randomUUID()}`;
    const productB = `T012-IDEMP-B-${randomUUID()}`;
    await seedProducts(ownerPool, productA, productB);

    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await handleRecipeComponentsChanged(client, {
        orgId: orgA,
        productCode: productA,
        previousRecipeComponents: '',
        nextRecipeComponents: 'PR123H, PR456A',
        appVersion: 't012-test',
      });
    }, { rollback: false });

    const first = await prodDetailSnapshot(ownerPool, productA);

    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await handleRecipeComponentsChanged(client, {
        orgId: orgA,
        productCode: productA,
        previousRecipeComponents: 'PR123H, PR456A',
        nextRecipeComponents: 'PR123H, PR456A',
        appVersion: 't012-test',
      });
    }, { rollback: false });

    const second = await prodDetailSnapshot(ownerPool, productA);
    expect(second).toEqual(first);
    expect(second).toHaveLength(2);
  });

  it('syncs 10 components with p95 under 500 ms over 1000 runs', async () => {
    const productA = `T012-PERF-${randomUUID()}`;
    const productB = `T012-PERF-B-${randomUUID()}`;
    const nextRecipeComponents = Array.from({ length: 10 }, (_, index) => `PR${100 + index}A`).join(', ');
    await seedProducts(ownerPool, productA, productB);

    const durations: number[] = [];
    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      for (let index = 0; index < 1000; index += 1) {
        const started = performance.now();
        await handleRecipeComponentsChanged(client, {
          orgId: orgA,
          productCode: productA,
          previousRecipeComponents: nextRecipeComponents,
          nextRecipeComponents,
          appVersion: 't012-test',
        });
        durations.push(performance.now() - started);
      }
    }, { rollback: false });

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(500);

    const rows = await prodDetailSnapshot(ownerPool, productA);
    expect(rows).toHaveLength(10);
  });
});

async function seedBaseRows(pool: pg.Pool) {
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, 'T-012 Chain3 Tenant', 'eu', 'https://t012-chain3.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, slug, name, industry_code)
      values ($1::uuid, $2::uuid, 't-012-chain3-a', 'T-012 Chain3 A', 'bakery'),
             ($3::uuid, $2::uuid, 't-012-chain3-b', 'T-012 Chain3 B', 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            slug = excluded.slug,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1::uuid, $2::uuid, 't012_chain3', 'T012 Chain3 Role A', '[]'::jsonb, true),
             ($3::uuid, $4::uuid, 't012_chain3', 'T012 Chain3 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1::uuid, $2::uuid, 't012-chain3-a@example.test', 'T012 Chain3 User A', $3::uuid),
             ($4::uuid, $5::uuid, 't012-chain3-b@example.test', 'T012 Chain3 User B', $6::uuid)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function seedProducts(pool: pg.Pool, productA: string, productB: string) {
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, recipe_components, ingredient_codes, schema_version, created_by_user, app_version)
      values ($1, $2::uuid, 'T012 Chain3 Product A', 'PR123H', 'RM123', 1, $3::uuid, 't012-test')
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, recipe_components, ingredient_codes, schema_version, created_by_user, app_version)
      values ($1, $2::uuid, 'T012 Chain3 Product B', 'PR999B', 'RM999', 1, $3::uuid, 't012-test')
    `,
    [productB, orgB, orgBUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.prod_detail (product_code, org_id, intermediate_code, component_index)
      values ($1, $2::uuid, 'PR123H', 1)
    `,
    [productA, orgA],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.prod_detail (product_code, org_id, intermediate_code, component_index)
      values ($1, $2::uuid, 'PR999B', 1)
    `,
    [productB, orgB],
  );
}

async function prodDetailSnapshot(pool: pg.Pool, productCode: string) {
  const result = await pool.query<{ id: string; intermediate_code: string; component_index: number }>(
    `
      select id, intermediate_code, component_index
      from public.prod_detail
      where product_code = $1
      order by component_index, intermediate_code
    `,
    [productCode],
  );
  return result.rows;
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
  options: { rollback?: boolean } = {},
) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1::uuid, $2::uuid)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await callback(client);
    if (options.rollback === false) {
      await client.query('commit');
    } else {
      await client.query('rollback');
    }
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
