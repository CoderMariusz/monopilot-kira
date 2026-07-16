'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import type { ResetUserMfaInput, ResetUserMfaResult } from './user-lifecycle.types';

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

function normalizeReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 3 ? trimmed : null;
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

/**
 * Service-role Supabase admin client — same pattern as create-user-with-password.ts
 * and reset-password.ts (auth.admin.* privileged calls).
 */
async function createSupabaseAuthAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('resetUserMfa requires Supabase service-role env (SUPABASE_SERVICE_ROLE_KEY)');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type MfaAdminApi = {
  listFactors?: (params: { userId: string }) => Promise<{
    data: { factors?: Array<{ id: string }> } | null;
    error: { message: string } | null;
  }>;
  deleteFactor?: (params: { id: string; userId: string }) => Promise<{ error: { message: string } | null }>;
};

async function clearAuthMfaFactors(supabase: Awaited<ReturnType<typeof createSupabaseAuthAdmin>>, userId: string) {
  const mfaAdmin = (supabase.auth.admin as { mfa?: MfaAdminApi }).mfa;
  if (!mfaAdmin?.listFactors || !mfaAdmin.deleteFactor) {
    return 0;
  }

  const listed = await mfaAdmin.listFactors({ userId });
  if (listed.error) {
    throw listed.error;
  }

  const factors = listed.data?.factors ?? [];
  for (const factor of factors) {
    const removed = await mfaAdmin.deleteFactor({ id: factor.id, userId });
    if (removed.error) {
      throw removed.error;
    }
  }
  return factors.length;
}

async function clearAppMfaEnrollment(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthAdmin>>,
  userId: string,
): Promise<boolean> {
  const secrets = await supabase.from('mfa_secrets').delete().eq('user_id', userId);
  if (secrets.error) {
    throw secrets.error;
  }
  const recovery = await supabase.from('recovery_codes').delete().eq('user_id', userId);
  if (recovery.error) {
    throw recovery.error;
  }
  return (secrets.count ?? 0) > 0 || (recovery.count ?? 0) > 0;
}

export async function resetUserMfa(input: ResetUserMfaInput): Promise<ResetUserMfaResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  const reason = normalizeReason(input?.reason);
  if (!targetUserId || !reason) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    try {
      await requireAnyPermission({ client, userId, orgId }, ['org.access.admin', 'settings.users.deactivate']);

      const { rows } = await client.query<{ id: string }>(
        `select id
           from public.users
          where id = $1::uuid
            and org_id = $2::uuid`,
        [targetUserId, orgId],
      );
      if (rows.length === 0) {
        return { ok: false, error: 'not_found' };
      }

      let supabase: Awaited<ReturnType<typeof createSupabaseAuthAdmin>>;
      try {
        supabase = await createSupabaseAuthAdmin();
      } catch {
        return { ok: false, error: 'service_unavailable' };
      }

      let factorsRemoved = 0;
      let secretsCleared = false;
      try {
        factorsRemoved = await clearAuthMfaFactors(supabase, targetUserId);
        secretsCleared = await clearAppMfaEnrollment(supabase, targetUserId);
      } catch {
        return { ok: false, error: 'reset_failed' };
      }

      // Revoke active sessions so the user must re-authenticate after MFA reset.
      // The supabase-js SDK v2 auth.admin.signOut takes a JWT, not a userId.  We
      // call the admin REST endpoint directly.  Non-fatal: MFA factors are already
      // cleared; a session without TOTP will hit the MFA gate on next sensitive op.
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && serviceRoleKey) {
          await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetUserId}/sessions`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
          });
        }
      } catch {
        // non-fatal — MFA factors are already cleared
      }

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'users', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.user.mfa_reset',
          targetUserId,
          JSON.stringify({
            org_id: orgId,
            target_user_id: targetUserId,
            actor_user_id: userId,
            reason,
            factors_removed: factorsRemoved,
            secrets_cleared: secretsCleared,
          }),
        ],
      );

      revalidateLocalized('/settings/users');

      return {
        ok: true,
        data: { targetUserId, factorsRemoved, secretsCleared },
      };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}
