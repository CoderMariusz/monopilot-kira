'use server';

/**
 * 14-multi-site — site-picker cookie write seam (CL4).
 *
 * Server Action invoked by the topbar <SiteSwitcher>. Persists the selected
 * site in the server-readable `mp_site_id` cookie (httpOnly — the client never
 * needs to read it back; the layout passes the active id down as a prop).
 * `null` / empty = "All sites" → cookie set to the {@link ALL_SITES_COOKIE_VALUE}
 * sentinel (not deleted). Non-uuid input is rejected.
 *
 * No DB write — site selection is a per-browser view preference, not org
 * state. The wired read paths re-query on `router.refresh()`.
 */

import { cookies } from 'next/headers';

import { withOrgContext } from '../auth/with-org-context';
import { assertUserSiteAccess } from './assert-user-site-access';
import { SiteAccessError } from './site-access-error';
import { ALL_SITES_COOKIE_VALUE, SITE_COOKIE_NAME, asSiteId } from './site-context';

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export async function setActiveSite(siteId: string | null): Promise<{ ok: boolean }> {
  if (siteId == null || siteId === '') {
    const store = await cookies();
    store.set(SITE_COOKIE_NAME, ALL_SITES_COOKIE_VALUE, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: ONE_YEAR_S,
    });
    return { ok: true };
  }

  const valid = asSiteId(siteId);
  if (!valid) return { ok: false };

  const exists = await withOrgContext(async ({ client, userId }) => {
    const { rows } = await client.query<{ ok: boolean }>(
      `select true as ok
         from public.sites
        where org_id = app.current_org_id()
          and id = $1::uuid
          and is_active
        limit 1`,
      [valid],
    );
    if (rows.length === 0) return false;

    try {
      await assertUserSiteAccess(userId, valid, client);
      return true;
    } catch (error) {
      if (error instanceof SiteAccessError) return false;
      throw error;
    }
  });
  if (!exists) return { ok: false };

  const store = await cookies();
  store.set(SITE_COOKIE_NAME, valid, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: ONE_YEAR_S,
  });
  return { ok: true };
}
