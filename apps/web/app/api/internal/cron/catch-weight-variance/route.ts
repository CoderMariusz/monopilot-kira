/**
 * T-031 — POST /api/internal/cron/catch-weight-variance
 *
 * Nightly catch-weight variance roll-up (PRD §8.5). Walks every org, sets org
 * context per org, computes the per-(item,day) variance vs the org threshold,
 * upserts public.catch_weight_variance_daily, and emits
 * 'catch_weight.variance_exceeded' when avg variance breaches the threshold.
 *
 * Mirrors the d365-pull / outbox cron posture: a CONTROL-PLANE job on the system
 * actor (owner) pool for cross-tenant fan-out, but every business query runs
 * inside `app.set_org_context` per org so RLS-equivalent isolation holds.
 *
 * Auth: `x-vercel-cron: 1` OR `Authorization: Bearer ${CRON_SECRET}` (constant
 * time). Fail-closed in production when CRON_SECRET is unset.
 *
 * Day selection: defaults to yesterday (UTC) — the just-completed production day.
 * An explicit `?day=YYYY-MM-DD` query param overrides (used for backfill/tests).
 *
 * work_order_items is READ-ONLY here (08-PRODUCTION canonical). The job never
 * writes it.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  cronBearerMatches,
  getSystemActorConnection,
} from '@monopilot/db/system-actor-connection.js';
import {
  computeCatchWeightVarianceForOrg,
  type CatchWeightVarianceSummary,
} from '../../../../../lib/cron/catch-weight-variance';

const VERCEL_CRON_HEADER = 'x-vercel-cron';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authorizeCron(req: Request): boolean {
  if (req.headers.get(VERCEL_CRON_HEADER) === '1') return true;
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const presented = authHeader.slice(7).trim();
    const cronSecret = process.env.CRON_SECRET;
    if (cronBearerMatches(presented, cronSecret)) return true;
    if (!cronSecret && process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV) {
      return presented.length > 0;
    }
  }
  return false;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Yesterday (UTC) in YYYY-MM-DD — the just-completed production day. */
function defaultDay(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type PerOrgResult =
  | ({ orgId: string; status: 'completed' } & Omit<CatchWeightVarianceSummary, 'rows'>)
  | { orgId: string; status: 'error' };

/**
 * Run a single org's variance roll-up inside an owner-pool transaction with org
 * context set. Exported for unit testing the per-org path against a real DB.
 */
export async function runVarianceForOrg(
  pool: pg.Pool,
  orgId: string,
  day: string,
): Promise<PerOrgResult> {
  const sessionToken = randomUUID();
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const summary = await computeCatchWeightVarianceForOrg(client, orgId, day);
    await client.query('commit');
    return {
      orgId,
      status: 'completed',
      day: summary.day,
      itemsProcessed: summary.itemsProcessed,
      rowsWritten: summary.rowsWritten,
      alertsEmitted: summary.alertsEmitted,
    };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    console.error('[cron/catch-weight-variance] org failed', { orgId, err });
    return { orgId, status: 'error' };
  } finally {
    client.release();
    await pool
      .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
      .catch(() => undefined);
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!authorizeCron(req)) return json({ error: 'unauthorized' }, 401);

  const url = new URL(req.url);
  const dayParam = url.searchParams.get('day');
  if (dayParam && !DAY_RE.test(dayParam)) {
    return json({ error: 'invalid_day', message: 'day must be YYYY-MM-DD' }, 400);
  }
  const day = dayParam ?? defaultDay();

  let pool: ReturnType<typeof getSystemActorConnection>;
  try {
    pool = getSystemActorConnection();
  } catch {
    return json({ error: 'database_not_configured' }, 500);
  }

  try {
    const orgs = await pool.query<{ id: string }>(`select id from public.organizations`);

    const results: PerOrgResult[] = [];
    for (const row of orgs.rows) {
      results.push(await runVarianceForOrg(pool, row.id, day));
    }

    const completed = results.filter((r) => r.status === 'completed').length;
    const alerts = results.reduce(
      (acc, r) => acc + (r.status === 'completed' ? r.alertsEmitted : 0),
      0,
    );
    return json({ ok: true, day, orgs: results.length, completed, alerts, results }, 200);
  } catch (err) {
    console.error('[cron/catch-weight-variance] failed', err);
    return json(
      {
        error: 'catch_weight_variance_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      503,
    );
  } finally {
    await pool.end();
  }
}
