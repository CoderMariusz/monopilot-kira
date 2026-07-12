'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import type { ReactivateUserInput, ReactivateUserResult } from './user-lifecycle.types';
import { createSupabaseAuthAdmin, liftAuthBan } from './supabase-admin';

const FORBIDDEN = 'forbidden' as const;

type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type PermissionContext = {
  client: QueryClient;
  userId: string;
  orgId: string;
};

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Throws FORBIDDEN unless the caller holds at least one of the given permissions. */
async function requireAnyPermission(ctx: PermissionContext, permissions: [string, ...string[]]): Promise<void> {
  for (const permission of permissions) {
    const { rows } = await ctx.client.query<{ ok: boolean }>(
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
      [ctx.userId, ctx.orgId, permission],
    );
    if (rows.length > 0) return;
  }
  throw FORBIDDEN;
}

export async function reactivateUser(input: ReactivateUserInput): Promise<ReactivateUserResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  if (!targetUserId) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<ReactivateUserResult> => {
      // Same OR-union as deactivateUser (org.access.admin OR settings.users.deactivate).
      await requireAnyPermission({ client, userId, orgId }, ['org.access.admin', 'settings.users.deactivate']);

      const { rows: targetRows } = await client.query<{
        id: string;
        is_active: boolean;
        invite_token: string | null;
      }>(
        `select id, is_active, invite_token
           from public.users
          where id = $1::uuid
            and org_id = $2::uuid`,
        [targetUserId, orgId],
      );
      const target = targetRows[0];
      if (!target) {
        return { ok: false, error: 'not_found' };
      }
      if (target.invite_token) {
        return { ok: false, error: 'not_disabled' };
      }

      // Deactivate bans via Supabase admin; reactivate must lift that ban symmetrically.
      try {
        const supabase = await createSupabaseAuthAdmin();
        const authLookup = await supabase.auth.admin.getUserById(targetUserId);
        if (authLookup.error || !authLookup.data.user) {
          return { ok: false, error: 'auth_identity_missing' };
        }
      } catch {
        return { ok: false, error: 'auth_identity_missing' };
      }

      if (target.is_active) {
        // Repair path: user row already active (e.g. reactivated before B3a) but auth ban remains.
        return { ok: true, data: { targetUserId, reactivated: true } };
      }

      // FOR UPDATE locks the org row so that concurrent reactivations in the same
      // transaction cannot both read the same count and both conclude there is a
      // free seat.  The count query below is an aggregate over public.users (not
      // directly lockable here), so a brief TOCTOU window remains between the
      // count read and the UPDATE; the seat-limit is an advisory soft-cap and the
      // owner accepted this residual race (advisory F4 — owner-accepted).
      const { rows: seatRows } = await client.query<{ seat_limit: number | null }>(
        `select seat_limit from public.organizations where id = $1::uuid for update`,
        [orgId],
      );
      const seatLimit = seatRows[0]?.seat_limit ?? null;
      if (seatLimit !== null) {
        const { rows: countRows } = await client.query<{ active_user_count: string | number }>(
          `select count(*) as active_user_count
             from public.users
            where org_id = $1::uuid
              and is_active = true`,
          [orgId],
        );
        const activeUserCount = Number(countRows[0]?.active_user_count ?? 0);
        if (activeUserCount >= seatLimit) {
          return { ok: false, error: 'seat_limit_exceeded' };
        }
      }

      const { rows } = await client.query<{ id: string }>(
        `update public.users
            set is_active = true,
                updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
            and is_active = false
            and invite_token is null
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
          'settings.user.reactivated',
          targetUserId,
          JSON.stringify({ org_id: orgId, target_user_id: targetUserId, actor_user_id: userId, is_active: true }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-reactivate-user-v1')`,
        [
          orgId,
          'settings.user.reactivated',
          targetUserId,
          JSON.stringify({
            org_id: orgId,
            target_user_id: targetUserId,
            actor_user_id: userId,
          }),
        ],
      );

      return { ok: true, data: { targetUserId, reactivated: true } };
    });

    if (result.ok) {
      const lifted = await liftAuthBan(targetUserId);
      if (!lifted.ok) {
        return { ok: false, error: 'auth_unban_failed' };
      }
      revalidateLocalized('/settings/users');
    }

    return result;
  } catch (error) {
    if (error === FORBIDDEN) {
      return { ok: false, error: 'forbidden' };
    }
    return { ok: false, error: 'persistence_failed' };
  }
}
