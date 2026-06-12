import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const tenantId = '77777777-0015-4777-8015-777777777777';
const orgA = '77777777-0151-4777-8151-777777777777';
const orgB = '77777777-0152-4777-8152-777777777777';
const orgAUser = '77777777-15aa-4777-85aa-777777777777';
const orgBUser = '77777777-15bb-4777-85bb-777777777777';
const orgARole = '77777777-1511-4777-8511-777777777777';
const orgBRole = '77777777-1522-4777-8522-777777777777';

type FaStatusOverallRow = {
  product_code: string;
  org_id: string;
  done_core: boolean;
  done_planning: boolean;
  done_commercial: boolean;
  done_production: boolean;
  done_technical: boolean;
  done_mrp: boolean;
  done_procurement: boolean;
  status_overall: 'Built' | 'Complete' | 'Alert' | 'InProgress' | 'Pending';
  days_to_launch: number | null;
};

async function seedBaseOrgData(ownerPool: pg.Pool) {
  await ownerPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, 'T-015 Tenant', 'eu', 'local')
      on conflict (id) do update set name = excluded.name
    `,
    [tenantId],
  );
  await ownerPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1::uuid, $2::uuid, 'T-015 Org A', 'bakery'),
             ($3::uuid, $2::uuid, 'T-015 Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await ownerPool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1::uuid, $2::uuid, 'status_overall_user', 'T-015 Role A', '[]'::jsonb, true),
             ($3::uuid, $4::uuid, 'status_overall_user', 'T-015 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await ownerPool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1::uuid, $2::uuid, 'status-overall-a@example.test', 'T-015 User A', $3::uuid),
             ($4::uuid, $5::uuid, 'status-overall-b@example.test', 'T-015 User B', $6::uuid)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function seedTrustedOrgContext(ownerPool: pg.Pool, sessionToken: string, orgId: string) {
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(ownerPool, sessionToken, orgId);

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

async function seedProducts(ownerPool: pg.Pool) {
  await ownerPool.query(
    `
      delete from public.product
      where product_code like 'FA-T015-%'
    `,
  );
  await ownerQueryWithInferredOrgContext(ownerPool,
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, number_of_cases,
        recipe_components, closed_core, primary_ingredient_pct, runs_per_week,
        date_code_per_week, closed_planning, launch_date, department_number,
        article_number, bar_codes, cases_per_week_w1, cases_per_week_w2,
        cases_per_week_w3, closed_commercial, line, yield_line, rate,
        closed_production, shelf_life, closed_technical, box, top_label,
        mrp_box, mrp_labels, mrp_films, tara_weight, pallet_stacking_plan,
        box_dimensions, closed_mrp, price, lead_time, supplier,
        proc_shelf_life, closed_procurement, built, schema_version, created_by_user
      )
      values
        (
          'FA-T015-CORE', $1::uuid, 'Core Done', '200g', 24,
          'PR100A', 'Yes', null, null,
          null, null, current_date + 30, null,
          null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, false, 1, $2::uuid
        ),
        (
          'FA-T015-ALERT', $1::uuid, 'Launch Alert', null, null,
          null, null, null, null,
          null, null, current_date + 5, null,
          null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, false, 1, $2::uuid
        ),
        (
          'FA-T015-COMPLETE', $1::uuid, 'Complete FA', '200g', 24,
          'PR200A', 'Yes', 55, 3,
          'W1', 'Yes', current_date + 30, 'D10',
          'A100', '1234567890123', 10, 11,
          12, 'Yes', 'Line 1', 98, 120,
          'Yes', '45 days', 'Yes', 'BX1', 'Top',
          'MRP-BX1', 'LBL1', 'FILM1', 1.25, 'Plan A',
          '10x20x30', 'Yes', 12.34, 7, 'Supplier A',
          60, 'Yes', false, 1, $2::uuid
        )
    `,
    [orgA, orgAUser],
  );
  // Separate wrapped statement for org B: the org-context trigger validates
  // each row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(ownerPool,
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, number_of_cases,
        recipe_components, closed_core, primary_ingredient_pct, runs_per_week,
        date_code_per_week, closed_planning, launch_date, department_number,
        article_number, bar_codes, cases_per_week_w1, cases_per_week_w2,
        cases_per_week_w3, closed_commercial, line, yield_line, rate,
        closed_production, shelf_life, closed_technical, box, top_label,
        mrp_box, mrp_labels, mrp_films, tara_weight, pallet_stacking_plan,
        box_dimensions, closed_mrp, price, lead_time, supplier,
        proc_shelf_life, closed_procurement, built, schema_version, created_by_user
      )
      values
        (
          'FA-T015-ORGB', $1::uuid, 'Other Org', '150g', 12,
          'PR300A', 'Yes', null, null,
          null, null, current_date + 30, null,
          null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, null, null, null,
          null, null, false, 1, $2::uuid
        )
    `,
    [orgB, orgBUser],
  );
}

runIntegrationTest('097 fa_status_overall computed view', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseOrgData(ownerPool);
    await seedProducts(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('computes done_core when Core required fields are filled and closed_core is Yes', async () => {
    const row = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<Pick<FaStatusOverallRow, 'done_core'>>(
        `
          select done_core
          from public.fa_status_overall
          where product_code = 'FA-T015-CORE'
        `,
      );
      return result.rows[0];
    });

    expect(row).toEqual({ done_core: true });
  });

  it('computes Alert for an unbuilt FA launching in 5 days with missing required data', async () => {
    const row = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<Pick<FaStatusOverallRow, 'status_overall' | 'days_to_launch'>>(
        `
          select status_overall, days_to_launch
          from public.fa_status_overall
          where product_code = 'FA-T015-ALERT'
        `,
      );
      return result.rows[0];
    });

    expect(row).toEqual({ status_overall: 'Alert', days_to_launch: 5 });
  });

  it('computes Complete when all 7 done flags are true and built is false', async () => {
    const row = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<FaStatusOverallRow>(
        `
          select *
          from public.fa_status_overall
          where product_code = 'FA-T015-COMPLETE'
        `,
      );
      return result.rows[0];
    });

    expect(row).toMatchObject({
      done_core: true,
      done_planning: true,
      done_commercial: true,
      done_production: true,
      done_technical: true,
      done_mrp: true,
      done_procurement: true,
      status_overall: 'Complete',
    });
  });

  it('keeps computed status rows isolated by org and rejects cross-org writes through product RLS WITH CHECK', async () => {
    await expect(
      withOrgContext(appPool, ownerPool, orgA, async (client) => {
        const result = await client.query<Pick<FaStatusOverallRow, 'product_code' | 'org_id'>>(
          `
            select product_code, org_id
            from public.fa_status_overall
            where product_code in ('FA-T015-CORE', 'FA-T015-ORGB')
            order by product_code
          `,
        );
        return result.rows;
      }),
    ).resolves.toEqual([{ product_code: 'FA-T015-CORE', org_id: orgA }]);

    await expect(
      withOrgContext(appPool, ownerPool, orgA, async (client) => {
        await client.query(
          `
            insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
            values ('FA-T015-CROSS-ORG', $1::uuid, 'Cross Org Write', 1, $2::uuid)
          `,
          [orgB, orgAUser],
        );
      }),
    ).rejects.toThrow(/row-level security policy|violates row-level security/i);
  });
});
