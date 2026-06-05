'use server';

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

export type DeactivateUserInput = {
  targetUserId: string;
};

export type DeactivateUserResult =
  | { ok: true; data: { targetUserId: string; deactivated: true } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'self_deactivation' | 'not_found' | 'persistence_failed';
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

export async function deactivateUser(input: DeactivateUserInput): Promise<DeactivateUserResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  if (!targetUserId) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    try {
      await requirePermission('org.access.admin')({ client, userId, orgId });

      if (targetUserId === userId) {
        return { ok: false, error: 'self_deactivation' };
      }

      const { rows } = await client.query<{ id: string }>(
        `update public.users
            set is_active = false,
                updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        returning id`,
        [targetUserId, orgId],
      );
      if (rows.length === 0) {
        return { ok: false, error: 'not_found' };
      }

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'org_security_policies', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.user.deactivated',
          targetUserId,
          JSON.stringify({ org_id: orgId, target_user_id: targetUserId, actor_user_id: userId, is_active: false }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-deactivate-user-v1')`,
        [
          orgId,
          'settings.user.deactivated',
          targetUserId,
          JSON.stringify({
            org_id: orgId,
            target_user_id: targetUserId,
            actor_user_id: userId,
          }),
        ],
      );

      return { ok: true, data: { targetUserId, deactivated: true } };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}
