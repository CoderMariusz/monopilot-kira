/**
 * ADR (P2.13): direct `pg.Pool` instantiation
 *
 * This module deliberately violates the repo-wide "use the managed pools from
 * @monopilot/db" convention because:
 *
 *   1. It needs to manage TWO connections per call:
 *        - an OWNER pool (BYPASSRLS) for the privileged INSERT into
 *          `app.session_org_contexts` before the app-role transaction, and
 *        - an APP pool (RLS-enforcing app_user) for the action body bound to
 *          the same `session_token`.
 *      The packaged `@monopilot/db` deliberately does not export the owner
 *      pool (and lints forbid importing it from app code), and it doesn't
 *      surface a paired-credential helper for this two-role flow.
 *
 *   2. The app pool's connection-string env (`DATABASE_URL_APP`) and
 *      credentials differ from the global manage-pool config; sharing pool
 *      instances would either leak `app_user` credentials into the BYPASSRLS
 *      code paths, or downgrade BYPASSRLS code paths to RLS-enforcing ones.
 *
 *   3. The owner pool is request-scoped in spirit — connections are acquired
 *      and released per-call so a single mis-set context can't leak across
 *      unrelated requests on the same pooled connection.
 *
 * If the no-pg-pool lint rule fires here, suppress with:
 *   // eslint-disable-next-line no-restricted-syntax -- intentional per ADR above
 *
 * Sibling exception: `apps/web/lib/scim/middleware.ts` instantiates `pg.Pool`
 * for the same reason (privileged SCIM token verification path that needs the
 * owner pool the SDK does not export). Treat both modules as the canonical
 * exceptions and prefer the @monopilot/db pools everywhere else.
 */

/**
 * T-062 — `withOrgContext` HOF for Server Actions and Route Handlers.
 *
 * MUST wrap every Server Action that touches the data plane. Replaces the
 * ad-hoc `app.set_org_context` calls scattered across routes/actions and the
 * env-stub session resolution (`NEXT_SERVER_ACTION_*`) that this branch
 * documents as the P0 carry-forward blocker.
 *
 * Contract (red lines):
 *   1. Verifies the Supabase JWT via `supabase.auth.getUser()` — does NOT
 *      trust cookies / `getSession()`. `getUser()` hits Supabase auth and
 *      validates the access token signature against the project JWKS.
 *   2. Resolves `org_id` from `public.users.org_id` for the verified user
 *      (NOT from JWT claims, which can drift). If the user has no row or the
 *      lookup fails → throws. Never silently grants empty context.
 *   3. Mints a fresh `session_token` (uuid) per call and registers it in
 *      `app.session_org_contexts` so `app.set_org_context` will accept it.
 *      A unique session_token per call avoids stale `active_org_contexts`
 *      collisions across concurrent requests on the same backend PID.
 *   4. Opens a transaction on the **app-role** pool (RLS-scoped), calls
 *      `select app.set_org_context($token, $org)` inside that transaction,
 *      runs the user callback, then COMMIT on success / ROLLBACK on error.
 *   5. Best-effort cleanup of the session_org_contexts row in finally{}.
 *
 * Throws on any verification / lookup failure — callers MUST treat the
 * promise rejection as 401/403 surface area, not silently render.
 *
 * Test fallback: when `NODE_ENV === 'test'` AND `process.env.VITEST` is
 * set AND `NEXT_SERVER_ACTION_ACTOR_USER_ID` + `NEXT_SERVER_ACTION_ORG_ID`
 * are both present, the env stub is honored. Production path NEVER reads
 * those envs.
 */

import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import pg from 'pg';
import { getCachedUser } from './supabase-server';

const { Pool } = pg;

export interface OrgContext {
  /** Supabase-verified user id (auth.users.id). */
  userId: string;
  /** Resolved from public.users.org_id for the verified user. */
  orgId: string;
  /** Fresh per-call session token registered in app.session_org_contexts. */
  sessionToken: string;
  /** App-role pool client inside the org-context transaction. */
  client: pg.PoolClient;
  /** True when a platform admin is acting inside a non-home org context. */
  actAsOrg: boolean;
}

// ─── Pool factories (mirror lib/scim/middleware.ts pattern) ───────────────────
// We deliberately do not import @monopilot/db here because the owner pool is
// not exported (ESLint forbid). Owner credentials are required to insert into
// app.session_org_contexts (the table is revoked from app_user) before the
// app-role transaction can call app.set_org_context.

let ownerPool: pg.Pool | null = null;
let appPool: pg.Pool | null = null;

// Pool tuning rationale (2026-06-25 pool-EXHAUSTION fix — supersedes the 06-24
// idle-timeout-only tuning, which was insufficient):
//   ROOT CAUSE: on Vercel the lambda FREEZES between invocations, so the JS
//   event loop stops and pg's `idleTimeoutMillis` timer NEVER FIRES while frozen
//   — a warm-but-frozen lambda keeps up to `max` connections open on the
//   SESSION-mode Supavisor pooler (pool_size=15). With the old default max:10 on
//   BOTH the app and owner pools, ONE frozen lambda could pin ~20 client slots;
//   a few lambdas exhausted the 15-slot pool → EMAXCONNSESSION → the whole app
//   shell degraded ("Live data unavailable", nav collapses to Dashboard).
//   FIX: cap each pool small so a frozen lambda's footprint stays within budget.
//     - appPool max:4  — enough for the project-detail ~5-7-way fan-out to run
//       mostly-parallel (the rest queue briefly, well under connectionTimeout);
//       the heaviest fan-out (/reporting) was already collapsed to ONE
//       withOrgContext via reportingBundle (#64).
//     - ownerPool max:2 — owner queries are single autocommit statements
//       (register/delete session_org_contexts, users lookup), held for ms only.
//   DURABLE FIX (owner / Vercel-env action, NOT code): point DATABASE_URL_APP /
//   DATABASE_URL_OWNER at the TRANSACTION-mode pooler (port 6543) — it
//   multiplexes a server connection per-transaction, so pool_size 15 supports
//   far more concurrent clients. The app is compatible: app.set_org_context runs
//   INSIDE the begin/commit txn, and all owner queries are single statements.
//   connectionTimeoutMillis: fail fast (clear error) instead of hanging when the
//   pooler is saturated. idleTimeoutMillis: drain fast when the lambda IS awake.
const APP_POOL_MAX = 4;
const OWNER_POOL_MAX = 2;
const POOL_TUNING = { idleTimeoutMillis: 5_000, connectionTimeoutMillis: 8_000 } as const;

/**
 * Owner (BYPASSRLS) pool. Exported so the site-context composition
 * (`apps/web/lib/auth/with-site-context.ts`) can register its own
 * `app.session_site_contexts` rows on the SAME privileged pool rather than
 * opening a second owner pool — the trust tables are revoked from app_user, so
 * this INSERT cannot run on the app-role pool. Do NOT use this for data-plane
 * reads/writes: it bypasses RLS by design.
 */
export function getOwnerPool(): pg.Pool {
  if (ownerPool) return ownerPool;
  const cs = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error('withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL');
  }
  ownerPool = new Pool({ connectionString: cs, max: OWNER_POOL_MAX, ...POOL_TUNING });
  return ownerPool;
}

function getAppPool(): pg.Pool {
  if (appPool) return appPool;
  const cs = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error('withOrgContext requires DATABASE_URL_APP or DATABASE_URL');
  }
  // Mirror packages/db/src/clients.ts: when DATABASE_URL_APP is unset (test
  // environment), rewrite the username to app_user so RLS engages.
  const url = new URL(cs);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  }
  appPool = new Pool({ connectionString: url.toString(), max: APP_POOL_MAX, ...POOL_TUNING });
  return appPool;
}

// ─── Test-only env-stub fallback ──────────────────────────────────────────────

function isTestEnvWithStub(): boolean {
  return (
    process.env.NODE_ENV === 'test' &&
    !!process.env.VITEST &&
    !!process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID &&
    !!process.env.NEXT_SERVER_ACTION_ORG_ID
  );
}

async function resolveContextFromTestStub(): Promise<{ userId: string; orgId: string }> {
  return {
    userId: process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID as string,
    orgId: process.env.NEXT_SERVER_ACTION_ORG_ID as string,
  };
}

// ─── Production resolver ──────────────────────────────────────────────────────

const PLATFORM_ORG_COOKIE = 'mp_platform_org';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readPlatformOrgOverrideCookie(): Promise<{ raw: string | null; orgId: string | null }> {
  try {
    const store = await cookies();
    const value = store.get(PLATFORM_ORG_COOKIE)?.value;
    if (typeof value !== 'string' || value.length === 0) {
      return { raw: null, orgId: null };
    }
    return { raw: value, orgId: UUID_RE.test(value) ? value : null };
  } catch {
    return { raw: null, orgId: null };
  }
}

async function logIgnoredPlatformOrgCookie(
  owner: pg.Pool,
  userId: string,
  homeOrgId: string,
  requestedOrgId: string,
  reason: string,
): Promise<void> {
  await owner.query(
    `insert into app.platform_audit
       (actor_user_id, home_org_id, target_org_id, action, reason, metadata)
     values
       ($1::uuid, $2::uuid, null, 'platform.act_as.ignored_cookie', $3, $4::jsonb)`,
    [
      userId,
      homeOrgId,
      reason,
      JSON.stringify({ requested_org_id: requestedOrgId }),
    ],
  );
}

/**
 * Resolve { userId, orgId } from the Supabase session, MEMOISED PER REQUEST.
 *
 * Wrapped in React `cache()` so the JWT/JWKS verification (`getUser()`) + the
 * `public.users` org lookup run AT MOST ONCE per request, no matter how many
 * `withOrgContext` calls a page/action makes. A project-detail page fans out to
 * ~5-7 withOrgContext calls (layout getProject + canAdvance/canDelete + each
 * stage loader); without this each one re-verified the JWT over the network and
 * re-queried users — the dominant page-load latency + a connection-pool driver.
 * The per-connection session registration + set_org_context still run per call
 * (each app connection needs its own org binding) — only the resolution is shared.
 */
export const resolveContextFromSupabase = cache(async function resolveContextFromSupabase(): Promise<{ userId: string; orgId: string; actAsOrg: boolean }> {
  // getUser() verifies the JWT against Supabase JWKS. NEVER use getSession()
  // for trust decisions — it returns whatever cookies hold without verifying.
  const { data, error } = await getCachedUser();
  if (error || !data?.user?.id) {
    throw new Error(
      `withOrgContext: Supabase JWT verification failed${error ? `: ${error.message}` : ''}`,
    );
  }

  const userId = data.user.id;

  // Resolve org_id from public.users (authoritative) — NOT from JWT claims,
  // which can drift after admin moves a user between orgs.
  const owner = getOwnerPool();
  const res = await owner.query<{ org_id: string; is_active: boolean }>(
    `select org_id, is_active from public.users where id = $1::uuid`,
    [userId],
  );
  if (res.rowCount !== 1 || !res.rows[0]?.org_id) {
    throw new Error(
      `withOrgContext: no public.users row resolves org_id for verified user ${userId}`,
    );
  }
  if (res.rows[0].is_active === false) {
    throw new Error(`withOrgContext: user ${userId} is deactivated`);
  }

  const homeOrgId = res.rows[0].org_id;
  const requested = await readPlatformOrgOverrideCookie();
  if (!requested.raw) {
    return { userId, orgId: homeOrgId, actAsOrg: false };
  }
  if (!requested.orgId) {
    await logIgnoredPlatformOrgCookie(owner, userId, homeOrgId, requested.raw, 'invalid_cookie');
    return { userId, orgId: homeOrgId, actAsOrg: false };
  }

  const admin = await owner.query<{ ok: boolean }>(
    `select true as ok
       from app.platform_admins
      where user_id = $1::uuid
        and revoked_at is null
      limit 1`,
    [userId],
  );
  if (admin.rows.length === 0) {
    await logIgnoredPlatformOrgCookie(owner, userId, homeOrgId, requested.orgId, 'not_platform_admin');
    return { userId, orgId: homeOrgId, actAsOrg: false };
  }

  const target = await owner.query<{ id: string }>(
    `select id::text as id from public.organizations where id = $1::uuid limit 1`,
    [requested.orgId],
  );
  if (target.rows.length === 0) {
    await logIgnoredPlatformOrgCookie(owner, userId, homeOrgId, requested.orgId, 'target_org_not_found');
    return { userId, orgId: homeOrgId, actAsOrg: false };
  }

  return { userId, orgId: requested.orgId, actAsOrg: true };
});

// ─── Public HOF ───────────────────────────────────────────────────────────────

/**
 * Resolve a verified Supabase session, register a fresh session token, open
 * an app-role transaction with `app.set_org_context` applied, and run `action`
 * inside it. COMMIT on success, ROLLBACK on throw.
 *
 * @example
 *   await withOrgContext(async ({ userId, orgId, client }) => {
 *     return _upsertDeptColumnDraft({ actorUserId: userId, orgId, ... });
 *   });
 */
/**
 * Tag a thrown error with the `withOrgContext` phase that produced it and the
 * structured pg diagnostics (code/detail/routine) that the higher-level page
 * loaders otherwise discard (they log only `error.message`). This turns an
 * opaque "could not be loaded" surface into a root-causable runtime log line
 * without changing control flow — the original error is always re-thrown.
 */
function annotateOrgContextError(phase: string, err: unknown): never {
  const pg = err as { code?: string; detail?: string; routine?: string; severity?: string } | undefined;
  const diag = {
    phase,
    message: err instanceof Error ? err.message : String(err),
    code: pg?.code,
    detail: pg?.detail,
    routine: pg?.routine,
    severity: pg?.severity,
  };
  console.error('[withOrgContext] phase_failed', diag);
  throw err;
}

export async function withOrgContext<T>(
  action: (ctx: OrgContext) => Promise<T>,
): Promise<T> {
  const { userId, orgId, actAsOrg } = isTestEnvWithStub()
    ? { ...(await resolveContextFromTestStub()), actAsOrg: false }
    : await resolveContextFromSupabase().catch((err) => annotateOrgContextError('resolve_context', err));

  // Fresh session_token per call — guarantees no collision in
  // app.active_org_contexts across concurrent requests on the same backend PID
  // and avoids re-using a stale token registered by a previous call.
  const sessionToken = randomUUID();

  const owner = getOwnerPool();
  await owner
    .query(
      // mig 382: register the authenticated user_id on the OWNER pool (app_user
      // cannot write this table), so app.set_org_context can copy it into the
      // active context and app.current_user_id() returns an unspoofable user for
      // the per-user-site RLS policies. set_org_context stays 2-arg (it reads the
      // user_id from this trusted row, never from a caller-supplied param).
      `insert into app.session_org_contexts (session_token, org_id, user_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [sessionToken, orgId, userId],
    )
    .catch((err) => annotateOrgContextError('owner_register_session', err));

  const app = getAppPool();
  const client = await app.connect().catch((err) => annotateOrgContextError('app_pool_connect', err));
  try {
    await client.query('begin').catch((err) => annotateOrgContextError('begin', err));
    await client
      .query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId])
      .catch((err) => annotateOrgContextError('set_org_context', err));
    const result = await action({ userId, orgId, sessionToken, client, actAsOrg });
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      /* noop — connection may already be in a bad state */
    }
    throw err;
  } finally {
    client.release();
    // Best-effort cleanup so app.session_org_contexts doesn't accumulate.
    // If this delete fails (network blip, owner-pool exhaustion, process
    // crash) the row is leaked. GC for those orphans is handled by
    // `app.gc_session_org_contexts(p_max_age_seconds)` — see migration
    // packages/db/migrations/031-session-org-contexts-janitor.sql. The
    // operator wires that function to a 5-minute cron with a default
    // 10-minute TTL so leaks are cleaned up out-of-band.
    try {
      await owner.query(
        `delete from app.session_org_contexts where session_token = $1::uuid`,
        [sessionToken],
      );
    } catch {
      /* noop */
    }
  }
}
