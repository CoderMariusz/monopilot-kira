import { randomUUID } from 'node:crypto';

import { EventType } from '@monopilot/outbox/src/events.enum.js';
import { InMemoryQueue, type OutboxMessage } from '@monopilot/outbox/src/queue.js';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerOutboxConsumer } from '../outbox-consumer.js';
import { JobRegistry, type Logger } from '../../registry.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runWithDb = hasDatabaseUrl ? it : it.skip;

let pool: pg.Pool | undefined;
const tenantId = '11200000-0000-4000-8000-000000000001';
const orgId = '11200000-0000-4000-8000-000000000112';

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function seedOutboxEvent(values: {
  eventType?: string;
  aggregateId?: string;
  attempts?: number;
} = {}): Promise<number> {
  if (!pool) {
    throw new Error('database pool not initialized');
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, attempts)
     VALUES ($1, $2, 'audit', $3, $4::jsonb, 'test', $5)
     RETURNING id`,
    [
      orgId,
      values.eventType ?? EventType.AUDIT_RECORDED,
      values.aggregateId ?? randomUUID(),
      JSON.stringify({ source: 'worker-test' }),
      values.attempts ?? 0,
    ],
  );

  return Number(result.rows[0].id);
}

async function seedTestOrg(): Promise<void> {
  if (!pool) {
    throw new Error('database pool not initialized');
  }

  await pool.query(
    `INSERT INTO public.tenants (id, name, region_cluster, data_plane_url)
     VALUES ($1, 'T-112 Worker Tenant', 'eu', 'https://t112-worker.example.test')
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           region_cluster = EXCLUDED.region_cluster,
           data_plane_url = EXCLUDED.data_plane_url`,
    [tenantId],
  );
  await pool.query(
    `INSERT INTO public.organizations (id, tenant_id, name, industry_code)
     VALUES ($1, $2, 'T-112 Worker Org', 'generic')
     ON CONFLICT (id) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           industry_code = EXCLUDED.industry_code`,
    [orgId, tenantId],
  );
}

async function cleanupOutboxRows(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.query(`DELETE FROM public.outbox_dead_letter WHERE org_id = $1::uuid`, [orgId]);
  await pool.query(`DELETE FROM public.outbox_events WHERE org_id = $1::uuid`, [orgId]);
}

describe('outbox consumer worker job', () => {
  beforeAll(async () => {
    if (!hasDatabaseUrl) {
      return;
    }

    const dbClients = (await import(['@monopilot', 'db', 'clients.js'].join('/'))) as {
      getOwnerConnection: () => pg.Pool;
    };
    pool = dbClients.getOwnerConnection();
    await seedTestOrg();
    await cleanupOutboxRows();
  });

  beforeEach(async () => {
    await cleanupOutboxRows();
  });

  afterAll(async () => {
    if (pool) {
      await cleanupOutboxRows();
      await pool.query(`DELETE FROM public.organizations WHERE id = $1::uuid`, [orgId]);
      await pool.query(`DELETE FROM public.tenants WHERE id = $1::uuid`, [tenantId]);
    }

    await pool?.end();
  });

  runWithDb('consumes successful rows and publishes normalized event types', async () => {
    if (!pool) {
      throw new Error('database not initialized');
    }

    const queue = new InMemoryQueue();
    const registry = new JobRegistry({ pool, logger: createLoggerStub() });
    const aggregateId = randomUUID();
    const insertedId = await seedOutboxEvent({
      eventType: EventType.FG_CREATED,
      aggregateId,
    });

    registerOutboxConsumer(registry, {
      batchSize: 10,
      queue,
      retry: { maxAttempts: 5, baseDelayMs: 0 },
    });

    await registry.runOnceForTest('outbox-consumer');

    expect(queue.messages).toHaveLength(1);
    expect(queue.messages[0]).toMatchObject({
      eventType: EventType.FG_CREATED,
      aggregateId,
    });

    const result = await pool.query<{ consumed_at: Date | null; attempts: number }>(
      `SELECT consumed_at, attempts
       FROM public.outbox_events
       WHERE id = $1`,
      [insertedId],
    );
    expect(result.rows[0].consumed_at).toBeInstanceOf(Date);
    expect(result.rows[0].attempts).toBe(0);
  });

  runWithDb('increments attempts and leaves consumed_at null when publish throws, then retries on the next tick', async () => {
    if (!pool) {
      throw new Error('database not initialized');
    }

    const aggregateId = randomUUID();
    const insertedId = await seedOutboxEvent({ aggregateId });
    const queue = new InMemoryQueue();
    const publish = vi.spyOn(queue, 'publish').mockImplementation(async (message: OutboxMessage) => {
      if (message.aggregateId === aggregateId) {
        throw new Error('handler refused aggregate');
      }
      return undefined;
    });
    const registry = new JobRegistry({ pool, logger: createLoggerStub() });

    registerOutboxConsumer(registry, {
      batchSize: 10,
      queue,
      retry: { maxAttempts: 5, baseDelayMs: 0 },
    });

    await registry.runOnceForTest('outbox-consumer');

    let result = await pool.query<{ consumed_at: Date | null; attempts: number }>(
      `SELECT consumed_at, attempts
       FROM public.outbox_events
       WHERE id = $1`,
      [insertedId],
    );
    expect(result.rows[0]).toMatchObject({ consumed_at: null, attempts: 1 });
    expect(publish).toHaveBeenCalledTimes(1);

    await registry.runOnceForTest('outbox-consumer');

    result = await pool.query<{ consumed_at: Date | null; attempts: number }>(
      `SELECT consumed_at, attempts
       FROM public.outbox_events
       WHERE id = $1`,
      [insertedId],
    );
    expect(result.rows[0]).toMatchObject({ consumed_at: null, attempts: 2 });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  runWithDb('dead-letters max-attempt rows without re-publishing them', async () => {
    if (!pool) {
      throw new Error('database not initialized');
    }

    const queue = new InMemoryQueue();
    const publish = vi.spyOn(queue, 'publish');
    const insertedId = await seedOutboxEvent({ attempts: 5 });
    const registry = new JobRegistry({ pool, logger: createLoggerStub() });

    registerOutboxConsumer(registry, {
      batchSize: 10,
      queue,
      retry: { maxAttempts: 5, baseDelayMs: 0 },
    });

    await registry.runOnceForTest('outbox-consumer');

    const outboxResult = await pool.query<{
      consumed_at: Date | null;
      dead_lettered_at: Date | null;
      attempts: number;
    }>(
      `SELECT consumed_at, dead_lettered_at, attempts
       FROM public.outbox_events
       WHERE id = $1`,
      [insertedId],
    );
    expect(outboxResult.rows[0].consumed_at).toBeNull();
    expect(outboxResult.rows[0].dead_lettered_at).toBeInstanceOf(Date);
    expect(outboxResult.rows[0].attempts).toBe(5);

    const deadLetterResult = await pool.query<{
      outbox_event_id: string;
      failed_at: Date | null;
      last_error_text: string;
    }>(
      `SELECT outbox_event_id, failed_at, last_error_text
       FROM public.outbox_dead_letter
       WHERE outbox_event_id = $1`,
      [insertedId],
    );
    expect(deadLetterResult.rows).toHaveLength(1);
    expect(deadLetterResult.rows[0].failed_at).toBeInstanceOf(Date);
    expect(deadLetterResult.rows[0].last_error_text).toMatch(/max attempts/i);
    expect(publish).not.toHaveBeenCalled();

    await registry.runOnceForTest('outbox-consumer');
    expect(publish).not.toHaveBeenCalled();
  });
});
