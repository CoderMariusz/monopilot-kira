'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type ForceMfaInput = {
  reason?: string;
};

export type ForceMfaResult =
  | { ok: true; data: { markedUsers: number; roleCodes: string[]; requiresMfaAt: string } }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

const ADMIN_ROLE_CODES = ['owner', 'admin', 'org_admin'] as const;
const FORBIDDEN = 'forbidden' as const;

export async function forceMfa(input: ForceMfaInput = {}): Promise<ForceMfaResult> {
  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requireSecurityAdmin({ client, userId, orgId });
      const requiresMfaAt = new Date().toISOString();

      const update = await client.query(
        `update public.users u
            set requires_mfa_at = coalesce(u.requires_mfa_at, $1::timestamptz),
                updated_at = now()
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where u.id = ur.user_id
            and u.org_id = $2::uuid
            and ur.org_id = $2::uuid
            and (r.code = any($3::text[]) or r.slug = any($3::text[]))`,
        [requiresMfaAt, orgId, ADMIN_ROLE_CODES],
      );

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'org_security_policies', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'org.mfa_enrollment.forced',
          orgId,
          JSON.stringify({
            org_id: orgId,
            role_codes: ADMIN_ROLE_CODES,
            actor_user_id: userId,
            requires_mfa_at: requiresMfaAt,
            reason: input.reason,
          }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
        [
          orgId,
          'org.mfa_enrollment.forced',
          'org_security_policy',
          JSON.stringify({
            org_id: orgId,
            role_codes: ADMIN_ROLE_CODES,
            actor_user_id: userId,
            requires_mfa_at: requiresMfaAt,
            reason: input.reason,
          }),
          'settings-security-policy-v1',
        ],
      );

      return {
        ok: true,
        data: {
          markedUsers: update.rowCount ?? update.rows.length,
          roleCodes: [...ADMIN_ROLE_CODES],
          requiresMfaAt,
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

async function requireSecurityAdmin({ client, userId, orgId }: OrgActionContext): Promise<void> {
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
          or r.code = any($4::text[])
          or r.slug = any($4::text[])
        )
      limit 1`,
    [userId, orgId, 'org.access.admin', ADMIN_ROLE_CODES],
  );
  if (rows.length === 0) throw FORBIDDEN;
}
