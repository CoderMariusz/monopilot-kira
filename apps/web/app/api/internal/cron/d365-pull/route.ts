/**
 * T-028 — POST /api/internal/cron/d365-pull
 *
 * Nightly D365 pull cron (PRD §13.3, default 02:00 org-local). Walks every org
 * with `integration.d365.enabled=true`, asserts the gate, then enqueues +
 * processes an `items` pull job per org. Mirrors the outbox-cron posture: a
 * CONTROL-PLANE job on the owner pool (cross-tenant fan-out), but every business
 * query is scoped via `app.set_org_context` per org so RLS-equivalent isolation
 * holds even though the role is BYPASSRLS.
 *
 * Auth: `x-vercel-cron: 1` OR `Authorization: Bearer ${CRON_SECRET}` (constant
 * time). Fail-closed in production when CRON_SECRET is unset. Matches the
 * outbox / drift cron contract.
 *
 * Idempotency: pull jobs carry a deterministic idempotency_key, so a re-run for
 * the same day is a no-op (V-TEC-72). D365 is OPTIONAL + import-only; local rows
 * are canonical — drift is logged + skipped (V-TEC-73), never overwritten.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  cronBearerMatches,
  getSystemActorConnection,
} from '@monopilot/db/system-actor-connection.js';
import { assertD365Enabled, D365DisabledError } from '../../../../../lib/integrations/d365/gate';
import { enqueuePullJob, processPullJob } from '../../../../../lib/integrations/d365/pull';
import { makeD365PullClient } from '../../../../../lib/integrations/d365/client';

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

type PerOrgSummary = {
  orgId: string;
  status: 'completed' | 'failed' | 'skipped_disabled' | 'error';
  recordsProcessed?: number;
  drifted?: number;
};

/**
 * Run a single org's pull inside an owner-pool transaction with org context set.
 * Exported for unit testing the per-org path against a real DB.
 */
export async function runPullForOrg(pool: pg.Pool, orgId: string): Promise<PerOrgSummary> {
  const sessionToken = randomUUID();
  // Register the trust-store row so app.set_org_context accepts the token.
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);

    try {
      await assertD365Enabled(client);
    } catch (err) {
      await client.query('rollback');
      if (err instanceof D365DisabledError) {
        return { orgId, status: 'skipped_disabled' };
      }
      throw err;
    }

    const recordKey = `nightly-${new Date().toISOString().slice(0, 10)}`;
    const enq = await enqueuePullJob(client, orgId, { targetEntity: 'items', recordKey });
    if (!enq.ok) {
      await client.query('rollback');
      return { orgId, status: 'error' };
    }

    const cursor = await client.query<{ since: string | null }>(
      `select max(d365_last_sync_at) as since from public.items where org_id = $1::uuid`,
      [orgId],
    );
    const result = await processPullJob(
      client,
      makeD365PullClient(),
      { id: enq.job.id, org_id: orgId, target_entity: 'items' },
      { sinceIso: cursor.rows[0]?.since ?? null, actorUserId: null },
    );
    await client.query('commit');
    return {
      orgId,
      status: result.status,
      recordsProcessed: result.recordsProcessed,
      drifted: result.drifted,
    };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
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

  let pool: ReturnType<typeof getSystemActorConnection>;
  try {
    pool = getSystemActorConnection();
  } catch {
    return json({ error: 'database_not_configured' }, 500);
  }

  try {
    const enabled = await pool.query<{ org_id: string }>(
      `select org_id from public.feature_flags_core
        where flag_code = 'integration.d365.enabled' and is_enabled = true`,
    );

    const results: PerOrgSummary[] = [];
    for (const row of enabled.rows) {
      results.push(await runPullForOrg(pool, row.org_id));
    }

    const processed = results.filter((r) => r.status === 'completed').length;
    return json({ ok: true, orgs: results.length, processed, results }, 200);
  } catch (err) {
    console.error('[cron/d365-pull] failed', err);
    return json({ error: 'd365_pull_failed', message: err instanceof Error ? err.message : String(err) }, 503);
  } finally {
    await pool.end();
  }
}
