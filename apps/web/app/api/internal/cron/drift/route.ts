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

import { detectDrift } from '../../../../../../../packages/ops/src/drift-detect';
import pg from 'pg';

const VERCEL_CRON_HEADER = 'x-vercel-cron';

interface AuthDecision {
  ok: boolean;
  reason?: string;
}

/** Fail-closed cron auth: accept Vercel platform cron OR Bearer CRON_SECRET. */
function authorizeCron(req: Request): AuthDecision {
  const isProd = process.env.NODE_ENV === 'production';
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
    if (cronSecret && presented === cronSecret) {
      return { ok: true };
    }
    if (!cronSecret && !isProd) {
      // Dev/test fallback: accept any non-empty bearer to make local cron
      // smoke tests possible without polluting production env vars.
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

  // Iterate organizations and run drift detection per-org. We use a single
  // pool to avoid opening one connection per org. Owner-pool reads are
  // acceptable here — the job runs as the system actor and only touches
  // information_schema + Reference.DeptColumns + audit_events.
  const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) {
    return new Response(
      JSON.stringify({ error: 'database_not_configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // T-058 lint exception: the cron route runs as the system actor and reads
  // information_schema + writes audit_events with retention_class='operational'
  // (T-009). The managed @monopilot/db app pool would be RLS-scoped to a
  // single org context, which is incompatible with the per-org sweep.
  // eslint-disable-next-line no-restricted-syntax
  const pool = new pg.Pool({ connectionString });
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
