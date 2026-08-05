import type pg from 'pg';
import { normalizeEventType } from './events.enum.js';
import type { Queue, OutboxMessage } from './queue.js';

/**
 * Row shape returned by the poll query.
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
  attempts: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Move a row that cannot be processed (unknown event type, or a handler that
 * exhausted its retries) into the dead-letter queue and stamp it consumed so the poll
 * loop never sees it again. This is the POISON-PILL guard: without it, a single
 * bad row would either abort the whole batch (head-of-line block) or be
 * re-polled forever. Uses the DLQ infra from migration 056
 * (`outbox_events.dead_lettered_at` / `last_error_text` + `outbox_dead_letter`).
 *
 * If the dead-letter write fails, leave the source row unconsumed and surface
 * the failure. Losing a row is worse than retrying it again.
 */
async function deadLetterRow(
  client: pg.PoolClient | pg.Client,
  quotedSchema: string,
  row: OutboxRow,
  err: unknown,
  attemptsOverride?: number,
): Promise<void> {
  const errorText = err instanceof Error ? err.message : String(err);

  try {
    // Read the current attempt count lazily — the column only exists on schemas
    // at/after migration 056. Default to 0 if absent.
    let attempts = attemptsOverride;
    if (attempts == null) {
      try {
        const a = await client.query<{ attempts: number }>(
          `SELECT coalesce(attempts, 0) AS attempts
             FROM ${quotedSchema}.outbox_events WHERE id = $1`,
          [row.id],
        );
        attempts = (a.rows[0]?.attempts ?? 0) + 1;
      } catch {
        attempts = 1;
      }
    }

    await client.query(
      `INSERT INTO ${quotedSchema}.outbox_dead_letter
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
      `UPDATE ${quotedSchema}.outbox_events
          SET consumed_at = pg_catalog.now(),
              dead_lettered_at = pg_catalog.now(),
              attempts = $2,
              last_error_text = $3
        WHERE id = $1`,
      [row.id, attempts, errorText],
    );
  } catch (dlqErr) {
    console.error('[outbox/worker] dead-letter failed; retaining row', {
      id: row.id,
      event_type: row.event_type,
      dlqError: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
    });
    throw dlqErr;
  }
}

async function retryOrDeadLetterRow(
  client: pg.PoolClient | pg.Client,
  quotedSchema: string,
  row: OutboxRow,
  err: unknown,
): Promise<void> {
  const errorText = err instanceof Error ? err.message : String(err);
  const current = await client.query<{ attempts: number }>(
    `SELECT coalesce(attempts, 0) AS attempts
       FROM ${quotedSchema}.outbox_events
      WHERE id = $1`,
    [row.id],
  );
  const attempts = (current.rows[0]?.attempts ?? 0) + 1;

  if (attempts >= MAX_ATTEMPTS) {
    await deadLetterRow(client, quotedSchema, row, err, attempts);
    return;
  }

  await client.query(
    `UPDATE ${quotedSchema}.outbox_events
        SET attempts = $2,
            last_error_text = $3
      WHERE id = $1
        AND consumed_at IS NULL
        AND dead_lettered_at IS NULL`,
    [row.id, attempts, errorText],
  );
}

/**
 * runOnce — polls unconsumed outbox_events rows, publishes each to `queue`,
 * then stamps consumed_at. Idempotent: already-consumed rows are never re-published.
 *
 * Poison-pill safe: an unknown event type is dead-lettered immediately. A
 * handler failure increments attempts and leaves consumed_at NULL; only the
 * fifth failure moves the row to the DLQ.
 *
 * @param client  A pg.PoolClient (or pg.Client) already connected. Caller owns lifecycle.
 * @param queue   Queue implementation to publish to (InMemoryQueue in tests, Azure SB later).
 * @param schema  Optional schema name override (used by integration tests for isolation).
 */
export async function runOnce(
  client: pg.PoolClient | pg.Client,
  queue: Queue,
  schema = 'public',
): Promise<void> {
  const quotedSchema = `"${schema.replace(/"/g, '""')}"`;

  const pollResult = await client.query<OutboxRow>(
    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, app_version, attempts
     FROM ${quotedSchema}.outbox_events
     WHERE consumed_at IS NULL
     ORDER BY org_id, created_at
     LIMIT 100`,
  );

  for (const row of pollResult.rows) {
    if (row.attempts >= MAX_ATTEMPTS) {
      await deadLetterRow(
        client,
        quotedSchema,
        row,
        new Error(`max attempts reached (${row.attempts})`),
        row.attempts,
      );
      continue;
    }

    let eventType: OutboxMessage['eventType'];
    try {
      // Validate event_type against the canonical enum — throws for unknown types.
      eventType = normalizeEventType(row.event_type);
    } catch (err) {
      console.error('[outbox/worker] invalid event type; dead-lettering', {
        id: row.id,
        event_type: row.event_type,
        error: err instanceof Error ? err.message : String(err),
      });
      await deadLetterRow(client, quotedSchema, row, err);
      continue;
    }

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

    try {
      // Publish first (at-least-once), then stamp consumed_at.
      await queue.publish(message);
    } catch (err) {
      console.error('[outbox/worker] handler failed; retaining for retry', {
        id: row.id,
        event_type: row.event_type,
        error: err instanceof Error ? err.message : String(err),
      });
      await retryOrDeadLetterRow(client, quotedSchema, row, err);
      continue;
    }

    await client.query(
      `UPDATE ${quotedSchema}.outbox_events
       SET consumed_at = pg_catalog.now()
       WHERE id = $1`,
      [row.id],
    );
  }
}
