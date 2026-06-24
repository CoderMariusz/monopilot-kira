/**
 * 14-multi-site — active-site resolution seam (CL4 cookie seam + the
 * `withSiteContext` backbone).
 *
 * The desktop shell's site picker persists the selected site in a plain
 * server-readable cookie (`mp_site_id`). Both the legacy read-filter seam and
 * the new `withSiteContext` HOF (apps/web/lib/auth/with-site-context.ts)
 * resolve the active site through `getActiveSiteId()`.
 *
 * Resolution order (first hit wins):
 *   1. explicit `siteId` arg (validated to a uuid),
 *   2. the `mp_site_id` cookie,
 *   3. the org's DEFAULT site — `public.sites WHERE is_default` for the bound
 *      org (V-MS-01 guarantees at most one). NOTE: there is no
 *      `organizations.default_site_id` column — the default lives on the sites
 *      row. Requires an RLS-bound pg client (org context already set), so this
 *      branch is taken only when a `client` is supplied (i.e. from
 *      withSiteContext, which runs inside the org transaction).
 *
 * Returns `null` ONLY when the org genuinely resolves no site (no cookie, no
 * default, or no request/DB scope at all — tests / static render). `null` is
 * the explicit "All sites" sentinel: a read scopes to every visible site, a
 * write fails closed (see withSiteContext).
 *
 * Callable from a Route Handler / RSC: the cookie branch uses `next/headers`
 * `cookies()`, which is request-scoped in both. The top-bar site switcher and
 * its read paths call the no-arg form unchanged (backward compatible).
 */

import { cookies } from 'next/headers';

export const SITE_COOKIE_NAME = 'mp_site_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Narrow an untrusted value to a uuid site id, else null ("All sites"). */
export function asSiteId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/** Minimal pg-client shape needed for the org-default lookup (avoids a `pg` import here). */
interface SiteResolverClient {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
}

export interface GetActiveSiteIdOptions {
  /** Explicit override — validated to a uuid, wins over cookie + default. */
  siteId?: string | null;
  /**
   * RLS-bound pg client (org context already set). When supplied and neither
   * an explicit id nor the cookie resolves, the org's default site is queried.
   * Omit it (the legacy no-arg form) to keep the cookie-only behaviour.
   */
  client?: SiteResolverClient;
}

/**
 * Resolve the active site id (explicit arg -> cookie -> org default). See the
 * module doc for the full contract. Returns null = "All sites".
 */
export async function getActiveSiteId(
  options: GetActiveSiteIdOptions = {},
): Promise<string | null> {
  // 1. Explicit override (validated).
  const explicit = asSiteId(options.siteId);
  if (explicit) return explicit;

  // 2. Cookie (request-scoped; absent in tests / static render).
  try {
    const store = await cookies();
    const fromCookie = asSiteId(store.get(SITE_COOKIE_NAME)?.value);
    if (fromCookie) return fromCookie;
  } catch {
    // No request scope → fall through to the org-default lookup (if a client
    // was supplied) or to null.
  }

  // 3. Org default site. RLS scopes the query to the bound org, so a plain
  //    `is_default` filter returns this org's default only (V-MS-01: ≤1).
  if (options.client) {
    try {
      const { rows } = await options.client.query<{ id: string }>(
        `select id::text as id
           from public.sites
          where org_id = app.current_org_id()
            and is_default
            and is_active
          limit 1`,
      );
      const fromDefault = asSiteId(rows[0]?.id);
      if (fromDefault) return fromDefault;
    } catch {
      // DB hiccup / no scope → genuinely no resolvable site.
    }
  }

  // Genuinely no site for this org.
  return null;
}
