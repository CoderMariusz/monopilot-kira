'use server';

import { hasAnyPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';

const FORBIDDEN = 'forbidden' as const;

const DEACTIVATE_PERMISSIONS = ['org.access.admin', 'settings.users.deactivate'] as const;

type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
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

async function isLastOwnerViolation(
  client: QueryClient,
  targetUserId: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ last_owner_violation: boolean }>(
    `with locked_active_owners as (
        select distinct u.id as user_id
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          join public.users u on u.id = ur.user_id and u.org_id = ur.org_id
         where ur.org_id = $2::uuid
           and u.is_active = true
           and (r.code = 'owner' or r.slug = 'owner')
         for update of u
      ),
      target_is_active_owner as (
        select exists (
          select 1
            from locked_active_owners lao
           where lao.user_id = $1::uuid
        ) as value
      ),
      other_active_owner_count as (
        select count(distinct user_id)::int as value
          from locked_active_owners
         where user_id <> $1::uuid
      )
      select coalesce((select value from target_is_active_owner), false)
           and coalesce((select value from other_active_owner_count), 0) = 0 as last_owner_violation`,
    [targetUserId, orgId],
  );
  return rows[0]?.last_owner_violation === true;
}

export async function deactivateUser(input: DeactivateUserInput): Promise<DeactivateUserResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  if (!targetUserId) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    try {
      const permCtx = { client, userId, orgId };
      if (!(await hasAnyPermission(permCtx, [...DEACTIVATE_PERMISSIONS]))) {
        return { ok: false, error: 'forbidden' };
      }

      if (targetUserId === userId) {
        return { ok: false, error: 'self_deactivation' };
      }

      if (await isLastOwnerViolation(client, targetUserId, orgId)) {
        return { ok: false, error: 'forbidden' };
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
