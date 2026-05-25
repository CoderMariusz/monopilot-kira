'use server';

import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../lib/auth/with-org-context';

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
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

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
            or r.slug = $3
            or r.permissions ? $3
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

      const { rows: roleRows } = await client.query<{ id: string }>(
        `select id from public.roles where id = $1::uuid and org_id = $2::uuid`,
        [roleId, orgId],
      );
      if (roleRows.length === 0) {
        return { ok: false, error: 'not_found' };
      }

      const { rows: userRows } = await client.query<{ id: string }>(
        `update public.users
            set role_id = $2::uuid,
                updated_at = now()
          where id = $1::uuid
            and org_id = $3::uuid
        returning id`,
        [targetUserId, roleId, orgId],
      );
      if (userRows.length === 0) {
        return { ok: false, error: 'not_found' };
      }

      await client.query(
        `delete from public.user_roles where user_id = $1::uuid and org_id = $2::uuid`,
        [targetUserId, orgId],
      );
      await client.query(
        `insert into public.user_roles (user_id, role_id, org_id)
         values ($1::uuid, $2::uuid, $3::uuid)
         on conflict (user_id, role_id) do update set org_id = excluded.org_id`,
        [targetUserId, roleId, orgId],
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
        revalidatePath('/settings/users');
        revalidatePath('/en/settings/users');
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
