'use server';

import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

import { withOrgContext } from '../../lib/auth/with-org-context';
import {
  canAssignPrivilegedRoles,
  grantSubsetViolated,
  hasSuperRole,
  isPrivilegedSystemRole,
  readCallerPermissions,
  readRolePermissions,
} from './role-grant-guards';

const FORBIDDEN = 'forbidden' as const;

type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type PermissionContext = {
  client: QueryClient;
  userId: string;
  orgId: string;
};

export type AssignRoleInput = {
  targetUserId: string;
  roleId: string;
};

export type AssignRoleResult =
  | { ok: true; data: { targetUserId: string; roleId: string } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'forbidden_privileged_role'
        | 'not_found'
        | 'persistence_failed';
    };

type AssignRoleMutationRow = {
  role_found: boolean;
  target_user_found: boolean;
  last_owner_violation: boolean;
  updated_user_id: string | null;
};

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requirePermission(permission: string) {
  return async ({ client, userId, orgId }: PermissionContext): Promise<void> => {
    const { rows } = await client.query<{ ok: boolean }>(
      `select true as ok
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
         left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
        where ur.user_id = $1::uuid
          and ur.org_id = $2::uuid
          and (
            rp.permission is not null
            or r.code = $3
            or coalesce(r.permissions, '[]'::jsonb) ? $3
          )
        limit 1`,
      [userId, orgId, permission],
    );

    if (rows.length === 0) {
      throw FORBIDDEN;
    }
  };
}

export async function assignRole(input: AssignRoleInput): Promise<AssignRoleResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  const roleId = normalizeId(input?.roleId);
  if (!targetUserId || !roleId) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    try {
      await requirePermission('settings.roles.assign')({ client, userId, orgId });

      const { rows: targetRoleRows } = await client.query<{
        id: string;
        code: string;
        slug: string | null;
      }>(
        `select id, code, slug
           from public.roles
          where id = $1::uuid
            and org_id = $2::uuid`,
        [roleId, orgId],
      );
      const targetRole = targetRoleRows[0];
      if (!targetRole) {
        return { ok: false, error: 'not_found' };
      }

      if (isPrivilegedSystemRole(targetRole) && !(await canAssignPrivilegedRoles(client, userId, orgId))) {
        return { ok: false, error: 'forbidden_privileged_role' };
      }

      if (!(await hasSuperRole(client, userId, orgId))) {
        const [callerPermissions, targetPermissions] = await Promise.all([
          readCallerPermissions(client, userId, orgId),
          readRolePermissions(client, roleId),
        ]);
        if (grantSubsetViolated(callerPermissions, targetPermissions)) {
          return { ok: false, error: 'forbidden_privileged_role' };
        }
      }

      const { rows: mutationRows } = await client.query<AssignRoleMutationRow>(
        `with target_role as (
            select id,
                   (code = 'owner' or slug = 'owner') as is_owner
              from public.roles
             where id = $2::uuid
               and org_id = $3::uuid
          ),
          target_user as (
            select id
              from public.users
             where id = $1::uuid
               and org_id = $3::uuid
          ),
          locked_owner_roles as (
            select ur.user_id
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
             where ur.org_id = $3::uuid
               and (r.code = 'owner' or r.slug = 'owner')
             for update of ur
          ),
          target_current_owner as (
            select exists (
              select 1
                from locked_owner_roles lor
               where lor.user_id = $1::uuid
            ) as is_owner
          ),
          owner_count as (
            select count(distinct user_id)::int as value
              from locked_owner_roles
          ),
          guard as (
            select exists(select 1 from target_role) as role_found,
                   exists(select 1 from target_user) as target_user_found,
                   coalesce((select is_owner from target_current_owner), false)
                     and not coalesce((select is_owner from target_role), false)
                     and coalesce((select value from owner_count), 0) <= 1 as last_owner_violation
          ),
          updated_user as (
            update public.users
               set role_id = $2::uuid,
                   updated_at = now()
             where id = $1::uuid
               and org_id = $3::uuid
               and (select role_found and target_user_found and not last_owner_violation from guard)
             returning id
          ),
          deleted_roles as (
            delete from public.user_roles
             where user_id = $1::uuid
               and org_id = $3::uuid
               and exists(select 1 from updated_user)
             returning user_id
          ),
          inserted_role as (
            insert into public.user_roles (user_id, role_id, org_id)
            select id, $2::uuid, $3::uuid
              from updated_user
            on conflict (user_id, role_id) do update set org_id = excluded.org_id
            returning user_id
          )
          select guard.role_found,
                 guard.target_user_found,
                 guard.last_owner_violation,
                 (select user_id from inserted_role limit 1) as updated_user_id
            from guard`,
        [targetUserId, roleId, orgId],
      );
      const mutation = mutationRows[0];
      if (!mutation?.role_found || !mutation.target_user_found) {
        return { ok: false, error: 'not_found' };
      }
      if (mutation.last_owner_violation) {
        return { ok: false, error: 'forbidden' };
      }
      if (!mutation.updated_user_id) {
        return { ok: false, error: 'persistence_failed' };
      }

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'org_security_policies', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.role.assigned',
          targetUserId,
          JSON.stringify({ org_id: orgId, target_user_id: targetUserId, role_id: roleId, actor_user_id: userId }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-assign-role-v1')`,
        [
          orgId,
          'settings.role.assigned',
          targetUserId,
          JSON.stringify({
            org_id: orgId,
            target_user_id: targetUserId,
            role_id: roleId,
            actor_user_id: userId,
          }),
        ],
      );

      try {
        revalidateLocalized('/settings/users');
      } catch {
        // Unit tests and non-Next callers do not provide a static-generation store;
        // persistence has already succeeded, so cache invalidation must not mask it.
      }
      return { ok: true, data: { targetUserId, roleId } };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}
