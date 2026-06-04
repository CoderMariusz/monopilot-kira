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
}

/**
 * Move a row that cannot be processed (unknown event type, or a handler that
 * keeps throwing) into the dead-letter queue and stamp it consumed so the poll
 * loop never sees it again. This is the POISON-PILL guard: without it, a single
 * bad row would either abort the whole batch (head-of-line block) or be
 * re-polled forever. Uses the DLQ infra from migration 056
 * (`outbox_events.dead_lettered_at` / `last_error_text` + `outbox_dead_letter`).
 *
 * Best-effort: if the dead-letter write itself fails (e.g. older schema without
 * the 056 columns), we fall back to stamping `consumed_at` + recording the error
 * text so the row is still skipped and the batch keeps moving.
 */
async function deadLetterRow(
  client: pg.PoolClient | pg.Client,
  quotedSchema: string,
  row: OutboxRow,
  err: unknown,
): Promise<void> {
  const errorText = err instanceof Error ? err.message : String(err);

  try {
    // Read the current attempt count lazily — the column only exists on schemas
    // at/after migration 056. Default to 0 if absent.
    let attempts = 0;
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
    // DLQ write failed (e.g. schema predates migration 056). Still skip the row
    // so the batch is not permanently blocked: stamp consumed_at directly.
    console.error('[outbox/worker] dead-letter failed; skipping row', {
      id: row.id,
      event_type: row.event_type,
      dlqError: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
    });
    await client.query(
      `UPDATE ${quotedSchema}.outbox_events
          SET consumed_at = pg_catalog.now()
        WHERE id = $1`,
      [row.id],
    );
  }
}

/**
 * runOnce — polls unconsumed outbox_events rows, publishes each to `queue`,
 * then stamps consumed_at. Idempotent: already-consumed rows are never re-published.
 *
 * Poison-pill safe: each row is processed in its own try/catch. If
 * `normalizeEventType` throws (unknown event type) or the queue handler throws,
 * the offending row is dead-lettered and SKIPPED — the loop continues with the
 * remaining rows instead of aborting the whole batch (no head-of-line block).
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
    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, app_version
     FROM ${quotedSchema}.outbox_events
     WHERE consumed_at IS NULL
     ORDER BY org_id, created_at
     LIMIT 100`,
  );

  for (const row of pollResult.rows) {
    try {
      // Validate event_type against the canonical enum — throws for unknown types.
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

      // Publish first (at-least-once), then stamp consumed_at.
      await queue.publish(message);

      await client.query(
        `UPDATE ${quotedSchema}.outbox_events
         SET consumed_at = pg_catalog.now()
         WHERE id = $1`,
        [row.id],
      );
    } catch (err) {
      // Per-row isolation: log + dead-letter the bad row, then keep processing
      // the rest of the batch. A single unknown/failed event must NEVER block
      // the queue (the cron poison-pill class).
      console.error('[outbox/worker] row failed; dead-lettering', {
        id: row.id,
        event_type: row.event_type,
        error: err instanceof Error ? err.message : String(err),
      });
      await deadLetterRow(client, quotedSchema, row, err);
    }
  }
}
