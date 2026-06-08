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
import pg from 'pg';
import { createServerSupabaseClient } from './supabase-server';

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
}

// ─── Pool factories (mirror lib/scim/middleware.ts pattern) ───────────────────
// We deliberately do not import @monopilot/db here because the owner pool is
// not exported (ESLint forbid). Owner credentials are required to insert into
// app.session_org_contexts (the table is revoked from app_user) before the
// app-role transaction can call app.set_org_context.

let ownerPool: pg.Pool | null = null;
let appPool: pg.Pool | null = null;

function getOwnerPool(): pg.Pool {
  if (ownerPool) return ownerPool;
  const cs = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error('withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL');
  }
  ownerPool = new Pool({ connectionString: cs });
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
  appPool = new Pool({ connectionString: url.toString() });
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
const resolveContextFromSupabase = cache(async function resolveContextFromSupabase(): Promise<{ userId: string; orgId: string }> {
  const supabase = await createServerSupabaseClient();

  // getUser() verifies the JWT against Supabase JWKS. NEVER use getSession()
  // for trust decisions — it returns whatever cookies hold without verifying.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    throw new Error(
      `withOrgContext: Supabase JWT verification failed${error ? `: ${error.message}` : ''}`,
    );
  }

  const userId = data.user.id;

  // Resolve org_id from public.users (authoritative) — NOT from JWT claims,
  // which can drift after admin moves a user between orgs.
  const owner = getOwnerPool();
  const res = await owner.query<{ org_id: string }>(
    `select org_id from public.users where id = $1::uuid`,
    [userId],
  );
  if (res.rowCount !== 1 || !res.rows[0]?.org_id) {
    throw new Error(
      `withOrgContext: no public.users row resolves org_id for verified user ${userId}`,
    );
  }

  return { userId, orgId: res.rows[0].org_id };
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
  // TEMP perf instrumentation (post-fra1 breakdown). Short keys survive log truncation:
  // T=total r=resolve(getUser+org) g=owner-register c=app-connect s=set-ctx a=action.
  const t0 = Date.now();
  const { userId, orgId } = isTestEnvWithStub()
    ? await resolveContextFromTestStub()
    : await resolveContextFromSupabase().catch((err) => annotateOrgContextError('resolve_context', err));
  const tResolve = Date.now();

  // Fresh session_token per call — guarantees no collision in
  // app.active_org_contexts across concurrent requests on the same backend PID
  // and avoids re-using a stale token registered by a previous call.
  const sessionToken = randomUUID();

  const owner = getOwnerPool();
  await owner
    .query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
      [sessionToken, orgId],
    )
    .catch((err) => annotateOrgContextError('owner_register_session', err));
  const tRegister = Date.now();

  const app = getAppPool();
  const client = await app.connect().catch((err) => annotateOrgContextError('app_pool_connect', err));
  const tConnect = Date.now();
  try {
    await client.query('begin').catch((err) => annotateOrgContextError('begin', err));
    await client
      .query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId])
      .catch((err) => annotateOrgContextError('set_org_context', err));
    const tSetctx = Date.now();
    const result = await action({ userId, orgId, sessionToken, client });
    const tAction = Date.now();
    await client.query('commit');
    console.error(
      `[perf-woc] T=${Date.now() - t0} r=${tResolve - t0} g=${tRegister - tResolve} c=${tConnect - tRegister} s=${tSetctx - tConnect} a=${tAction - tSetctx}`,
    );
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
