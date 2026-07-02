'use server';

import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import { withOrgContext } from '../../lib/auth/with-org-context';

const IP_ALLOWLIST_EDIT_PERMISSION = 'settings.ip_allowlist.edit';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type RemoveIpRangeResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

export async function removeIpRange(id: string): Promise<RemoveIpRangeResult> {
  const ipRangeId = normalizeId(id);
  if (!ipRangeId) return { ok: false, error: 'INVALID_INPUT' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      const allowed = await hasEditPermission({ client, userId, orgId });
      if (!allowed) return { ok: false, error: 'FORBIDDEN' };

      const removed = await client.query<{ id: string; label: string | null }>(
        `delete from public.admin_ip_allowlist
          where id = $1::uuid
            and org_id = app.current_org_id()
        returning id, label`,
        [ipRangeId],
      );
      const row = removed.rows[0];
      if ((removed.rowCount ?? removed.rows.length) < 1 || !row) return { ok: false, error: 'NOT_FOUND' };

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'admin_ip_allowlist', $4, $5::jsonb, null, 'security')`,
        [
          orgId,
          userId,
          'settings.ip_allowlist.removed',
          row.id,
          JSON.stringify({ org_id: orgId, ip_range_id: row.id, label: row.label }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
        [
          orgId,
          'settings.ip_allowlist.changed',
          'admin_ip_allowlist',
          row.id,
          JSON.stringify({
            org_id: orgId,
            action: 'removed',
            ip_range_id: row.id,
            label: row.label,
            actor_user_id: userId,
          }),
          'settings-ip-allowlist-v1',
        ],
      );

      revalidateLocalized('/settings/security');
      return { ok: true, data: { id: row.id } };
    } catch {
      return { ok: false, error: 'PERSISTENCE_FAILED' };
    }
  });
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

async function hasEditPermission({ client, userId, orgId }: OrgActionContext): Promise<boolean> {
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
    [userId, orgId, IP_ALLOWLIST_EDIT_PERMISSION],
  );
  return rows.length > 0;
}
