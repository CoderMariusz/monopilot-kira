/**
 * 14-multi-site — `withSiteContext` HOF (the site-scoping backbone).
 *
 * Composes ON TOP of `withOrgContext` (apps/web/lib/auth/with-org-context.ts).
 * That wrapper already:
 *   - verifies the Supabase JWT and resolves { userId, orgId },
 *   - registers a per-call org session token in `app.session_org_contexts`,
 *   - opens an app-role transaction and runs `app.set_org_context($t,$org)`,
 *   - COMMITs on a plain return / ROLLBACKs on any throw.
 *
 * `withSiteContext` reuses that exact transaction. Inside the same app-role
 * client (so it shares the begin/commit envelope), it additionally:
 *   1. resolves the active site id (explicit arg -> mp_site_id cookie -> the
 *      org's default site) via {@link getActiveSiteId},
 *   2. for a WRITE caller with NO resolvable site, FAILS CLOSED by throwing a
 *      {@link NoActiveSiteError} (reason 'no_active_site') BEFORE the body runs —
 *      this surfaces as a ROLLBACK through withOrgContext, never a silent
 *      org-wide write,
 *   3. registers a per-call site session token in `app.session_site_contexts`
 *      (owner pool — the table is revoked from app_user, mirroring how
 *      withOrgContext registers `app.session_org_contexts`),
 *   4. runs `select app.set_site_context($siteToken, $siteId)` on the SAME
 *      app-role client so the `app.current_site_id()` GUC reader returns the
 *      bound site for the rest of the transaction. siteId === null is the
 *      explicit super_admin / ALL-sites mode (V-MS-07).
 *
 * Read semantics: a READ caller may pass `{ mode: 'read' }`. When no site
 * resolves it does NOT throw — it binds the ALL-sites context (site_id NULL).
 * Because the RLS policies are written as
 *   `org_id = app.current_org_id()
 *    AND (app.current_site_id() is null OR site_id = app.current_site_id())`,
 * a NULL bound site behaves as "every site this org_id can see" — the existing
 * cookie-filter behaviour, now enforced at the data plane. Integrators MUST
 * write `site_id = siteId` on INSERT: with a specific bound site, NULL row
 * `site_id` now fails the policy WITH CHECK.
 *
 * Why two pools (owner + app) — see the ADR at the top of with-org-context.ts:
 * the `app.session_*_contexts` trust tables are revoked from `app_user`, so the
 * privileged INSERT must run on the OWNER pool, while the body + the
 * `set_*_context` call run on the RLS-enforcing APP pool. We reuse
 * withOrgContext's owner pool through {@link registerSiteSession} rather than
 * re-opening one here.
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext, type OrgContext, getOwnerPool } from './with-org-context';
import { getActiveSiteId } from '../site/site-context';

/** Context handed to a `withSiteContext` body — OrgContext + the bound site. */
export interface SiteContext extends OrgContext {
  /**
   * The site bound for this transaction (and returned by `app.current_site_id()`).
   * `null` = ALL-sites / super_admin mode (V-MS-07).
   */
  siteId: string | null;
}

/**
 * 'write' (default): no resolvable site => throw NoActiveSiteError (fail closed).
 * 'read': no resolvable site => bind ALL-sites (site_id NULL), do NOT throw.
 */
export type SiteContextMode = 'write' | 'read';

export interface WithSiteContextOptions {
  /** Skip cookie/default resolution and bind exactly this site (or NULL for ALL-sites). */
  siteId?: string | null;
  /** Fail-closed (write) vs scope-to-empty (read). Defaults to 'write'. */
  mode?: SiteContextMode;
}

/**
 * Thrown by a WRITE-mode `withSiteContext` when no active site can be resolved.
 * Callers (Server Actions) should map this to a user-facing error that names
 * Settings -> Sites. The `reason` discriminant lets the action layer branch
 * without string-matching the message.
 */
export class NoActiveSiteError extends Error {
  readonly reason = 'no_active_site' as const;
  constructor(
    message = 'No active site selected. Pick a site from the top-bar switcher, or set a default site in Settings -> Sites.',
  ) {
    super(message);
    this.name = 'NoActiveSiteError';
  }
}

/**
 * Register a fresh site session token in `app.session_site_contexts` using the
 * OWNER pool (the table is revoked from app_user). Mirrors the
 * `app.session_org_contexts` INSERT inside withOrgContext. Returns the token to
 * feed `app.set_site_context`.
 *
 * The wrapper self-cleans this row in a best-effort finally after the
 * withOrgContext envelope closes. If the DELETE fails, the row grants nothing
 * without a matching active_site_contexts backend binding.
 */
async function registerSiteSession(
  userId: string,
  orgId: string,
  siteId: string | null,
): Promise<string> {
  const siteToken = randomUUID();
  const owner = getOwnerPool();
  await owner.query(
    `insert into app.session_site_contexts (session_token, user_id, org_id, site_id)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    [siteToken, userId, orgId, siteId],
  );
  return siteToken;
}

/**
 * Resolve a verified org context, resolve + bind the active site, then run
 * `action` inside withOrgContext's transaction. COMMIT on plain return /
 * ROLLBACK on throw — inherited from withOrgContext (do NOT add a second
 * commit/rollback here; the body runs INSIDE its envelope).
 *
 * Overloads:
 *   withSiteContext(action)                          // write mode, auto-resolve
 *   withSiteContext(siteId, action)                  // bind explicit site (write mode)
 *   withSiteContext(options, action)                 // full control (mode/siteId)
 *
 * @throws NoActiveSiteError  write mode + no resolvable active site (fail closed).
 *
 * @example  // write — fails closed if no site:
 *   await withSiteContext(async ({ siteId, client }) => {
 *     await client.query('insert into public.foo (org_id, site_id, ...) values (app.current_org_id(), $1, ...)', [siteId]);
 *   });
 *
 * @example  // read — scopes to the active site, or ALL-sites if none:
 *   const rows = await withSiteContext({ mode: 'read' }, async ({ client }) =>
 *     (await client.query('select * from public.foo')).rows,
 *   );
 */
export function withSiteContext<T>(action: (ctx: SiteContext) => Promise<T>): Promise<T>;
export function withSiteContext<T>(
  siteId: string | null,
  action: (ctx: SiteContext) => Promise<T>,
): Promise<T>;
export function withSiteContext<T>(
  options: WithSiteContextOptions,
  action: (ctx: SiteContext) => Promise<T>,
): Promise<T>;
export function withSiteContext<T>(
  arg1:
    | ((ctx: SiteContext) => Promise<T>)
    | string
    | null
    | WithSiteContextOptions,
  arg2?: (ctx: SiteContext) => Promise<T>,
): Promise<T> {
  // Normalise the overloads into { options, action }.
  let options: WithSiteContextOptions;
  let action: (ctx: SiteContext) => Promise<T>;

  if (typeof arg1 === 'function') {
    options = {};
    action = arg1;
  } else if (typeof arg2 === 'function') {
    action = arg2;
    if (arg1 === null || typeof arg1 === 'string') {
      // Explicit site id form: a provided value is authoritative — including
      // an explicit `null`, which means "bind ALL-sites" and therefore must
      // NOT fail closed. Default unprovided -> write.
      options = { siteId: arg1, mode: 'write' };
    } else {
      options = arg1;
    }
  } else {
    throw new TypeError('withSiteContext: an action callback is required');
  }

  const mode: SiteContextMode = options.mode ?? 'write';
  // Explicit undefined is treated as "not provided" so callers cannot
  // accidentally skip write-mode fail-closed resolution with { siteId: undefined }.
  const hasExplicitSite =
    Object.prototype.hasOwnProperty.call(options, 'siteId') &&
    options.siteId !== undefined;

  let siteToken: string | null = null;

  return withOrgContext<T>(async (orgCtx) => {
    // Resolve the active site. Explicit arg wins (including explicit null =
    // ALL-sites); otherwise getActiveSiteId does cookie -> org-default. We pass
    // orgCtx.client so the org-default lookup runs inside the bound org tx.
    const resolvedSiteId: string | null = hasExplicitSite
      ? options.siteId ?? null
      : await getActiveSiteId({ client: orgCtx.client });

    // Fail closed: a WRITE with no resolvable site must NOT silently write
    // org-wide. An explicit null arg is a deliberate ALL-sites bind and is
    // allowed even in write mode (super_admin path); only an UNRESOLVED site
    // (no arg, no cookie, no org default) trips the guard.
    if (mode === 'write' && resolvedSiteId === null && !hasExplicitSite) {
      throw new NoActiveSiteError();
    }

    // Register + bind the site on the SAME app-role client/transaction so
    // app.current_site_id() returns it for the body. Throwing here rolls the
    // whole withOrgContext transaction back.
    siteToken = await registerSiteSession(
      orgCtx.userId,
      orgCtx.orgId,
      resolvedSiteId,
    );
    await orgCtx.client.query(`select app.set_site_context($1::uuid, $2::uuid)`, [
      siteToken,
      resolvedSiteId,
    ]);

    return action({ ...orgCtx, siteId: resolvedSiteId });
  }).finally(async () => {
    if (siteToken === null) {
      return;
    }

    const owner = getOwnerPool();
    try {
      await owner.query(
        `delete from app.session_site_contexts where session_token = $1::uuid`,
        [siteToken],
      );
    } catch {
      /* noop */
    }
  });
}
