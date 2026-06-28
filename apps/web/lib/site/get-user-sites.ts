import { withOrgContext } from '../auth/with-org-context';
import { isUserSiteAccessUnrestricted } from './assert-user-site-access';
import { getOrgSites, type SiteOption } from './get-org-sites';

export type Site = SiteOption;

export interface UserSiteAccess {
  /** Sites visible to the user: the assigned subset, or the full org set when unrestricted. */
  sites: Site[];
  /** True for admins / users with 0 assignments — their visibility must never be restricted. */
  isUnrestricted: boolean;
}

/**
 * Resolve the user's visible sites AND whether they are unrestricted, in a
 * single org transaction. The (app) shell layout uses the flag to decide
 * whether to auto-default a restricted user onto one of their sites (see
 * resolve-effective-active-site.ts). `getUserSites` below delegates here so its
 * existing callers/contract (a bare Site[]) keep working.
 */
export async function getUserSiteAccess(userId: string): Promise<UserSiteAccess> {
  let result: { sites: Site[] | null; isUnrestricted: boolean };
  try {
    result = await withOrgContext(async ({ client }) => {
      if (await isUserSiteAccessUnrestricted(userId, client)) {
        return { sites: null as Site[] | null, isUnrestricted: true };
      }

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

      return {
        sites: rows.map((r) => ({
          id: r.id,
          siteCode: r.site_code,
          name: r.name,
          isDefault: Boolean(r.is_default),
        })) as Site[] | null,
        isUnrestricted: false,
      };
    });
  } catch (error) {
    // Any failure degrades to the UNRESTRICTED full-org behaviour: never break
    // the shell, and never force a restricted-site cookie off a transient error
    // (the no-regression default — getOrgSites also self-degrades to []).
    console.error('[site] getUserSiteAccess failed — degrading to full org sites:', error);
    result = { sites: null, isUnrestricted: true };
  }

  // Unrestricted → degrade to the full org site list (preserves prior behaviour).
  const sites = result.sites ?? (await getOrgSites());
  return { sites, isUnrestricted: result.isUnrestricted };
}

export async function getUserSites(userId: string): Promise<Site[]> {
  const { sites } = await getUserSiteAccess(userId);
  return sites;
}
