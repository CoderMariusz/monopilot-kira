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
 * runOnce — polls unconsumed outbox_events rows, publishes each to `queue`,
 * then stamps consumed_at. Idempotent: already-consumed rows are never re-published.
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
    // Validate event_type against the canonical enum — throws for unknown types
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

    // Publish first (at-least-once), then stamp consumed_at
    await queue.publish(message);

    await client.query(
      `UPDATE ${quotedSchema}.outbox_events
       SET consumed_at = pg_catalog.now()
       WHERE id = $1`,
      [row.id],
    );
  }
}
