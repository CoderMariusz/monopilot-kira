import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleOperationChange } from '../src/chain2-operations.js';
import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';
import { ownerQueryWithInferredOrgContext, ownerQueryWithOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const tenantId = '01100000-0000-4000-8000-000000000001';
const orgA = '01100000-0000-4000-8000-00000000000a';
const orgB = '01100000-0000-4000-8000-00000000000b';
const userA = '01100000-0000-4000-8000-0000000000aa';
const userB = '01100000-0000-4000-8000-0000000000bb';
const roleA = '01100000-0000-4000-8000-0000000000a1';
const roleB = '01100000-0000-4000-8000-0000000000b1';
const productA = 'T011-FG-A';
const productB = 'T011-FG-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

run('T-011 chain2 manufacturing operation cascade', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let sessionToken: string;
  let prodDetailId: string;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    sessionToken = randomUUID();

    await ensureAppUser(ownerPool);
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-011 tenant', 'eu', 'https://t011.example.test')
       on conflict (id) do update set name = excluded.name`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T-011 Org A', 'bakery'),
              ($3, $2, 'T-011 Org B', 'bakery')
       on conflict (id) do update set tenant_id = excluded.tenant_id, industry_code = excluded.industry_code`,
      [orgA, tenantId, orgB],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
       values ($1, $2, 't011_user', true, 't011_user', 'T011 User A', '[]'::jsonb, true),
              ($3, $4, 't011_user', true, 't011_user', 'T011 User B', '[]'::jsonb, true)
       on conflict (org_id, slug) do update
         set code = excluded.code,
             name = excluded.name,
             permissions = excluded.permissions,
             is_system = excluded.is_system`,
      [roleA, orgA, roleB, orgB],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id, language, is_active)
       values ($1, $2, 't011-a@example.test', 'T011 A', 'T011 A', $3, 'en', true),
              ($4, $5, 't011-b@example.test', 'T011 B', 'T011 B', $6, 'en', true)
       on conflict (id) do update
         set org_id = excluded.org_id,
             email = excluded.email,
             display_name = excluded.display_name,
             name = excluded.name,
             role_id = excluded.role_id`,
      [userA, orgA, roleA, userB, orgB, roleB],
    );
    // One wrapped statement per org: the org-context trigger validates each
    // row against app.current_org_id(), so a statement cannot span orgs.
    await ownerQueryWithInferredOrgContext(ownerPool,
      `insert into public.product (product_code, org_id, product_name, created_by_user, recipe_components)
       values ($1, $2, 'T011 product A', $3, 'Component A')
       on conflict (org_id, product_code) do update
         set org_id = excluded.org_id,
             created_by_user = excluded.created_by_user,
             recipe_components = excluded.recipe_components`,
      [productA, orgA, userA],
    );
    await ownerQueryWithInferredOrgContext(ownerPool,
      `insert into public.product (product_code, org_id, product_name, created_by_user, recipe_components)
       values ($1, $2, 'T011 product B', $3, 'Component B')
       on conflict (org_id, product_code) do update
         set org_id = excluded.org_id,
             created_by_user = excluded.created_by_user,
             recipe_components = excluded.recipe_components`,
      [productB, orgB, userB],
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
    await seedContext(ownerPool, sessionToken, orgA);

    const detail = await ownerQueryWithInferredOrgContext<{ id: string }>(ownerPool,
      `insert into public.prod_detail
         (org_id, product_code, intermediate_code, component_index, manufacturing_operation_1)
       values ($1, $2, 'BASE', 1, 'Mix')
       returning id::text`,
      [orgA, productA],
    );
    prodDetailId = detail.rows[0]!.id;
  });

  afterAll(async () => {
    await ownerQueryWithOrgContext(ownerPool, orgA, `delete from public.prod_detail where org_id = $1`, [orgA]).catch(() => undefined);
    await ownerQueryWithOrgContext(ownerPool, orgB, `delete from public.prod_detail where org_id = $1`, [orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from "Reference"."ManufacturingOperations" where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.product where product_code in ($1, $2)`, [productA, productB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.users where id in ($1, $2)`, [userA, userB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.roles where id in ($1, $2)`, [roleA, roleB]).catch(() => undefined);
    await ownerPool?.end();
    await appPool?.end();
  });

  it('auto-fills intermediate_code_p1 from Reference.ManufacturingOperations suffix', async () => {
    const result = await handleOperationChange(prodDetailId, 1, 'Mix', {
      pool: appPool,
      sessionToken,
      orgId: orgA,
    });

    expect(result.intermediateCodeP).toMatch(/^WIP-MX-\d{7}$/);

    const persisted = await ownerPool.query<{ intermediate_code_p1: string | null }>(
      `select intermediate_code_p1 from public.prod_detail where id = $1`,
      [prodDetailId],
    );
    expect(persisted.rows[0]?.intermediate_code_p1).toBe(result.intermediateCodeP);
  });

  it('recomputes intermediate_code_final from p1 through p4 in Phase D style', async () => {
    // Explicit org context: the only uuid param is the prod_detail id, which
    // the inference helper would mistake for an org id.
    await ownerQueryWithOrgContext(ownerPool, orgA,
      `update public.prod_detail
          set intermediate_code_p1 = 'WIP-MX-0000001',
              intermediate_code_p2 = 'WIP-KN-0000002',
              intermediate_code_p3 = 'WIP-PR-0000003',
              manufacturing_operation_4 = 'Bake'
        where id = $1`,
      [prodDetailId],
    );

    const result = await handleOperationChange(prodDetailId, 4, 'Bake', {
      pool: appPool,
      sessionToken,
      orgId: orgA,
    });

    expect(result.intermediateCodeFinal).toMatch(/^WIP-MX-KN-PR-BK-\d{7}$/);

    const persisted = await ownerPool.query<{ intermediate_code_final: string | null }>(
      `select intermediate_code_final from public.prod_detail where id = $1`,
      [prodDetailId],
    );
    expect(persisted.rows[0]?.intermediate_code_final).toBe(result.intermediateCodeFinal);
  });

  it('uses RLS org context for lookup and update', async () => {
    await expect(
      handleOperationChange(prodDetailId, 1, 'Mix', {
        pool: appPool,
        sessionToken,
        orgId: orgB,
      }),
    ).rejects.toThrow(
      /invalid organization context|prod_detail_not_found|operation_not_found|violates row-level security/i,
    );

    const persisted = await ownerPool.query<{ intermediate_code_p1: string | null }>(
      `select intermediate_code_p1 from public.prod_detail where id = $1`,
      [prodDetailId],
    );
    expect(persisted.rows[0]?.intermediate_code_p1).not.toMatch(/^WIP-ZZ-/);
  });
});
