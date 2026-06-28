import { SiteAccessError } from './site-access-error';

const ADMIN_ROLE_SLUGS = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'] as const;

export type SiteAccessClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function isUserSiteAccessUnrestricted(userId: string, client: SiteAccessClient): Promise<boolean> {
  const { rows: adminRows } = await client.query<{ ok: number }>(
    `select 1 as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = app.current_org_id()
        and r.slug = any($2::text[])
      limit 1`,
    [userId, [...ADMIN_ROLE_SLUGS]],
  );
  if (adminRows.length > 0) return true;

  const { rows: assignmentRows } = await client.query<{ count: number | string }>(
    `select count(*)::int as count
       from public.user_sites us
      where us.user_id = $1::uuid
        and us.org_id = app.current_org_id()`,
    [userId],
  );

  return Number(assignmentRows[0]?.count ?? 0) === 0;
}

export async function assertUserSiteAccess(
  userId: string,
  siteId: string,
  client: SiteAccessClient,
): Promise<true> {
  if (await isUserSiteAccessUnrestricted(userId, client)) return true;

  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_sites us
      where us.user_id = $1::uuid
        and us.site_id = $2::uuid
        and us.org_id = app.current_org_id()
      limit 1`,
    [userId, siteId],
  );

  if (rows.length > 0) return true;
  throw new SiteAccessError(siteId);
}
