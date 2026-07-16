'use server';

import { hasAnyPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { createSupabaseAuthAdmin } from './supabase-admin';

const FORBIDDEN = 'forbidden' as const;

const DEACTIVATE_PERMISSIONS = ['org.access.admin', 'settings.users.deactivate'] as const;

type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type DeactivateUserInput = {
  targetUserId: string;
};

export type DeactivateUserResult =
  | {
      ok: true;
      data: {
        targetUserId: string;
        deactivated: true;
        /** DB deactivation succeeded but Supabase session ban failed — user should sign out / retry. */
        authRevokeWarning?: 'session_revoke_failed';
      };
    }
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
  await client.query(`select id from public.organizations where id = $1::uuid for update`, [orgId]);

  const { rows } = await client.query<{ last_owner_violation: boolean }>(
    `with active_owners as (
        select distinct u.id as user_id
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          join public.users u on u.id = ur.user_id and u.org_id = ur.org_id
         where ur.org_id = $2::uuid
           and u.is_active = true
           and (r.code = 'owner' or r.slug = 'owner')
      )
      select exists (
               select 1 from active_owners ao where ao.user_id = $1::uuid
             )
         and (
               select count(*)::int from active_owners ao where ao.user_id <> $1::uuid
             ) = 0 as last_owner_violation`,
    [targetUserId, orgId],
  );
  return rows[0]?.last_owner_violation === true;
}

async function revokeAuthSessions(targetUserId: string): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const supabase = await createSupabaseAuthAdmin();
    const { error } = await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
    if (error) {
      console.error('[deactivateUser] auth session revoke failed (user remains inactive in public.users)', {
        targetUserId,
        message: error.message,
      });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (error) {
    console.error('[deactivateUser] auth session revoke failed (user remains inactive in public.users)', {
      targetUserId,
      error,
    });
    return { ok: false, error };
  }
}

export async function deactivateUser(input: DeactivateUserInput): Promise<DeactivateUserResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  if (!targetUserId) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }) => {
      const permCtx = { client, userId, orgId };
      if (!(await hasAnyPermission(permCtx, [...DEACTIVATE_PERMISSIONS]))) {
        return { ok: false, error: 'forbidden' } as const;
      }

      if (targetUserId === userId) {
        return { ok: false, error: 'self_deactivation' } as const;
      }

      if (await isLastOwnerViolation(client, targetUserId, orgId)) {
        return { ok: false, error: 'forbidden' } as const;
      }

      const { rows } = await client.query<{ id: string; updated_at: string }>(
        `update public.users
            set is_active = false,
                updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
            and is_active = true
        returning id, updated_at::text as updated_at`,
        [targetUserId, orgId],
      );
      if (rows.length === 0) {
        const existing = await client.query<{ is_active: boolean }>(
          `select is_active
             from public.users
            where id = $1::uuid
              and org_id = $2::uuid
            limit 1`,
          [targetUserId, orgId],
        );
        if (existing.rows[0]?.is_active === false) {
          return { ok: true, data: { targetUserId, deactivated: true } } as const;
        }
        return { ok: false, error: 'not_found' } as const;
      }

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'users', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.user.deactivated',
          targetUserId,
          JSON.stringify({ org_id: orgId, target_user_id: targetUserId, actor_user_id: userId, is_active: false }),
        ],
      );

      const deactivatedAt = rows[0]!.updated_at;
      const dedupKey = `settings.user.deactivated:${targetUserId}:${deactivatedAt}`;

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
         values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-deactivate-user-v1', $5)`,
        [
          orgId,
          'settings.user.deactivated',
          targetUserId,
          JSON.stringify({
            org_id: orgId,
            target_user_id: targetUserId,
            actor_user_id: userId,
            deactivated_at: deactivatedAt,
          }),
          dedupKey,
        ],
      );

      return { ok: true, data: { targetUserId, deactivated: true } } as const;
    });

    if (result.ok) {
      const revoked = await revokeAuthSessions(targetUserId);
      if (!revoked.ok) {
        return {
          ok: true,
          data: {
            ...result.data,
            authRevokeWarning: 'session_revoke_failed',
          },
        };
      }
    }

    return result;
  } catch (error) {
    if (error === FORBIDDEN) {
      return { ok: false, error: 'forbidden' };
    }
    console.error('[deactivateUser] persistence failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
