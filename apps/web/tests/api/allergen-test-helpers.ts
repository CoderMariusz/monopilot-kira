/**
 * Shared seed/cleanup helpers for the 03-technical allergen API integration
 * tests (T-017 / T-018 / T-019 / T-024).
 *
 * Drives the real services through withOrgContext (app_user RLS) via the
 * env-stub fallback (NEXT_SERVER_ACTION_*). Owner SQL is used only for seed,
 * cleanup and persisted-row assertions. Each run uses fresh random org_ids so
 * tests are isolated without a dedicated database.
 *
 * The org-insert trigger auto-seeds "Reference"."Allergens" (14 EU codes:
 * gluten, milk, eggs, …) and "Reference"."ManufacturingOperations"
 * (Mix, Fill, Seal, Label) for each new org — the tests rely on those.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const databaseUrl = process.env.DATABASE_URL;
export const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

export function makeAppUserConnectionString(): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests');
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

export const ALLERGEN_EDIT_PERMS = ['technical.allergens.edit'];

export type AllergenSeed = {
  tenantId: string;
  orgAId: string;
  orgBId: string;
  adminAUserId: string;
  viewerAUserId: string;
  adminBUserId: string;
  adminRoleAId: string;
  viewerRoleAId: string;
  adminRoleBId: string;
  lineAId: string;
};

export function makeSeed(): AllergenSeed {
  return {
    tenantId: randomUUID(),
    orgAId: randomUUID(),
    orgBId: randomUUID(),
    adminAUserId: randomUUID(),
    viewerAUserId: randomUUID(),
    adminBUserId: randomUUID(),
    adminRoleAId: randomUUID(),
    viewerRoleAId: randomUUID(),
    adminRoleBId: randomUUID(),
    lineAId: randomUUID(),
  };
}

export async function ensureAppUser(owner: pg.Pool): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('allergen-api:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

export async function seedFixtures(owner: pg.Pool, seed: AllergenSeed): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Allergen IT Tenant', 'eu', 'https://allergen-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Allergen IT Org A', 'fmcg'), ($4, $2, $5, 'Allergen IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `allergen-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `allergen-b-${seed.orgBId.slice(0, 8)}`],
  );

  const permsJson = JSON.stringify(ALLERGEN_EDIT_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'tech-allergen-admin-it', false, 'tech-allergen-admin-it', 'Tech Allergen Admin IT', $3::jsonb, false, 30),
       ($4, $5, 'tech-allergen-viewer-it', false, 'tech-allergen-viewer-it', 'Tech Allergen Viewer IT', '[]'::jsonb, false, 31),
       ($6, $7, 'tech-allergen-admin-it', false, 'tech-allergen-admin-it', 'Tech Allergen Admin IT B', $3::jsonb, false, 30)
     on conflict (id) do nothing`,
    [seed.adminRoleAId, seed.orgAId, permsJson, seed.viewerRoleAId, seed.orgAId, seed.adminRoleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleAId, seed.adminRoleBId, ALLERGEN_EDIT_PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Allergen Admin A', 'Allergen Admin A', $4),
       ($5, $2, $6, 'Allergen Viewer A', 'Allergen Viewer A', $7),
       ($8, $9, $10, 'Allergen Admin B', 'Allergen Admin B', $11)
     on conflict (id) do nothing`,
    [
      seed.adminAUserId,
      seed.orgAId,
      `allergen-admin-a-${seed.adminAUserId}@example.test`,
      seed.adminRoleAId,
      seed.viewerAUserId,
      `allergen-viewer-a-${seed.viewerAUserId}@example.test`,
      seed.viewerRoleAId,
      seed.adminBUserId,
      seed.orgBId,
      `allergen-admin-b-${seed.adminBUserId}@example.test`,
      seed.adminRoleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.adminAUserId,
      seed.adminRoleAId,
      seed.orgAId,
      seed.viewerAUserId,
      seed.viewerRoleAId,
      seed.adminBUserId,
      seed.adminRoleBId,
      seed.orgBId,
    ],
  );

  // A production line in Org A for contamination-risk tests.
  await owner.query(
    `insert into public.production_lines (id, org_id, code, name, status)
     values ($1, $2, $3, 'Allergen IT Line 1', 'active')
     on conflict (id) do nothing`,
    [seed.lineAId, seed.orgAId, `LINE-${seed.lineAId.slice(0, 6)}`],
  );
}

export async function createItem(
  owner: pg.Pool,
  orgId: string,
  itemCode: string,
  itemType: 'rm' | 'intermediate' | 'fg',
): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `insert into public.items (org_id, item_code, item_type, name, status, uom_base, weight_mode)
     values ($1, $2, $3, $2, 'active', 'kg', 'fixed')
     returning id`,
    [orgId, itemCode, itemType],
  );
  return rows[0]!.id;
}

export async function cleanup(owner: pg.Pool, seed: AllergenSeed): Promise<void> {
  const orgs = [seed.orgAId, seed.orgBId];
  await owner.query(`delete from public.item_allergen_profile_overrides where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.item_allergen_profiles where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.manufacturing_operation_allergen_additions where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.allergen_contamination_risk where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.bom_lines where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.bom_headers where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.product where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.rule_definitions where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.items where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.audit_log where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.production_lines where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.user_roles where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id = any($1::uuid[]))`,
    [orgs],
  );
  await owner.query(`delete from public.users where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.roles where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from "Reference"."Allergens" where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from "Reference"."ManufacturingOperations" where org_id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.organizations where id = any($1::uuid[])`, [orgs]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

export async function withActionActor<T>(userId: string, orgId: string, action: () => Promise<T>): Promise<T> {
  const prevUser = process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  const prevOrg = process.env.NEXT_SERVER_ACTION_ORG_ID;
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  try {
    return await action();
  } finally {
    if (prevUser === undefined) delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    else process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = prevUser;
    if (prevOrg === undefined) delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    else process.env.NEXT_SERVER_ACTION_ORG_ID = prevOrg;
  }
}
