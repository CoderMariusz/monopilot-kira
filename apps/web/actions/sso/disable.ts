'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const SSO_EDIT_PERMISSION = 'settings.sso.edit';

export type DisableSsoResult =
  | { ok: true; data: { orgId: string; enabled: false } }
  | { ok: false; error: 'forbidden' | 'not_found' | 'persistence_failed' };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function disableSso(): Promise<DisableSsoResult> {
  return withOrgContext(async ({ userId, orgId, client }: { userId: string; orgId: string; client: QueryClient }) => {
    if (!(await hasPermission(client, userId, orgId, SSO_EDIT_PERMISSION))) {
      return { ok: false, error: 'forbidden' };
    }

    try {
      const { rows, rowCount } = await client.query<{ org_id: string; enabled: false }>(
        `update public.org_sso_config
            set enabled = false,
                updated_at = now()
          where org_id = app.current_org_id()
        returning org_id, enabled`,
      );
      if ((rowCount ?? rows.length) < 1) return { ok: false, error: 'not_found' };
      return { ok: true, data: { orgId: rows[0]?.org_id ?? orgId, enabled: false } };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

async function hasPermission(client: QueryClient, userId: string, orgId: string, permission: string): Promise<boolean> {
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
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}
