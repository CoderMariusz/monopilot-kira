/**
 * Shared server-side role-grant guards for user provisioning and assignment.
 * NOT a 'use server' module — imported by server actions only.
 */
import { SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT } from './user-role-policy';

/** Super roles bypass grant-subset checks (mirrors create-user-with-password). */
export const SUPER_ROLE_CODES = ['owner', 'admin', 'org_admin'] as const;

/** May assign privileged system roles (owner/admin/org.access.admin family). */
export const PRIVILEGED_ROLE_ASSIGNER_CODES = ['owner', 'admin', 'org_admin', 'org.access.admin'] as const;

/**
 * Role slugs that legitimately have zero site assignments (all-site unrestricted).
 * Byte-for-byte equivalent to mig 383 app.user_can_see_site condition (2) — slug only.
 */
export const ALL_SITE_AUTHORITY_ROLE_SLUGS = [
  'org.access.admin',
  'org.platform.admin',
  'owner',
  'admin',
  'org_admin',
] as const;

export type RoleGrantQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function hasRoleFromCodes(
  client: RoleGrantQueryClient,
  userId: string,
  orgId: string,
  codes: readonly string[],
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (r.code = any($3::text[]) or r.slug = any($3::text[]))
      limit 1`,
    [userId, orgId, codes],
  );
  return rows[0]?.ok === true;
}

export async function hasSuperRole(
  client: RoleGrantQueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  return hasRoleFromCodes(client, userId, orgId, SUPER_ROLE_CODES);
}

export async function canAssignPrivilegedRoles(
  client: RoleGrantQueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  return hasRoleFromCodes(client, userId, orgId, PRIVILEGED_ROLE_ASSIGNER_CODES);
}

export async function hasAllSiteAuthority(
  client: RoleGrantQueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and r.slug = any($3::text[])
      limit 1`,
    [userId, orgId, ALL_SITE_AUTHORITY_ROLE_SLUGS],
  );
  return rows[0]?.ok === true;
}

export async function readCallerPermissions(
  client: RoleGrantQueryClient,
  userId: string,
  orgId: string,
): Promise<Set<string>> {
  const { rows } = await client.query<{ permission: string }>(
    `select distinct perm as permission
       from (
         select rp.permission as perm
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           join public.role_permissions rp on rp.role_id = r.id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as perm
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
         union
         -- Permission gates match r.code / r.slug via exact equality (e.g. r.code = $3).
         -- Only dotted values are permission-shaped; bare role identifiers (operator) are not grants.
         select r.code as perm
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and r.code is not null
            and r.code like '%.%'
         union
         select r.slug as perm
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and r.slug is not null
            and r.slug like '%.%'
       ) grants
      where perm is not null`,
    [userId, orgId],
  );
  return new Set(rows.map((row) => row.permission));
}

export async function readRolePermissions(client: RoleGrantQueryClient, roleId: string): Promise<string[]> {
  const { rows } = await client.query<{ permission: string }>(
    `select distinct perm as permission
       from (
         select rp.permission as perm
           from public.role_permissions rp
           join public.roles r on r.id = rp.role_id
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as perm
           from public.roles r
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
         union
         -- Permission gates match r.code / r.slug via exact equality (e.g. r.code = $3).
         -- Only dotted values are permission-shaped; bare role identifiers (operator) are not grants.
         select r.code as perm
           from public.roles r
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
            and r.code is not null
            and r.code like '%.%'
         union
         select r.slug as perm
           from public.roles r
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
            and r.slug is not null
            and r.slug like '%.%'
       ) grants
      where perm is not null
      order by perm`,
    [roleId],
  );
  return rows.map((row) => row.permission);
}

export function isPrivilegedSystemRole(role: { code: string; slug?: string | null }): boolean {
  return (
    SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT.has(role.code) ||
    (typeof role.slug === 'string' && SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT.has(role.slug))
  );
}

export function grantSubsetViolated(callerPermissions: Set<string>, targetPermissions: string[]): boolean {
  return targetPermissions.some((permission) => !callerPermissions.has(permission));
}
