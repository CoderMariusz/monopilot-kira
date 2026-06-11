/**
 * 14-multi-site — active-site read seam (first honest vertical, CL4).
 *
 * The desktop shell's site picker persists the selected site in a plain
 * server-readable cookie (`mp_site_id`). Server Components read it via
 * `getActiveSiteId()` and pass the value as an OPTIONAL filter param into the
 * read actions that are explicitly site-wired (production WO list, warehouse
 * LP list, OEE dashboard). No cookie / invalid cookie = "All sites" = no
 * filter — identical to today's behaviour, so unwired screens are unaffected.
 *
 * This is deliberately NOT `withSiteContext` / `app.current_site_id()` RLS
 * scoping (14-multi-site T-001/T-030 backlog) — it is read-side filtering
 * only, additive and reversible. When the site HOF lands, this cookie becomes
 * its UI seam.
 */

import { cookies } from 'next/headers';

export const SITE_COOKIE_NAME = 'mp_site_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Narrow an untrusted value to a uuid site id, else null ("All sites"). */
export function asSiteId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/**
 * Read the active site id from the request cookie. Returns null ("All sites")
 * when the cookie is absent, malformed, or when no request scope exists
 * (tests / static rendering) — degrading to the unfiltered behaviour.
 */
export async function getActiveSiteId(): Promise<string | null> {
  try {
    const store = await cookies();
    return asSiteId(store.get(SITE_COOKIE_NAME)?.value);
  } catch {
    // No request scope (tests / static render) → All sites.
    return null;
  }
}
