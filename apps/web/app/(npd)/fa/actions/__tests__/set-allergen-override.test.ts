import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ownerQueryWithInferredOrgContext, ownerQueryWithOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '03900000-0000-4000-8000-000000000000';
const orgA = '03900000-0000-4000-8000-00000000000a';
const orgB = '03900000-0000-4000-8000-00000000000b';
const orgAUser = '03900000-0000-4000-8000-0000000000aa';
const orgBUser = '03900000-0000-4000-8000-0000000000bb';
const orgARole = '03900000-0000-4000-8000-0000000001aa';
const orgBRole = '03900000-0000-4000-8000-0000000001bb';
const productA = 'FA-T039-A';
const productB = 'FA-T039-B';

let owner: pg.Pool;
let app: pg.Pool;

function appConnectionString(): string {
  const url = new URL(process.env.DATABASE_URL_APP ?? databaseUrl ?? '');
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = appUserPassword;
  }
  return url.toString();
}

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-039 Tenant', 'eu', 'https://t-039.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-039 Org A', 'bakery'),
            ($3, $2, 'T-039 Org B', 'fmcg')
     on conflict (id) do update set name = excluded.name`,
    [orgA, tenantId, orgB],
  );
  await owner.query('select public.seed_allergens_eu14_for_org($1)', [orgA]);
  await owner.query('select public.seed_allergens_eu14_for_org($1)', [orgB]);
  await owner.query('delete from public.user_roles where user_id in ($1, $2) or role_id in ($3, $4)', [
    orgAUser,
    orgBUser,
    orgARole,
    orgBRole,
  ]);
  await owner.query('delete from public.role_permissions where role_id in ($1, $2)', [orgARole, orgBRole]);
  await owner.query(
    `delete from public.role_permissions
      where role_id in (
        select id from public.roles
         where org_id in ($1, $2)
           and slug in ('technical.write', 'viewer')
      )`,
    [orgA, orgB],
  );
  await owner.query('delete from public.users where id in ($1, $2)', [orgAUser, orgBUser]);
  await owner.query(
    `delete from public.roles
      where id in ($1, $2)
         or (org_id in ($3, $4) and slug in ('technical.write', 'viewer'))`,
    [orgARole, orgBRole, orgA, orgB],
  );
  await owner.query(
    `insert into public.roles (id, org_id, code, slug, name, permissions, is_system)
     values ($1, $2, 'technical.write', 'technical.write', 'T-039 Technical', '["technical.write"]'::jsonb, true),
            ($3, $4, 'viewer', 'viewer', 'T-039 Viewer', '[]'::jsonb, true)
     on conflict (org_id, slug) do update
       set id = excluded.id,
           code = excluded.code,
           permissions = excluded.permissions`,
    [orgARole, orgA, orgBRole, orgB],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't039-a@example.test', 'T-039 User A', $3),
            ($4, $5, 't039-b@example.test', 'T-039 User B', $6)
     on conflict (id) do update
       set org_id = excluded.org_id,
           role_id = excluded.role_id`,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $6)
     on conflict (user_id, role_id) do update set org_id = excluded.org_id`,
    [orgAUser, orgARole, orgA, orgBUser, orgBRole, orgB],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'technical.write')
     on conflict do nothing`,
    [orgARole],
  );
  await owner.query('delete from public.outbox_events where aggregate_id in ($1, $2)', [productA, productB]);
  // Explicit org contexts: the params carry no org uuid to infer from, and
  // productA/productB live in different orgs.
  await ownerQueryWithOrgContext(owner, orgA, 'delete from public.fa_allergen_overrides where product_code = $1', [productA]);
  await ownerQueryWithOrgContext(owner, orgB, 'delete from public.fa_allergen_overrides where product_code = $1', [productB]);
  await owner.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(owner,
    `
      insert into public.product (product_code, org_id, product_name, ingredient_codes, created_by_user)
      values ($1, $2, 'T-039 Product A', '', $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `
      insert into public.product (product_code, org_id, product_name, ingredient_codes, created_by_user)
      values ($1, $2, 'T-039 Product B', '', $3)
    `,
    [productB, orgB, orgBUser],
  );
}

async function cleanup(): Promise<void> {
  await owner.query('delete from public.outbox_events where aggregate_id in ($1, $2)', [productA, productB]);
  // Explicit org contexts: the params carry no org uuid to infer from, and
  // productA/productB live in different orgs.
  await ownerQueryWithOrgContext(owner, orgA, 'delete from public.fa_allergen_overrides where product_code = $1', [productA]);
  await ownerQueryWithOrgContext(owner, orgB, 'delete from public.fa_allergen_overrides where product_code = $1', [productB]);
  await owner.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  await owner.query('delete from public.user_roles where user_id in ($1, $2)', [orgAUser, orgBUser]);
  await owner.query('delete from public.role_permissions where role_id in ($1, $2)', [orgARole, orgBRole]);
  await owner.query('delete from public.users where id in ($1, $2)', [orgAUser, orgBUser]);
  await owner.query('delete from public.roles where id in ($1, $2)', [orgARole, orgBRole]);
  await owner.query('delete from public.organizations where id in ($1, $2)', [orgA, orgB]);
  await owner.query('delete from public.tenants where id = $1', [tenantId]);
}

async function trustOrgContext(sessionToken: string, orgId: string): Promise<void> {
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

run('setAllergenOverride Server Action — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for deterministic seed/assert; action-under-test uses withOrgContext app_user/RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- test-only app_user pool for direct RLS isolation assertion
    app = new pg.Pool({ connectionString: appConnectionString() });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = orgAUser;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgA;
    await seed();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await app.end();
    await owner.end();
  });

  it('chains a current remove override to a new add override and refreshes the cascade', async () => {
    const existingId = randomUUID();
    await ownerQueryWithInferredOrgContext(owner,
      `insert into public.fa_allergen_overrides
         (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
       values ($1, $2, $3, 'gluten', 'remove', 'Initial supplier evidence', $4, 'technical.write')`,
      [existingId, orgA, productA, orgAUser],
    );

    const { setAllergenOverride } = await import('../set-allergen-override');
    const result = await setAllergenOverride(
      productA,
      'gluten',
      'add',
      'Corrected supplier declaration',
    );

    expect(result.ok).toBe(true);
    const rows = await owner.query<{
      id: string;
      action: 'add' | 'remove';
      supersedes_id: string | null;
      superseded_at: Date | null;
    }>(
      `select id::text, action, supersedes_id::text, superseded_at
         from public.fa_allergen_overrides
        where org_id = $1 and product_code = $2 and allergen_code = 'gluten'
        order by created_at asc, id asc`,
      [orgA, productA],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ id: existingId, action: 'remove' });
    expect(rows.rows[0]?.superseded_at).toBeInstanceOf(Date);
    expect(rows.rows[1]).toMatchObject({ action: 'add', supersedes_id: existingId, superseded_at: null });

    const product = await owner.query<{ allergens: string[] }>(
      `select allergens from public.product where product_code = $1`,
      [productA],
    );
    expect(product.rows[0]?.allergens).toEqual(['gluten']);
  });

  it('throws ValidationError with REASON_TOO_SHORT for a five-character reason before mutating', async () => {
    const { setAllergenOverride } = await import('../set-allergen-override');
    const { ValidationError } = await import('../errors');

    await expect(setAllergenOverride(productA, 'milk', 'add', 'short')).rejects.toMatchObject({
      code: 'REASON_TOO_SHORT',
    });
    await expect(setAllergenOverride(productA, 'milk', 'add', 'short')).rejects.toBeInstanceOf(ValidationError);

    const rows = await owner.query(
      `select id from public.fa_allergen_overrides where product_code = $1 and allergen_code = 'milk'`,
      [productA],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('proves RLS is non-vacuous: other-org rows are invisible and WITH CHECK rejects cross-org insert', async () => {
    await ownerQueryWithInferredOrgContext(owner,
      `insert into public.fa_allergen_overrides
         (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
       values ($1, $2, 'milk', 'add', 'Other org supplier reason', $3, 'quality.write')`,
      [orgB, productB, orgBUser],
    );

    const sessionToken = randomUUID();
    await trustOrgContext(sessionToken, orgA);
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      const visible = await client.query(
        `select id from public.fa_allergen_overrides where product_code = $1`,
        [productB],
      );
      expect(visible.rowCount).toBe(0);
      await expect(
        client.query(
          `insert into public.fa_allergen_overrides
             (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
           values ($1, $2, 'milk', 'add', 'Cross org supplier reason', $3, 'technical.write')`,
          [orgB, productB, orgAUser],
        ),
      ).rejects.toThrow(/row-level security|violates row-level security policy/i);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
