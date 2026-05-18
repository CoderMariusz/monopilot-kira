'use server';

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

type IpRangeRow = {
  id: string;
  cidr: string;
  label: string | null;
  created_at: string | Date | null;
  created_by: string | null;
};

export type ListIpRangesResult =
  | {
      ok: true;
      data: Array<{
        id: string;
        cidr: string;
        label: string | null;
        createdAt: string | null;
        createdBy: string | null;
      }>;
    }
  | { ok: false; error: 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

export async function listIpRanges(): Promise<ListIpRangesResult> {
  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      const allowed = await hasEditPermission({ client, userId, orgId });
      if (!allowed) return { ok: false, error: 'FORBIDDEN' };

      const { rows } = await client.query<IpRangeRow>(
        `select id, cidr::text as cidr, label, created_at, created_by
           from public.admin_ip_allowlist
          where org_id = app.current_org_id()
          order by created_at desc, id desc`,
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          cidr: row.cidr,
          label: row.label,
          createdAt: row.created_at == null ? null : String(row.created_at),
          createdBy: row.created_by,
        })),
      };
    } catch {
      return { ok: false, error: 'PERSISTENCE_FAILED' };
    }
  });
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
