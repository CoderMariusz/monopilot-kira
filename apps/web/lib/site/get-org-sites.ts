/**
 * 14-multi-site — org site registry read for the topbar picker (CL4).
 *
 * Lists the org's active sites from `public.sites` (mig 215/266 — org master
 * data, org-scoped RLS via app.current_org_id()). Called from the (app) shell
 * layout; ANY failure degrades to [] so the topbar silently falls back to the
 * plain org crumb and the shell never breaks on a sites read.
 *
 * NOT a 'use server' module — invoked during Server Component render only.
 */

import { withOrgContext } from '../auth/with-org-context';

export type SiteOption = {
  id: string;
  siteCode: string;
  name: string;
  isDefault: boolean;
};

export async function getOrgSites(): Promise<SiteOption[]> {
  try {
    return await withOrgContext(async ({ client }) => {
      const { rows } = await client.query<{
        id: string;
        site_code: string;
        name: string;
        is_default: boolean;
      }>(
        `select id::text as id,
                site_code,
                name,
                is_default
           from public.sites
          where org_id = app.current_org_id()
            and is_active = true
          order by is_default desc, name asc
          limit 50`,
      );
      return rows.map((r) => ({
        id: r.id,
        siteCode: r.site_code,
        name: r.name,
        isDefault: Boolean(r.is_default),
      }));
    });
  } catch (error) {
    console.error('[site] getOrgSites failed — topbar falls back to org crumb:', error);
    return [];
  }
}
