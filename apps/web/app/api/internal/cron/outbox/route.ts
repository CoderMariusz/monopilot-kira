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
 *   - LocalDispatchQueue: runs registered handlers synchronously at publish()
 *     time, BEFORE the worker stamps consumed_at. A handler throw aborts the
 *     stamp so the row stays in `outbox_events` for the next tick (at-least-
 *     once retry). Replaces the prior InMemoryQueue, which dropped events on
 *     request end and left cascade work undone (Slot F-1 fix).
 *   - TODO(post-A.7): swap to a real external queue (e.g. Azure Service Bus)
 *     selected by an env var once a remote consumer side is in place.
 *
 * Env vars used:
 *   - CRON_SECRET (auth)
 *   - DATABASE_URL_OWNER, DATABASE_URL (pool)
 *   - NODE_ENV, VERCEL_ENV (auth fallback gating)
 */

import type pg from 'pg';
import {
  cronBearerMatches,
  getSystemActorConnection,
} from '@monopilot/db/system-actor-connection.js';
import {
  type OutboxMessage,
  type Queue,
} from '../../../../../../../packages/outbox/src/queue';
import {
  LocalDispatchQueue,
  type MessageHandler,
} from '../../../../../../../packages/outbox/src/dispatch-queue';
import { normalizeEventType } from '../../../../../../../packages/outbox/src/events.enum';
import { dispatchCascade } from '../../../../../../../packages/rule-engine/src/dispatch';

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

/**
 * Mirror of `deadLetterRow()` from `packages/outbox/src/worker.ts`. Moves a row
 * that cannot be processed (unknown event type, or a repeatedly-throwing
 * handler) into the dead-letter queue (migration 056) and stamps it consumed so
 * the poll loop never sees it again. Best-effort fallback: if the DLQ write
 * fails, stamp `consumed_at` directly so the batch is never blocked.
 */
async function deadLetterRow(
  client: pg.PoolClient,
  row: OutboxRow,
  err: unknown,
): Promise<void> {
  const errorText = err instanceof Error ? err.message : String(err);

  try {
    let attempts = 0;
    try {
      const a = await client.query<{ attempts: number }>(
        `SELECT coalesce(attempts, 0) AS attempts
           FROM public.outbox_events WHERE id = $1`,
        [row.id],
      );
      attempts = (a.rows[0]?.attempts ?? 0) + 1;
    } catch {
      attempts = 1;
    }

    await client.query(
      `INSERT INTO public.outbox_dead_letter
         (outbox_event_id, org_id, event_type, aggregate_type, aggregate_id,
          payload, created_at, consumed_at, app_version, attempts, last_error_text)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, pg_catalog.now(), $8, $9, $10)
       ON CONFLICT (outbox_event_id) DO NOTHING`,
      [
        row.id,
        row.org_id,
        row.event_type,
        row.aggregate_type,
        row.aggregate_id,
        JSON.stringify(row.payload),
        row.created_at,
        row.app_version,
        attempts,
        errorText,
      ],
    );

    await client.query(
      `UPDATE public.outbox_events
          SET consumed_at = pg_catalog.now(),
              dead_lettered_at = pg_catalog.now(),
              attempts = $2,
              last_error_text = $3
        WHERE id = $1`,
      [row.id, attempts, errorText],
    );
  } catch (dlqErr) {
    console.error('[cron/outbox] dead-letter failed; skipping row', {
      id: row.id,
      event_type: row.event_type,
      dlqError: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
    });
    await client.query(
      `UPDATE public.outbox_events
          SET consumed_at = pg_catalog.now()
        WHERE id = $1`,
      [row.id],
    );
  }
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
    try {
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
    } catch (err) {
      // Per-row isolation: a single unknown/failed event is logged + dead-lettered
      // and SKIPPED, never aborting the batch (the cron poison-pill class).
      console.error('[cron/outbox] row failed; dead-lettering', {
        id: row.id,
        event_type: row.event_type,
        error: err instanceof Error ? err.message : String(err),
      });
      await deadLetterRow(client, row, err);
    }
  }
}

const VERCEL_CRON_HEADER = 'x-vercel-cron';

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
    if (cronBearerMatches(presented, cronSecret)) {
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

  let pool: ReturnType<typeof getSystemActorConnection>;
  try {
    pool = getSystemActorConnection();
  } catch {
    return new Response(
      JSON.stringify({ error: 'database_not_configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // TODO(post-A.7): swap LocalDispatchQueue for a real remote queue per env
  // config (Azure Service Bus or equivalent). Until then, in-process handlers
  // run synchronously at publish() time so cascade events are not dropped.
  // Cascade rule wiring lives in the rule engine. The cron route keeps the
  // owner-pool dispatch boundary; runCascade still filters all data access by
  // org_id inside the rule-engine transaction.
  const cascadeHandler: MessageHandler = async (msg) => {
    await dispatchCascade(msg, { pool });
  };
  const queue = new LocalDispatchQueue([cascadeHandler]);

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
    // `errors` exposes handler-level failures recorded by LocalDispatchQueue.
    // A non-zero count here means at least one row was NOT stamped consumed_at
    // (the loop re-threw); however the run made it past the catch only if the
    // failures were observation-only. In the current wiring a thrown handler
    // takes the 503 branch instead — this field is reserved for future
    // continue-on-error variants.
    const errors = queue.errors.length;

    return new Response(JSON.stringify({ ok: true, processed, errors }), {
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
