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

/** Cookie sentinel for an explicit "All sites" choice (not a uuid — never bound to SQL). */
export const ALL_SITES_COOKIE_VALUE = 'all';

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
    const raw = store.get(SITE_COOKIE_NAME)?.value;
    if (raw === ALL_SITES_COOKIE_VALUE) return null;
    const fromCookie = asSiteId(raw);
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

/** Outcome of {@link resolveWriteSiteId}. */
export type ResolveWriteSiteIdResult =
  | { ok: true; siteId: string }
  /** No site is resolvable and the org has 0 active sites, or >1 with none default. */
  | { ok: false; reason: 'no_active_site' | 'ambiguous_site' };

/**
 * Resolve the site id for a WRITE that must NOT silently persist site_id=NULL
 * (F10). Extends {@link getActiveSiteId} with a last-resort disambiguation: when
 * no explicit/cookie/default site resolves, but the org has exactly ONE active
 * site, that site is used (a single-site org is unambiguous). Anything else fails
 * closed with an actionable reason the caller surfaces in the UI:
 *   - `no_active_site`  — the org has zero active sites (onboarding not done).
 *   - `ambiguous_site`  — the org has >1 active site and none is the default, so
 *                         the operator must pick one via the top-bar selector.
 *
 * Requires an RLS-bound client (org context already set). Callers run inside
 * withOrgContext, so the query is org-scoped by RLS.
 */
export async function resolveWriteSiteId(
  client: SiteResolverClient,
  siteId?: string | null,
): Promise<ResolveWriteSiteIdResult> {
  const active = await getActiveSiteId({ siteId, client });
  if (active) return { ok: true, siteId: active };

  // No explicit/cookie/default site → fall back to the org's single active site
  // if unambiguous. Read up to 2 so we can distinguish one-vs-many.
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id::text as id
         from public.sites
        where org_id = app.current_org_id()
          and is_active
        order by is_default desc, site_code asc
        limit 2`,
    );
    if (rows.length === 1) {
      const only = asSiteId(rows[0]?.id);
      if (only) return { ok: true, siteId: only };
    }
    if (rows.length === 0) return { ok: false, reason: 'no_active_site' };
  } catch {
    // DB hiccup / no scope → cannot resolve; treat as no active site.
    return { ok: false, reason: 'no_active_site' };
  }

  // >1 active site and none is the default → operator must choose.
  return { ok: false, reason: 'ambiguous_site' };
}
