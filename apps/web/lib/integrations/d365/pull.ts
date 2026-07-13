/**
 * T-028 — D365 pull/import worker (items + BOM/formula).
 *
 * Optional, import side of the R15 anti-corruption adapter. Monopilot is the
 * system-of-record; D365 is advisory. This module:
 *
 *   1. Enqueues a `direction='pull'` job in `d365_sync_jobs` with a deterministic
 *      idempotency_key [R14]. A duplicate key (UNIQUE per org, migration 164) is a
 *      no-op (V-TEC-72) — the second attempt returns the existing job.
 *   2. Processes incoming D365 records by UPSERTing `items` matched on the soft
 *      `d365_item_id` TEXT reference (NEVER a hard FK).
 *   3. Detects drift (V-TEC-73): when a local item's `updated_at` is newer than
 *      its `d365_last_sync_at` AND the incoming D365 content differs, it writes a
 *      `d365_drift` audit_log row and SKIPS the overwrite — local edits win.
 *   4. Stamps `records_processed` / `records_failed` and completes the job; on a
 *      hard failure routes a poison record into `d365_sync_dlq` (V-TEC-71).
 *
 * The D365 client is injected (a `D365PullClient`) so the worker is testable
 * without any network and never calls a live D365 in tests.
 */

import type { QueryClient } from './gate';
import { assertD365Enabled } from './gate';
import {
  buildIdempotencyKey,
  isUniqueViolation,
  type D365Direction,
} from './idempotency';

/** A single incoming D365 item record (the subset we mirror locally). */
export type D365IncomingItem = {
  /** D365 item id — soft TEXT reference, never an FK. */
  d365_item_id: string;
  item_code: string;
  name: string;
  item_type: 'rm' | 'ingredient' | 'intermediate' | 'fg' | 'co_product' | 'byproduct';
  /** ISO timestamp of the D365-side modification. */
  modified_at: string;
};

export type D365PullClient = {
  /** Fetch items modified since `sinceIso` (null = full pull). */
  fetchItems(sinceIso: string | null): Promise<D365IncomingItem[]>;
};

export type EnqueuePullInput = {
  targetEntity: 'items' | 'bom' | 'formula';
  recordKey: string;
  payloadVersion?: number;
  createdBy?: string | null;
  payload?: Record<string, unknown>;
};

export type D365SyncJobRow = {
  id: string;
  org_id: string;
  direction: D365Direction;
  job_type: string;
  target_entity: string;
  status: string;
  idempotency_key: string;
  records_processed: number;
  records_failed: number;
};

export type EnqueuePullResult =
  | { ok: true; job: D365SyncJobRow; duplicate: boolean }
  | { ok: false; error: 'persistence_failed' };

/**
 * Map a pull target entity to the job_type CHECK domain (migration 164:
 * items|bom|formula|wo_confirmation|journal).
 */
function jobTypeFor(targetEntity: EnqueuePullInput['targetEntity']): string {
  return targetEntity;
}

/**
 * Enqueue a pull job. Idempotent: a duplicate (org_id, idempotency_key) is a
 * no-op — the existing job row is returned with `duplicate: true` (V-TEC-72).
 *
 * NOTE: the gate is asserted by the caller (cron route) BEFORE enqueue so the
 * V-TEC-70 / V-SET-42 rejection surfaces as 412 rather than a silent skip.
 */
export async function enqueuePullJob(
  client: QueryClient,
  orgId: string,
  input: EnqueuePullInput,
): Promise<EnqueuePullResult> {
  const payloadVersion = input.payloadVersion ?? 1;
  const idempotencyKey = buildIdempotencyKey({
    targetEntity: input.targetEntity,
    recordKey: input.recordKey,
    direction: 'pull',
    payloadVersion,
  });

  // SAVEPOINT so a duplicate idempotency_key (unique violation) does not poison
  // the surrounding withOrgContext transaction — we roll back to the savepoint
  // and resolve the existing job instead (V-TEC-72 no-op).
  await client.query('savepoint d365_pull_enqueue');
  try {
    const inserted = await client.query<D365SyncJobRow>(
      `insert into public.d365_sync_jobs
         (org_id, direction, job_type, target_entity, status,
          idempotency_key, record_key, payload_version, payload, created_by)
       values
         ($1::uuid, 'pull', $2, $3, 'pending',
          $4, $5, $6, $7::jsonb, $8)
       returning id, org_id, direction, job_type, target_entity, status,
                 idempotency_key, records_processed, records_failed`,
      [
        orgId,
        jobTypeFor(input.targetEntity),
        input.targetEntity,
        idempotencyKey,
        input.recordKey,
        payloadVersion,
        JSON.stringify(input.payload ?? {}),
        input.createdBy ?? null,
      ],
    );
    await client.query('release savepoint d365_pull_enqueue');
    const job = inserted.rows[0];
    if (!job) return { ok: false, error: 'persistence_failed' };
    return { ok: true, job, duplicate: false };
  } catch (err) {
    await client.query('rollback to savepoint d365_pull_enqueue');
    await client.query('release savepoint d365_pull_enqueue');
    if (isUniqueViolation(err)) {
      // V-TEC-72: duplicate idempotency_key → no-op, return the existing job.
      const existing = await client.query<D365SyncJobRow>(
        `select id, org_id, direction, job_type, target_entity, status,
                idempotency_key, records_processed, records_failed
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

export type ProcessPullResult = {
  jobId: string;
  status: 'completed' | 'failed';
  recordsProcessed: number;
  recordsFailed: number;
  drifted: number;
};

/**
 * Process a pull job: fetch incoming items and reconcile them into `items`.
 *
 * Per record:
 *   - No local match on `d365_item_id` → INSERT (advisory import).
 *   - Local match, local NOT newer than last sync → UPSERT (accept D365).
 *   - Local match, local `updated_at` > `d365_last_sync_at` AND content differs
 *     → DRIFT: write `d365_drift` audit_log row, mark item d365_sync_status
 *       'drift', and SKIP the overwrite (V-TEC-73).
 *
 * A per-record hard failure is isolated, counted in `records_failed`, and routed
 * to the DLQ (V-TEC-71) — it never aborts the whole job.
 */
export async function processPullJob(
  client: QueryClient,
  d365: D365PullClient,
  job: { id: string; org_id: string; target_entity: string },
  options: { sinceIso?: string | null; actorUserId?: string | null } = {},
): Promise<ProcessPullResult> {
  await client.query(
    `update public.d365_sync_jobs
        set status = 'running', started_at = pg_catalog.now()
      where id = $1::uuid`,
    [job.id],
  );

  let processed = 0;
  let failed = 0;
  let drifted = 0;

  try {
    const incoming = await d365.fetchItems(options.sinceIso ?? null);

    for (let i = 0; i < incoming.length; i += 1) {
      const record = incoming[i]!;
      // Per-record SAVEPOINT: a record-level failure (e.g. a CHECK violation)
      // poisons the surrounding transaction in Postgres, so we wrap each record
      // and roll back to the savepoint on failure. That keeps one bad record
      // from aborting the whole batch — it is isolated, counted, and DLQ'd.
      const sp = `d365_pull_rec_${i}`;
      await client.query(`savepoint ${sp}`);
      try {
        const outcome = await reconcileItem(client, job.org_id, record, options.actorUserId ?? null);
        await client.query(`release savepoint ${sp}`);
        if (outcome === 'drift') drifted += 1;
        processed += 1;
      } catch (recordErr) {
        await client.query(`rollback to savepoint ${sp}`);
        await client.query(`release savepoint ${sp}`);
        failed += 1;
        // The DLQ write runs in the (now clean) outer transaction.
        await writeDlq(client, job, record, recordErr);
      }
    }

    await client.query(
      `update public.d365_sync_jobs
          set status = 'completed',
              records_processed = $2,
              records_failed = $3,
              finished_at = pg_catalog.now()
        where id = $1::uuid`,
      [job.id, processed, failed],
    );

    return { jobId: job.id, status: 'completed', recordsProcessed: processed, recordsFailed: failed, drifted };
  } catch (jobErr) {
    // Whole-job failure (e.g. fetch threw). Mark failed; the cron retry/backoff
    // owns re-scheduling. error_message is recorded for the operator.
    await client.query(
      `update public.d365_sync_jobs
          set status = 'failed',
              records_processed = $2,
              records_failed = $3,
              error_message = $4,
              finished_at = pg_catalog.now()
        where id = $1::uuid`,
      [job.id, processed, failed, errorText(jobErr)],
    );
    return { jobId: job.id, status: 'failed', recordsProcessed: processed, recordsFailed: failed, drifted };
  }
}

type ReconcileOutcome = 'inserted' | 'updated' | 'drift';

/**
 * UPSERT a single D365 item with drift protection (V-TEC-73). Returns the
 * outcome so the caller can count drifts.
 */
async function reconcileItem(
  client: QueryClient,
  orgId: string,
  record: D365IncomingItem,
  actorUserId: string | null,
): Promise<ReconcileOutcome> {
  const existing = await client.query<{
    id: string;
    item_code: string;
    name: string;
    item_type: string;
    updated_at: string;
    d365_last_sync_at: string | null;
  }>(
    `select id, item_code, name, item_type, updated_at, d365_last_sync_at
       from public.items
      where org_id = app.current_org_id()
        and d365_item_id = $1`,
    [record.d365_item_id],
  );

  const local = existing.rows[0];

  if (!local) {
    // No local mirror yet — advisory insert.
    await client.query(
      `insert into public.items
         (org_id, item_code, item_type, name, status, uom_base, weight_mode,
          d365_item_id, d365_last_sync_at, d365_sync_status)
       values
         ($1::uuid, $2, $3, $4, 'active', 'kg', 'fixed',
          $5, pg_catalog.now(), 'synced')`,
      [orgId, record.item_code, record.item_type, record.name, record.d365_item_id],
    );
    return 'inserted';
  }

  // Drift detection: local edited after the last D365 sync AND content differs.
  const localNewer =
    local.d365_last_sync_at === null ||
    new Date(local.updated_at).getTime() > new Date(local.d365_last_sync_at).getTime();
  const contentDiffers =
    local.item_code !== record.item_code ||
    local.name !== record.name ||
    local.item_type !== record.item_type;

  if (localNewer && contentDiffers) {
    await recordItemDrift(
      client,
      orgId,
      actorUserId,
      local,
      record,
      'V-TEC-73: local newer than incoming D365 — skipped overwrite',
    );
    return 'drift';
  }

  // Identity guard: never silently re-key an existing local row from D365.
  if (local.item_code !== record.item_code) {
    await recordItemDrift(
      client,
      orgId,
      actorUserId,
      local,
      record,
      'D365 item_code differs from local identity — requires manual drift resolution',
    );
    return 'drift';
  }

  // Accept D365 content (no drift): sync mirror fields except item_code (local-owned).
  await client.query(
    `update public.items
        set name = $2,
            item_type = $3,
            d365_last_sync_at = pg_catalog.now(),
            d365_sync_status = 'synced'
      where id = $1::uuid`,
    [local.id, record.name, record.item_type],
  );
  return 'updated';
}

async function recordItemDrift(
  client: QueryClient,
  orgId: string,
  actorUserId: string | null,
  local: { id: string; item_code: string; name: string; item_type: string },
  record: D365IncomingItem,
  reason: string,
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, retention_class)
     values
       ($1::uuid, $2, $3, 'd365_drift', 'item', $4::uuid,
        $5::jsonb, $6::jsonb, 'standard')`,
    [
      orgId,
      actorUserId,
      actorUserId ? 'user' : 'system',
      local.id,
      JSON.stringify({ item_code: local.item_code, name: local.name, item_type: local.item_type }),
      JSON.stringify({
        d365_item_id: record.d365_item_id,
        item_code: record.item_code,
        name: record.name,
        item_type: record.item_type,
        reason,
      }),
    ],
  );
  await client.query(
    `update public.items
        set d365_sync_status = 'drift'
      where id = $1::uuid`,
    [local.id],
  );
}

/** Write a poison pull record into the DLQ (V-TEC-71: error_message NOT NULL). */
async function writeDlq(
  client: QueryClient,
  job: { id: string; org_id: string; target_entity: string },
  record: D365IncomingItem,
  err: unknown,
): Promise<void> {
  await client.query(
    `insert into public.d365_sync_dlq
       (org_id, job_id, direction, job_type, target_entity,
        record_key, d365_item_id, error_message, failed_payload)
     values
       ($1::uuid, $2::uuid, 'pull', $3, $4,
        $5, $6, $7, $8::jsonb)`,
    [
      job.org_id,
      job.id,
      job.target_entity,
      job.target_entity,
      record.item_code,
      record.d365_item_id,
      errorText(err),
      JSON.stringify(record),
    ],
  );
}

function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.trim().length > 0 ? text : 'unknown D365 pull error';
}

export { assertD365Enabled };
