/**
 * Migration 142 — product per-org primary key.
 *
 * Proves the multi-tenant fix: public.product PK moves from the GLOBAL
 * (product_code) to the PER-ORG (org_id, product_code). All 14 FKs that
 * reference product become composite (org_id, code_col) -> (org_id, product_code).
 *
 * RED (pre-142): two different orgs CANNOT both hold product_code 'FA-DUP-001'
 * because the global PK forbids it.
 * GREEN (post-142): they can; a per-org composite child FK (prod_detail) binds
 * to the correct org's row, and a cross-org child insert is rejected.
 *
 * Owner connection is used throughout: PK uniqueness and FK enforcement are
 * catalog-level constraints independent of RLS, and using the owner keeps the
 * proof focused on the constraint change itself.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const tenantId = '88888888-8888-4888-8888-888888888888';
const orgA = '88888888-1111-4888-8111-888888888888';
const orgB = '88888888-2222-4888-8222-888888888888';
const orgAUser = '88888888-aaaa-4888-8aaa-888888888888';
const orgBUser = '88888888-bbbb-4888-8bbb-888888888888';
const orgARole = '88888888-a111-4888-8111-888888888888';
const orgBRole = '88888888-b222-4888-8222-888888888888';

const DUP_CODE = 'FA-DUP-001';

async function ensureAppUser(adminPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function seedBaseOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Per-Org PK Tenant', 'eu', 'https://per-org-pk.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await adminPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'Per-Org PK Org A', 'bakery'),
             ($3, $2, 'Per-Org PK Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await adminPool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'legacy_user', 'Per-Org PK Role A', '[]'::jsonb, true),
             ($3, $4, 'legacy_user', 'Per-Org PK Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'per-org-pk-a@example.test', 'Per-Org PK User A', $3),
             ($4, $5, 'per-org-pk-b@example.test', 'Per-Org PK User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await ownerQueryWithInferredOrgContext(adminPool,`delete from public.prod_detail where product_code = $1`, [DUP_CODE]);
  await adminPool.query(`delete from public.product where product_code = $1`, [DUP_CODE]);
}

async function insertProduct(adminPool: pg.Pool, orgId: string, userId: string) {
  return ownerQueryWithInferredOrgContext(adminPool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Dup Code Product', 1, $3)
    `,
    [DUP_CODE, orgId, userId],
  );
}

runIntegrationTest('142 product per-org primary key', () => {
  let adminPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    await seedBaseOrgData(adminPool);
    await cleanupRows(adminPool);
  });

  afterAll(async () => {
    await cleanupRows(adminPool);
    await adminPool?.end();
  });

  it('has a composite primary key (org_id, product_code) on public.product', async () => {
    const pk = await adminPool.query<{ def: string }>(
      `
        select pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.product'::regclass and contype = 'p'
      `,
    );
    expect(pk.rows).toHaveLength(1);
    expect(pk.rows[0]?.def).toBe('PRIMARY KEY (org_id, product_code)');
  });

  it('lets two different orgs both hold the same product_code', async () => {
    await insertProduct(adminPool, orgA, orgAUser);
    // Pre-142 this throws duplicate key on the global PK; post-142 it succeeds.
    await expect(insertProduct(adminPool, orgB, orgBUser)).resolves.toBeDefined();

    const rows = await adminPool.query<{ org_id: string }>(
      `select org_id from public.product where product_code = $1 order by org_id`,
      [DUP_CODE],
    );
    expect(rows.rows.map((r) => r.org_id).sort()).toEqual([orgA, orgB].sort());
  });

  it('binds a composite child FK (prod_detail) to the correct per-org product row', async () => {
    // Both org rows already exist from the previous test.
    await ownerQueryWithInferredOrgContext(adminPool,
      `
        insert into public.prod_detail
          (product_code, org_id, intermediate_code, component_index)
        values ($1, $2, 'INT-A', 1)
      `,
      [DUP_CODE, orgA],
    );
    const child = await adminPool.query<{ org_id: string }>(
      `select org_id from public.prod_detail where product_code = $1`,
      [DUP_CODE],
    );
    expect(child.rows).toHaveLength(1);
    expect(child.rows[0]?.org_id).toBe(orgA);
  });

  it('rejects a cross-org child FK insert (org without a matching product row)', async () => {
    // orgB has the product row, but we delete it first so the (orgB, code) target
    // is absent, then attempt a prod_detail insert pointing at (orgB, code).
    await ownerQueryWithInferredOrgContext(adminPool,`delete from public.prod_detail where product_code = $1 and org_id = $2`, [DUP_CODE, orgB]);
    await adminPool.query(`delete from public.product where product_code = $1 and org_id = $2`, [DUP_CODE, orgB]);

    await expect(
      ownerQueryWithInferredOrgContext(adminPool,
        `
          insert into public.prod_detail
            (product_code, org_id, intermediate_code, component_index)
          values ($1, $2, 'INT-B', 1)
        `,
        [DUP_CODE, orgB],
      ),
    ).rejects.toThrow(/foreign key|violates foreign key/i);

    // Re-create orgB product row so afterAll cleanup is symmetric.
    await insertProduct(adminPool, orgB, orgBUser);
  });

  it('converts every product FK to composite (org_id, code) -> (org_id, product_code)', async () => {
    const fks = await adminPool.query<{ conname: string; def: string; child: string }>(
      `
        select con.conname,
               conrel.relname as child,
               pg_get_constraintdef(con.oid) as def
        from pg_constraint con
        join pg_class refrel on refrel.oid = con.confrelid
        join pg_class conrel on conrel.oid = con.conrelid
        where con.contype = 'f' and refrel.relname = 'product'
        order by conrel.relname
      `,
    );
    // Don't hardcode a count: later migrations (e.g. 144 npd_legacy_closeout) may
    // add further product-referencing FKs. The contract is that EVERY FK that
    // references public.product is composite (org_id, <code>) -> (org_id, product_code).
    expect(fks.rows.length).toBeGreaterThanOrEqual(14);
    for (const fk of fks.rows) {
      // The child code column can be product_code, product_id, or a domain-specific
      // alias (e.g. fg_product_code). What matters: it pairs with org_id and targets
      // the composite product PK. Order of the two columns is not guaranteed.
      expect(fk.def, `${fk.conname} not composite`).toMatch(
        /FOREIGN KEY \((org_id, [a-z_]+|[a-z_]+, org_id)\) REFERENCES product\(org_id, product_code\)/,
      );
    }
  });

  it('keeps formulations FK as ON DELETE NO ACTION (org_id is NOT NULL, so composite SET NULL is unsafe)', async () => {
    const fk = await adminPool.query<{ def: string }>(
      `
        select pg_get_constraintdef(con.oid) as def
        from pg_constraint con
        join pg_class conrel on conrel.oid = con.conrelid
        where con.contype = 'f' and conrel.relname = 'formulations'
          and con.conname = 'formulations_product_code_fkey'
      `,
    );
    expect(fk.rows).toHaveLength(1);
    // No "ON DELETE SET NULL"; default (NO ACTION) means no ON DELETE clause emitted.
    expect(fk.rows[0]?.def).not.toMatch(/ON DELETE SET NULL/);
    expect(fk.rows[0]?.def).not.toMatch(/ON DELETE CASCADE/);
  });
});
