import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';
import { handleTemplateChange, TemplateNotFoundError } from '../src/chain4-template.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const tenantId = '01300000-0000-4000-8000-000000000001';
const orgA = '01300000-0000-4000-8000-00000000000a';
const orgB = '01300000-0000-4000-8000-00000000000b';
const userA = '01300000-0000-4000-8000-0000000000aa';
const userB = '01300000-0000-4000-8000-0000000000bb';
const roleA = '01300000-0000-4000-8000-0000000000a1';
const roleB = '01300000-0000-4000-8000-0000000000b1';
const productA = 'T013-FG-A';
const productUnrelated = 'T013-FG-B';

type DetailState = {
  product_code: string;
  component_index: number;
  manufacturing_operation_1: string | null;
  manufacturing_operation_2: string | null;
  manufacturing_operation_3: string | null;
  manufacturing_operation_4: string | null;
  intermediate_code_p1: string | null;
  intermediate_code_p2: string | null;
  intermediate_code_p3: string | null;
  intermediate_code_p4: string | null;
  intermediate_code_final: string | null;
};

async function ensureAppUser(pool: pg.Pool) {
  await pool.query(
    `
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'app_user') then
          create role app_user login password '${appUserPassword}';
        else
          alter role app_user login password '${appUserPassword}';
        end if;
      end
      $$;
    `,
  );
}

async function seedContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function seedBase(ownerPool: pg.Pool) {
  await ensureAppUser(ownerPool);
  await ownerPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-013 tenant', 'eu', 'https://t013.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await ownerPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-013 Org A', 'bakery'),
            ($3, $2, 'T-013 Org B', 'bakery')
     on conflict (id) do update set tenant_id = excluded.tenant_id, industry_code = excluded.industry_code`,
    [orgA, tenantId, orgB],
  );
  await ownerPool.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
     values ($1, $2, 't013_user', true, 't013_user', 'T013 User A', '[]'::jsonb, true),
            ($3, $4, 't013_user', true, 't013_user', 'T013 User B', '[]'::jsonb, true)
     on conflict (org_id, slug) do update
       set code = excluded.code,
           name = excluded.name,
           permissions = excluded.permissions,
           is_system = excluded.is_system`,
    [roleA, orgA, roleB, orgB],
  );
  await ownerPool.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id, language, is_active)
     values ($1, $2, 't013-a@example.test', 'T013 A', 'T013 A', $3, 'en', true),
            ($4, $5, 't013-b@example.test', 'T013 B', 'T013 B', $6, 'en', true)
     on conflict (id) do update
       set org_id = excluded.org_id,
           email = excluded.email,
           display_name = excluded.display_name,
           name = excluded.name,
           role_id = excluded.role_id`,
    [userA, orgA, roleA, userB, orgB, roleB],
  );
  await ownerPool.query(
    `insert into public.product (product_code, org_id, product_name, created_by_user, recipe_components)
     values ($1, $2, 'T013 product A', $3, 'WIP-MX-KN-PR-BK'),
            ($4, $2, 'T013 unrelated FA', $3, 'WIP-MX-KN-PR-BK')
     on conflict (product_code) do update
       set org_id = excluded.org_id,
           created_by_user = excluded.created_by_user,
           recipe_components = excluded.recipe_components`,
    [productA, orgA, userA, productUnrelated],
  );
  await ownerPool.query(
    `insert into "Reference"."ManufacturingOperations"
       (org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active)
     values
       ($1, 'Mix', 'MX', 'Mixing', 1, 'bakery', true),
       ($1, 'Knead', 'KN', 'Kneading', 2, 'bakery', true),
       ($1, 'Proof', 'PR', 'Proofing', 3, 'bakery', true),
       ($1, 'Bake', 'BK', 'Baking', 4, 'bakery', true),
       ($2, 'Mix', 'ZZ', 'Wrong org mix', 1, 'bakery', true)
     on conflict (org_id, operation_name) do update
       set process_suffix = excluded.process_suffix,
           operation_seq = excluded.operation_seq,
           is_active = excluded.is_active`,
    [orgA, orgB],
  );
  await ownerPool.query(
    `insert into "Reference"."Templates"
       (org_id, template_name, operation_1_name, operation_2_name, operation_3_name, operation_4_name)
     values ($1, 'BakeryStandard', 'Mix', 'Knead', 'Proof', 'Bake'),
            ($2, 'BakeryStandard', 'Mix', 'Mix', 'Mix', 'Mix')
     on conflict (org_id, template_name) do update
       set operation_1_name = excluded.operation_1_name,
           operation_2_name = excluded.operation_2_name,
           operation_3_name = excluded.operation_3_name,
           operation_4_name = excluded.operation_4_name`,
    [orgA, orgB],
  );
}

async function resetDetails(ownerPool: pg.Pool) {
  await ownerPool.query(`delete from public.outbox_events where org_id in ($1, $2)`, [orgA, orgB]);
  await ownerPool.query(`delete from public.prod_detail where product_code in ($1, $2)`, [
    productA,
    productUnrelated,
  ]);
  await ownerPool.query(
    `insert into public.prod_detail
       (org_id, product_code, intermediate_code, component_index,
        manufacturing_operation_1, manufacturing_operation_2, manufacturing_operation_3, manufacturing_operation_4,
        intermediate_code_p1, intermediate_code_p2, intermediate_code_p3, intermediate_code_p4, intermediate_code_final)
     values
       ($1, $2, 'BASE-A1', 1, 'Old1', 'Old2', 'Old3', 'Old4', 'old-p1', 'old-p2', 'old-p3', 'old-p4', 'old-final'),
       ($1, $2, 'BASE-A2', 2, 'Old1', 'Old2', 'Old3', 'Old4', 'old-p1', 'old-p2', 'old-p3', 'old-p4', 'old-final'),
       ($1, $2, 'BASE-A3', 3, 'Old1', 'Old2', 'Old3', 'Old4', 'old-p1', 'old-p2', 'old-p3', 'old-p4', 'old-final'),
       ($1, $3, 'BASE-B1', 1, 'Keep1', 'Keep2', 'Keep3', 'Keep4', 'keep-p1', 'keep-p2', 'keep-p3', 'keep-p4', 'keep-final')`,
    [orgA, productA, productUnrelated],
  );
}

async function selectDetails(ownerPool: pg.Pool, productCode: string): Promise<DetailState[]> {
  const result = await ownerPool.query<DetailState>(
    `select product_code,
            component_index,
            manufacturing_operation_1,
            manufacturing_operation_2,
            manufacturing_operation_3,
            manufacturing_operation_4,
            intermediate_code_p1,
            intermediate_code_p2,
            intermediate_code_p3,
            intermediate_code_p4,
            intermediate_code_final
       from public.prod_detail
      where product_code = $1
      order by component_index`,
    [productCode],
  );
  return result.rows;
}

run('T-013 chain4 template apply cascade', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let sessionToken: string;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBase(ownerPool);
  });

  beforeEach(async () => {
    sessionToken = randomUUID();
    await seedContext(ownerPool, sessionToken, orgA);
    await resetDetails(ownerPool);
  });

  afterAll(async () => {
    await ownerPool?.query(`delete from public.prod_detail where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from "Reference"."Templates" where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from "Reference"."ManufacturingOperations" where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.product where product_code in ($1, $2)`, [productA, productUnrelated]).catch(() => undefined);
    await ownerPool?.query(`delete from public.users where id in ($1, $2)`, [userA, userB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.roles where id in ($1, $2)`, [roleA, roleB]).catch(() => undefined);
    await ownerPool?.end();
    await appPool?.end();
  });

  it('applies BakeryStandard operations to all current prod_detail rows for the FA only', async () => {
    const result = await handleTemplateChange(productA, 'BakeryStandard', {
      pool: appPool,
      sessionToken,
      orgId: orgA,
    });

    expect(result).toMatchObject({
      productCode: productA,
      templateName: 'BakeryStandard',
      affectedCount: 3,
    });

    const rows = await selectDetails(ownerPool, productA);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        manufacturing_operation_1: 'Mix',
        manufacturing_operation_2: 'Knead',
        manufacturing_operation_3: 'Proof',
        manufacturing_operation_4: 'Bake',
      });
    }

    const unrelatedRows = await selectDetails(ownerPool, productUnrelated);
    expect(unrelatedRows).toHaveLength(1);
    expect(unrelatedRows[0]).toMatchObject({
      manufacturing_operation_1: 'Keep1',
      manufacturing_operation_2: 'Keep2',
      manufacturing_operation_3: 'Keep3',
      manufacturing_operation_4: 'Keep4',
      intermediate_code_final: 'keep-final',
    });
  });

  it('invokes chain2 recompute for p1 through p4 and intermediate_code_final on every row', async () => {
    await handleTemplateChange(productA, 'BakeryStandard', {
      pool: appPool,
      sessionToken,
      orgId: orgA,
    });

    const rows = await selectDetails(ownerPool, productA);
    for (const row of rows) {
      expect(row.intermediate_code_p1).toMatch(/^WIP-MX-\d{7}$/);
      expect(row.intermediate_code_p2).toMatch(/^WIP-KN-\d{7}$/);
      expect(row.intermediate_code_p3).toMatch(/^WIP-PR-\d{7}$/);
      expect(row.intermediate_code_p4).toMatch(/^WIP-BK-\d{7}$/);
      expect(row.intermediate_code_final).toMatch(/^WIP-MX-KN-PR-BK-\d{7}$/);
    }
  });

  it('emits fa.template_applied with the affected row count', async () => {
    await handleTemplateChange(productA, 'BakeryStandard', {
      pool: appPool,
      sessionToken,
      orgId: orgA,
    });

    const event = await ownerPool.query<{ event_type: string; payload: { affected_count: number; template_name: string } }>(
      `select event_type, payload
         from public.outbox_events
        where org_id = $1
          and aggregate_type = 'fa'
          and aggregate_id = $2
          and event_type = 'fa.template_applied'`,
      [orgA, productA],
    );

    expect(event.rows).toHaveLength(1);
    expect(event.rows[0]).toMatchObject({
      event_type: 'fa.template_applied',
      payload: {
        affected_count: 3,
        template_name: 'BakeryStandard',
      },
    });
  });

  it('throws TemplateNotFoundError without mutating prod_detail rows when the template does not exist', async () => {
    const before = await selectDetails(ownerPool, productA);

    await expect(
      handleTemplateChange(productA, 'MissingTemplate', {
        pool: appPool,
        sessionToken,
        orgId: orgA,
      }),
    ).rejects.toBeInstanceOf(TemplateNotFoundError);

    await expect(selectDetails(ownerPool, productA)).resolves.toEqual(before);
  });
});
