import { normalizeEventType } from '@monopilot/outbox/src/events.enum.js';
import { Queue, type OutboxMessage } from '@monopilot/outbox/src/queue.js';
import type pg from 'pg';

import type { JobRegistry, Logger } from '../registry.js';

const JOB_NAME = 'outbox-consumer';
const DEFAULT_EVERY_MS = 5_000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 500;

export type OutboxConsumerOptions = {
  everyMs?: number;
  batchSize?: number;
  retry?: {
    maxAttempts: number;
    baseDelayMs: number;
  };
  queue?: Queue;
  schema?: string;
};

type OutboxRow = {
  id: string | number;
  org_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
  consumed_at: Date | null;
  app_version: string;
  attempts: number;
};

export class LoggingQueue extends Queue {
  constructor(private readonly logger?: Logger) {
    super();
  }

  async publish(message: OutboxMessage): Promise<void> {
    const payload = {
      event: 'outbox.publish',
      id: message.id,
      orgId: message.orgId,
      eventType: message.eventType,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      createdAt: message.createdAt.toISOString(),
      appVersion: message.appVersion,
    };

    if (this.logger) {
      this.logger.info('outbox publish', payload);
      return;
    }

    console.log(JSON.stringify(payload));
  }
}

export function registerOutboxConsumer(
  registry: JobRegistry,
  opts: OutboxConsumerOptions = {},
): void {
  registry.register(
    JOB_NAME,
    { kind: 'interval', everyMs: opts.everyMs ?? DEFAULT_EVERY_MS },
    async ({ pool, logger }) => {
      const client = await pool.connect();
      const queue = opts.queue ?? createDefaultQueue(logger);
      const schema = opts.schema ?? 'public';
      const retry = opts.retry ?? {
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        baseDelayMs: DEFAULT_BASE_DELAY_MS,
      };

      try {
        await consumeOutboxBatch(client, queue, {
          batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
          retry,
          schema,
          logger,
        });
      } finally {
        client.release();
      }
    },
  );
}

function createDefaultQueue(logger: Logger): Queue {
  return new LoggingQueue(logger);
}

async function consumeOutboxBatch(
  client: pg.PoolClient,
  queue: Queue,
  opts: {
    batchSize: number;
    retry: { maxAttempts: number; baseDelayMs: number };
    schema: string;
    logger: Logger;
  },
): Promise<void> {
  const schema = quoteIdentifier(opts.schema);
  const result = await client.query<OutboxRow>(
    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload,
            created_at, consumed_at, app_version, attempts
       FROM ${schema}.outbox_events
      WHERE consumed_at IS NULL
        AND dead_lettered_at IS NULL
      ORDER BY org_id, created_at
      LIMIT $1`,
    [opts.batchSize],
  );

  for (const row of result.rows) {
    if (row.attempts >= opts.retry.maxAttempts) {
      await deadLetterRow(client, schema, row, `max attempts reached (${row.attempts})`);
      continue;
    }

    try {
      const message = toOutboxMessage(row);
      await queue.publish(message);
      await client.query(
        `UPDATE ${schema}.outbox_events
            SET consumed_at = pg_catalog.now()
          WHERE id = $1
            AND consumed_at IS NULL
            AND dead_lettered_at IS NULL`,
        [row.id],
      );
    } catch (err) {
      const errorText = errorToText(err);
      const updatedAttempts = await markRetry(client, schema, row.id, errorText);

      opts.logger.error('outbox publish failed', {
        job: JOB_NAME,
        outbox_event_id: row.id,
        event_type: row.event_type,
        aggregate_id: row.aggregate_id,
        attempts: updatedAttempts,
        err,
      });

      if (updatedAttempts >= opts.retry.maxAttempts) {
        await maybeDelay(opts.retry.baseDelayMs, updatedAttempts);
      }
    }
  }
}

function toOutboxMessage(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    orgId: row.org_id,
    eventType: normalizeEventType(row.event_type),
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    createdAt: row.created_at,
    appVersion: row.app_version,
  };
}

async function markRetry(
  client: pg.PoolClient,
  schema: string,
  id: string | number,
  errorText: string,
): Promise<number> {
  const result = await client.query<{ attempts: number }>(
    `UPDATE ${schema}.outbox_events
        SET attempts = attempts + 1,
            last_error_text = $2
      WHERE id = $1
        AND consumed_at IS NULL
        AND dead_lettered_at IS NULL
      RETURNING attempts`,
    [id, errorText],
  );

  return result.rows[0]?.attempts ?? 0;
}

async function deadLetterRow(
  client: pg.PoolClient,
  schema: string,
  row: OutboxRow,
  errorText: string,
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO ${schema}.outbox_dead_letter
         (outbox_event_id, org_id, event_type, aggregate_type, aggregate_id,
          payload, created_at, consumed_at, app_version, attempts, last_error_text)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
       ON CONFLICT (outbox_event_id) DO UPDATE
          SET last_error_text = EXCLUDED.last_error_text,
              failed_at = pg_catalog.now()`,
      [
        row.id,
        row.org_id,
        row.event_type,
        row.aggregate_type,
        row.aggregate_id,
        JSON.stringify(row.payload),
        row.created_at,
        row.consumed_at,
        row.app_version,
        row.attempts,
        errorText,
      ],
    );

    await client.query(
      `UPDATE ${schema}.outbox_events
          SET dead_lettered_at = pg_catalog.now(),
              last_error_text = $2
        WHERE id = $1
          AND consumed_at IS NULL`,
      [row.id, errorText],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function maybeDelay(baseDelayMs: number, attempts: number): Promise<void> {
  if (baseDelayMs <= 0) {
    return;
  }

  const delayMs = Math.min(baseDelayMs * 2 ** Math.max(0, attempts - 1), 30_000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function errorToText(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
}
