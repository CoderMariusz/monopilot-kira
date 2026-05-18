'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { createServerSupabaseClient } from '../../lib/auth/supabase-server';

const FORBIDDEN = 'forbidden' as const;

type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type PermissionContext = {
  client: QueryClient;
  userId: string;
  orgId: string;
};

export type ResetPasswordInput = {
  targetUserId: string;
  redirectTo?: string;
};

export type ResetPasswordResult =
  | { ok: true; data: { targetUserId: string; revokedCount: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'reset_failed' | 'persistence_failed' };

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

export async function resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
  const targetUserId = normalizeId(input?.targetUserId);
  const redirectTo = normalizeOptionalString(input?.redirectTo);
  if (!targetUserId) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    try {
      await requirePermission('org.access.admin')({ client, userId, orgId });

      const { rows } = await client.query<{ email: string }>(
        `select email
           from public.users
          where id = $1::uuid
            and org_id = $2::uuid
            and is_active = true`,
        [targetUserId, orgId],
      );
      const email = rows[0]?.email;
      if (!email) {
        return { ok: false, error: 'not_found' };
      }

      const supabase = await createServerSupabaseClient();
      const linkResponse = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (linkResponse.error) {
        return { ok: false, error: 'reset_failed' };
      }

      const revokeResult = await client.query(
        `update public.user_sessions
            set revoked_at = now(),
                revoked_by = $1::uuid
          where user_id = $2::uuid
            and org_id = $3::uuid
            and revoked_at is null`,
        [userId, targetUserId, orgId],
      );

      return {
        ok: true,
        data: { targetUserId, revokedCount: revokeResult.rowCount ?? 0 },
      };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}
