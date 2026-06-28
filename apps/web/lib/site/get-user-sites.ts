import { withOrgContext } from '../auth/with-org-context';
import { isUserSiteAccessUnrestricted } from './assert-user-site-access';
import { getOrgSites, type SiteOption } from './get-org-sites';

export type Site = SiteOption;

export async function getUserSites(userId: string): Promise<Site[]> {
  const assignedSites = await withOrgContext(async ({ client }) => {
    if (await isUserSiteAccessUnrestricted(userId, client)) return null;

    const { rows } = await client.query<{
      id: string;
      site_code: string;
      name: string;
      is_default: boolean;
    }>(
      `select s.id::text as id,
              s.site_code,
              s.name,
              s.is_default
         from public.user_sites us
         join public.sites s on s.id = us.site_id and s.org_id = us.org_id
        where us.user_id = $1::uuid
          and us.org_id = app.current_org_id()
          and s.is_active = true
        order by s.is_default desc, s.name asc
        limit 50`,
      [userId],
    );

    return rows.map((r) => ({
      id: r.id,
      siteCode: r.site_code,
      name: r.name,
      isDefault: Boolean(r.is_default),
    }));
  });

  return assignedSites ?? getOrgSites();
}
