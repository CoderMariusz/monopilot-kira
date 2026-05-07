/**
 * Outbox worker cron entry point.
 *
 * Cron contract:
 *   - Invoked every 1 minute by Vercel cron (configured in vercel.json — pending
 *     wave-2 deploy wiring).
 *   - HTTP method: POST (cron endpoints are POST in this codebase; matches
 *     T-034 drift route convention as ratified by Sprint A.7 audit fixup).
 *
 * Auth:
 *   - Vercel platform cron header `x-vercel-cron: 1`, OR
 *   - `Authorization: Bearer ${CRON_SECRET}` (constant-time compare via
 *     timingSafeEqual). Fail-closed in production: when CRON_SECRET is unset,
 *     bearer auth is rejected. Dev-only fallback is gated on
 *     `NODE_ENV==='development' && !VERCEL_ENV` to keep preview/staging
 *     deployments tight.
 *
 * Idempotency:
 *   - The worker is at-least-once. `runOnce()` publishes BEFORE stamping
 *     consumed_at, so a crash between publish and update will republish on the
 *     next tick. Consumer-side dedup (e.g. on aggregate_id + event_type +
 *     created_at) is the consumer's responsibility.
 *
 * Pool choice (intentional):
 *   - Owner pool. The worker writes `consumed_at` on `public.outbox_events`
 *     and reads across all orgs in a single sweep. The managed app pool would
 *     require an org context (RLS), which is incompatible with the
 *     cross-tenant fan-out semantics of the outbox dispatcher. This is a
 *     CONTROL PLANE job running as the system actor — same posture as the
 *     T-034 drift cron.
 *
 * Queue:
 *   - InMemoryQueue today; messages are persisted in the queue object's
 *     in-process array and dropped at request end. This is deliberate for
 *     Sprint A.7 — Wave 1 NPD module needs the worker to drain
 *     `outbox_events` so consumed_at advances; an external queue is added in
 *     a follow-up wave.
 *   - TODO(post-A.7): swap to a real queue (e.g. Azure Service Bus) selected
 *     by an env var once the consumer side is in place.
 *
 * Env vars used:
 *   - CRON_SECRET (auth)
 *   - DATABASE_URL_OWNER, DATABASE_URL (pool)
 *   - NODE_ENV, VERCEL_ENV (auth fallback gating)
 */

import pg from 'pg';
import { timingSafeEqual } from 'node:crypto';
import {
  InMemoryQueue,
  type OutboxMessage,
  type Queue,
} from '../../../../../../../packages/outbox/src/queue';
import { normalizeEventType } from '../../../../../../../packages/outbox/src/events.enum';

/**
 * Mirror of `runOnce()` from `packages/outbox/src/worker.ts`. Inlined here
 * because the worker module declares `import type pg from 'pg'`, and the
 * outbox package does not list @types/pg in its devDependencies — when web's
 * tsc traverses worker.ts via the route import it cannot resolve the type
 * declaration. The semantics MUST stay byte-identical to the worker:
 *   - poll up to 100 unconsumed rows ordered by (org_id, created_at)
 *   - validate event_type against the canonical enum
 *   - publish first (at-least-once), THEN stamp consumed_at
 * If the worker's contract changes, update this mirror in lockstep.
 */
interface OutboxRow {
  id: string | number;
  org_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
  app_version: string;
}

async function runOnce(client: pg.PoolClient, queue: Queue): Promise<void> {
  const pollResult = await client.query<OutboxRow>(
    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, app_version
       FROM public.outbox_events
      WHERE consumed_at IS NULL
      ORDER BY org_id, created_at
      LIMIT 100`,
  );

  for (const row of pollResult.rows) {
    const eventType = normalizeEventType(row.event_type);
    const message: OutboxMessage = {
      id: row.id,
      orgId: row.org_id,
      eventType,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: row.payload,
      createdAt: row.created_at,
      appVersion: row.app_version,
    };

    await queue.publish(message);

    await client.query(
      `UPDATE public.outbox_events
          SET consumed_at = pg_catalog.now()
        WHERE id = $1`,
      [row.id],
    );
  }
}

const VERCEL_CRON_HEADER = 'x-vercel-cron';

/**
 * Constant-time string compare. timingSafeEqual requires equal-length buffers,
 * so we short-circuit on length mismatch BEFORE the cryptographic compare.
 */
function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface AuthDecision {
  ok: boolean;
  reason?: string;
}

function authorizeCron(req: Request): AuthDecision {
  const cronSecret = process.env.CRON_SECRET;

  if (req.headers.get(VERCEL_CRON_HEADER) === '1') {
    return { ok: true };
  }

  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const presented = authHeader.slice(7).trim();
    if (cronSecret && safeCompare(presented, cronSecret)) {
      return { ok: true };
    }
    if (
      !cronSecret &&
      process.env.NODE_ENV === 'development' &&
      !process.env.VERCEL_ENV
    ) {
      if (presented.length > 0) return { ok: true };
    }
    return { ok: false, reason: 'invalid_bearer' };
  }

  return { ok: false, reason: 'no_cron_signal' };
}

export async function POST(req: Request): Promise<Response> {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const connectionString =
    process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) {
    return new Response(
      JSON.stringify({ error: 'database_not_configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // CONTROL PLANE: outbox dispatcher runs as the system actor, sweeps every
  // org's unconsumed events, and stamps `consumed_at`. RLS-scoped app pool
  // cannot fan out across orgs, so an owner-pool client is required by design.
  // eslint-disable-next-line no-restricted-syntax
  const pool = new pg.Pool({ connectionString });

  // TODO(post-A.7): swap InMemoryQueue for the real queue per env config
  // (Azure Service Bus or equivalent). Until the consumer is in place the
  // in-memory adapter still drains `outbox_events.consumed_at`, which is the
  // primary contract for unblocking Wave 1 NPD cascade events.
  const queue = new InMemoryQueue();

  const client = await pool.connect();
  try {
    // Count unconsumed BEFORE so we can report `processed`. runOnce is
    // bounded to LIMIT 100 per call, so this gives an upper-bound report;
    // the real processed count is `min(before, 100) - after`.
    let before = 0;
    try {
      const r = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.outbox_events WHERE consumed_at IS NULL`,
      );
      before = Number.parseInt(r.rows[0]?.c ?? '0', 10);
    } catch {
      // Best-effort metric only; never fail the run on the count probe.
    }

    await runOnce(client, queue);

    let after = before;
    try {
      const r = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.outbox_events WHERE consumed_at IS NULL`,
      );
      after = Number.parseInt(r.rows[0]?.c ?? '0', 10);
    } catch {
      // ditto
    }

    const processed = Math.max(0, before - after);

    return new Response(JSON.stringify({ ok: true, processed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // 503: the run failed but the cron tick itself was authenticated. The
    // platform retries on next tick; idempotency is maintained by runOnce.
    console.error('[cron/outbox] runOnce failed', err);
    return new Response(
      JSON.stringify({
        error: 'outbox_runonce_failed',
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  } finally {
    client.release();
    await pool.end();
  }
}
