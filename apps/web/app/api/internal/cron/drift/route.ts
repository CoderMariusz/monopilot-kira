/**
 * T-034 — GET /api/internal/cron/drift
 *
 * Daily Vercel cron entry point that walks every organization and invokes
 * `detectDrift` from @monopilot/ops. Drift findings are persisted as
 * `audit_events` rows with retention_class='operational' (T-009 risk red line)
 * inside `detectDrift` itself.
 *
 * Auth contract (AC3):
 *   - 401 when neither `x-vercel-cron: 1` nor `Authorization: Bearer ${CRON_SECRET}`
 *     is present.
 *   - In production (`NODE_ENV=production`) the route is fail-closed: if
 *     CRON_SECRET is unset, only Vercel-platform cron requests carrying
 *     `x-vercel-cron: 1` (which Vercel guarantees) are accepted. Bearer auth
 *     is rejected when the env var is missing — mirrors the T-014 HMAC and
 *     T-016 PIN env-guard pattern.
 *
 * NOTE: this file deliberately does NOT import any Next.js types so that the
 * Vitest E2E in `packages/ops` can load it directly via dynamic import using
 * the Web `Request`/`Response` globals provided by Node 20.
 */

import { detectDrift } from '@monopilot/ops';
import {
  cronBearerMatches,
  getSystemActorConnection,
} from '@monopilot/db/system-actor-connection.js';

const VERCEL_CRON_HEADER = 'x-vercel-cron';

interface AuthDecision {
  ok: boolean;
  reason?: string;
}

/** Fail-closed cron auth: accept Vercel platform cron OR Bearer CRON_SECRET. */
function authorizeCron(req: Request): AuthDecision {
  const cronSecret = process.env.CRON_SECRET;

  // Vercel platform cron — header is set by Vercel and stripped from
  // user-supplied requests on the platform layer. Always accepted.
  if (req.headers.get(VERCEL_CRON_HEADER) === '1') {
    return { ok: true };
  }

  // Bearer-token path. Fail-closed in production when CRON_SECRET is unset.
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const presented = authHeader.slice(7).trim();
    // T-062 hardening: constant-time comparison to defeat timing oracles
    // (a `===` compare on long secrets leaks a few bits per request).
    if (cronBearerMatches(presented, cronSecret)) {
      return { ok: true };
    }
    // T-062 hardening: tighten the fallback so it ONLY fires on a developer
    // laptop. NODE_ENV='development' alone was permissive — Vercel preview
    // and staging deployments often run with NODE_ENV !== 'production' but
    // ARE internet-reachable. The extra `!process.env.VERCEL_ENV` guard
    // ensures preview / staging on Vercel still requires CRON_SECRET.
    if (!cronSecret && process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV) {
      // Dev-only fallback: accept any non-empty bearer for local smoke tests.
      if (presented.length > 0) return { ok: true };
    }
    return { ok: false, reason: 'invalid_bearer' };
  }

  return { ok: false, reason: 'no_cron_signal' };
}

export async function GET(req: Request): Promise<Response> {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let pool: ReturnType<typeof getSystemActorConnection>;
  try {
    pool = getSystemActorConnection();
  } catch {
    return new Response(
      JSON.stringify({ error: 'database_not_configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const orgs = await pool.query<{ id: string }>(`SELECT id FROM public.organizations`);

    let driftFound = 0;
    for (const { id: orgId } of orgs.rows) {
      const result = await detectDrift({ orgId, pool });
      if (result.audited) driftFound += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, orgs_checked: orgs.rowCount ?? 0, drift_found: driftFound }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'drift_detect_failed', message: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  } finally {
    await pool.end();
  }
}
