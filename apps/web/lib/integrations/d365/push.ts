/**
 * T-029 — D365 push worker (WO confirmations) + retry + DLQ.
 *
 * Consumes the `wo.confirmation` outbox event (produced by 08-PRODUCTION, out of
 * scope here) and pushes a Production Journal payload to D365. Export side of the
 * R15 anti-corruption adapter — never mutates D365-owned release/factory state.
 *
 * Retry policy (PRD §13.2 / §13.7): 3 attempts with exponential backoff
 * 1s / 5s / 25s. After the cap the record is dead-lettered (`d365_sync_dlq`,
 * V-TEC-71: error_message NOT NULL). The push carries an `x-idempotency-key`
 * header; a duplicate request that D365 answers 409 is treated as "already
 * accepted" and the job is marked `completed` (V-TEC-72 semantics, idempotent).
 *
 * The D365 client is injected so retry/backoff/DLQ are testable without network
 * and a live D365 is never called in tests. Backoff sleeps are injectable too
 * (default no-op in tests) so retry tests run instantly.
 */

import type { QueryClient } from './gate';
import {
  buildIdempotencyKey,
  isUniqueViolation,
  type D365Direction,
} from './idempotency';

/** Backoff schedule in milliseconds — PRD §13.2 (1s, 5s, 25s). */
export const D365_BACKOFF_MS = [1000, 5000, 25000] as const;
export const D365_MAX_RETRIES = 3;

export type D365PushResponse =
  | { status: 'ok' }
  | { status: 'conflict' } // D365 409 — duplicate idempotency key, already accepted
  | { status: 'error'; httpStatus: number; message: string };

export type D365PushClient = {
  /**
   * Submit a WO production-journal confirmation. Implementations send the
   * `x-idempotency-key` header. Returns a discriminated result; transport
   * failures should be surfaced as `{ status: 'error', ... }` (never thrown) so
   * the worker can apply the retry/DLQ policy deterministically.
   */
  submitWoConfirmation(payload: WoConfirmationPayload, idempotencyKey: string): Promise<D365PushResponse>;
};

export type WoConfirmationPayload = {
  /** WO identifier (soft reference; the WO aggregate lives in 08-production). */
  wo_id: string;
  /** D365 item id soft reference, never an FK. */
  d365_item_id?: string | null;
  quantity: number;
  [key: string]: unknown;
};

export type EnqueuePushInput = {
  recordKey: string;
  payload: WoConfirmationPayload;
  payloadVersion?: number;
  createdBy?: string | null;
};

export type D365SyncJobRow = {
  id: string;
  org_id: string;
  direction: D365Direction;
  status: string;
  idempotency_key: string;
  retry_count: number;
};

export type EnqueuePushResult =
  | { ok: true; job: D365SyncJobRow; duplicate: boolean }
  | { ok: false; error: 'persistence_failed' };

/**
 * Enqueue a push job for a WO confirmation. Idempotent on
 * (org_id, idempotency_key); a duplicate returns the existing job.
 */
export async function enqueuePushJob(
  client: QueryClient,
  orgId: string,
  input: EnqueuePushInput,
): Promise<EnqueuePushResult> {
  const payloadVersion = input.payloadVersion ?? 1;
  const idempotencyKey = buildIdempotencyKey({
    targetEntity: 'wo_confirmation',
    recordKey: input.recordKey,
    direction: 'push',
    payloadVersion,
  });

  // SAVEPOINT so a duplicate idempotency_key (unique violation) does not poison
  // the surrounding transaction — roll back to the savepoint and resolve the
  // existing job instead.
  await client.query('savepoint d365_push_enqueue');
  try {
    const inserted = await client.query<D365SyncJobRow>(
      `insert into public.d365_sync_jobs
         (org_id, direction, job_type, target_entity, status,
          idempotency_key, record_key, d365_item_id, payload_version, payload, created_by)
       values
         ($1::uuid, 'push', 'wo_confirmation', 'wo_confirmation', 'pending',
          $2, $3, $4, $5, $6::jsonb, $7)
       returning id, org_id, direction, status, idempotency_key, retry_count`,
      [
        orgId,
        idempotencyKey,
        input.recordKey,
        input.payload.d365_item_id ?? null,
        payloadVersion,
        JSON.stringify(input.payload),
        input.createdBy ?? null,
      ],
    );
    await client.query('release savepoint d365_push_enqueue');
    const job = inserted.rows[0];
    if (!job) return { ok: false, error: 'persistence_failed' };
    return { ok: true, job, duplicate: false };
  } catch (err) {
    await client.query('rollback to savepoint d365_push_enqueue');
    await client.query('release savepoint d365_push_enqueue');
    if (isUniqueViolation(err)) {
      const existing = await client.query<D365SyncJobRow>(
        `select id, org_id, direction, status, idempotency_key, retry_count
           from public.d365_sync_jobs
          where org_id = app.current_org_id()
            and idempotency_key = $1`,
        [idempotencyKey],
      );
      const job = existing.rows[0];
      if (job) return { ok: true, job, duplicate: true };
    }
    return { ok: false, error: 'persistence_failed' };
  }
}

export type ProcessPushResult = {
  jobId: string;
  status: 'completed' | 'dead_lettered';
  attempts: number;
  /** Set when the job completed because D365 reported a 409 duplicate. */
  alreadyAccepted: boolean;
};

export type ProcessPushOptions = {
  /** Injectable sleeper for backoff — tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** Override backoff schedule (tests use [0,0,0] for speed). */
  backoffMs?: readonly number[];
};

/**
 * Process a single push job: POST to D365 with retry/backoff, then DLQ.
 *
 *   - 200 → job 'completed'.
 *   - 409 → job 'completed' (already accepted; idempotent — no DLQ).
 *   - 5xx/transport error → retry up to D365_MAX_RETRIES with backoff; after the
 *     cap insert a `d365_sync_dlq` row (error_message NOT NULL, V-TEC-71) and set
 *     job status 'dead_lettered'.
 */
export async function processPushJob(
  client: QueryClient,
  d365: D365PushClient,
  job: { id: string; org_id: string; idempotency_key: string; payload: WoConfirmationPayload },
  options: ProcessPushOptions = {},
): Promise<ProcessPushResult> {
  const sleep = options.sleep ?? defaultSleep;
  const backoff = options.backoffMs ?? D365_BACKOFF_MS;

  await client.query(
    `update public.d365_sync_jobs
        set status = 'running', started_at = pg_catalog.now()
      where id = $1::uuid`,
    [job.id],
  );

  let attempts = 0;
  let lastError = 'unknown D365 push error';

  for (let attempt = 0; attempt < D365_MAX_RETRIES; attempt += 1) {
    attempts = attempt + 1;

    let response: D365PushResponse;
    try {
      response = await d365.submitWoConfirmation(job.payload, job.idempotency_key);
    } catch (err) {
      response = { status: 'error', httpStatus: 0, message: err instanceof Error ? err.message : String(err) };
    }

    if (response.status === 'ok') {
      await markCompleted(client, job.id, attempts, false);
      return { jobId: job.id, status: 'completed', attempts, alreadyAccepted: false };
    }

    if (response.status === 'conflict') {
      // D365 409: duplicate already accepted — idempotent success, no DLQ.
      await markCompleted(client, job.id, attempts, true);
      return { jobId: job.id, status: 'completed', attempts, alreadyAccepted: true };
    }

    // Transient/permanent error path.
    lastError = `D365 push failed (http ${response.httpStatus}): ${response.message}`;
    await client.query(
      `update public.d365_sync_jobs
          set retry_count = $2, error_message = $3
        where id = $1::uuid`,
      [job.id, attempts, lastError],
    );

    // Backoff before the next attempt — but not after the final attempt.
    if (attempt < D365_MAX_RETRIES - 1) {
      await sleep(backoff[attempt] ?? 0);
    }
  }

  // Cap reached → dead-letter (V-TEC-71).
  await deadLetterPush(client, job, lastError, attempts);
  await client.query(
    `update public.d365_sync_jobs
        set status = 'dead_lettered', retry_count = $2, error_message = $3,
            finished_at = pg_catalog.now()
      where id = $1::uuid`,
    [job.id, attempts, lastError],
  );
  return { jobId: job.id, status: 'dead_lettered', attempts, alreadyAccepted: false };
}

async function markCompleted(
  client: QueryClient,
  jobId: string,
  attempts: number,
  alreadyAccepted: boolean,
): Promise<void> {
  await client.query(
    `update public.d365_sync_jobs
        set status = 'completed',
            retry_count = $2,
            records_processed = 1,
            error_message = $3,
            finished_at = pg_catalog.now()
      where id = $1::uuid`,
    [jobId, attempts, alreadyAccepted ? 'D365 409: duplicate already accepted (idempotent)' : null],
  );
}

async function deadLetterPush(
  client: QueryClient,
  job: { id: string; org_id: string; idempotency_key: string; payload: WoConfirmationPayload },
  errorMessage: string,
  attempts: number,
): Promise<void> {
  await client.query(
    `insert into public.d365_sync_dlq
       (org_id, job_id, direction, job_type, target_entity,
        idempotency_key, record_key, d365_item_id, error_message, failed_payload, retry_count)
     values
       ($1::uuid, $2::uuid, 'push', 'wo_confirmation', 'wo_confirmation',
        $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      job.org_id,
      job.id,
      job.idempotency_key,
      job.payload.wo_id,
      job.payload.d365_item_id ?? null,
      ensureNonEmpty(errorMessage),
      JSON.stringify(job.payload),
      attempts,
    ],
  );
}

export type RetryDlqResult =
  | { ok: true; resolved: true; jobId: string | null }
  | { ok: false; error: 'not_found' | 'already_resolved' | 'push_failed' };

/**
 * Retry a dead-lettered push (DLQ Manager / TEC-073). Re-submits to D365; on
 * success marks the DLQ row resolved (`status='retried'`, `resolved_at` set) and
 * flips the originating job back to 'completed'. On failure the DLQ row stays
 * unresolved. RBAC (`technical.d365.sync_trigger`) is enforced at the route layer.
 */
export async function retryDlqEntry(
  client: QueryClient,
  d365: D365PushClient,
  dlqId: string,
  resolvedBy: string | null,
): Promise<RetryDlqResult> {
  const found = await client.query<{
    id: string;
    job_id: string | null;
    idempotency_key: string | null;
    failed_payload: WoConfirmationPayload;
    status: string;
  }>(
    `select id, job_id, idempotency_key, failed_payload, status
       from public.d365_sync_dlq
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [dlqId],
  );

  const row = found.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'resolved' || row.status === 'retried') {
    return { ok: false, error: 'already_resolved' };
  }

  const idempotencyKey = row.idempotency_key ?? buildIdempotencyKey({
    targetEntity: 'wo_confirmation',
    recordKey: row.failed_payload.wo_id,
    direction: 'push',
    payloadVersion: 1,
  });

  let response: D365PushResponse;
  try {
    response = await d365.submitWoConfirmation(row.failed_payload, idempotencyKey);
  } catch (err) {
    response = { status: 'error', httpStatus: 0, message: err instanceof Error ? err.message : String(err) };
  }

  if (response.status === 'ok' || response.status === 'conflict') {
    await client.query(
      `update public.d365_sync_dlq
          set status = 'retried', resolved_at = pg_catalog.now(), resolved_by = $2,
              resolution_note = $3
        where id = $1::uuid`,
      [row.id, resolvedBy, response.status === 'conflict' ? 'D365 409 on retry — already accepted' : 'D365 200 on retry'],
    );
    if (row.job_id) {
      await client.query(
        `update public.d365_sync_jobs
            set status = 'completed', error_message = null, finished_at = pg_catalog.now()
          where id = $1::uuid`,
        [row.job_id],
      );
    }
    return { ok: true, resolved: true, jobId: row.job_id };
  }

  return { ok: false, error: 'push_failed' };
}

function ensureNonEmpty(text: string): string {
  return text.trim().length > 0 ? text : 'unknown D365 push error';
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
