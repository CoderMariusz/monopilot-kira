import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { EventType } from '../events.enum';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPackageRoot = resolve(packageRoot, '../../db');
const outboxMigrationPath = resolve(dbPackageRoot, 'migrations/003-outbox.sql');

let dbClient: pg.PoolClient | null = null;
let schemaName = 'public';
let closePool: (() => Promise<void>) | null = null;
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runWithDb = hasDatabaseUrl ? it : it.skip;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

describe('outbox module imports (RED phase)', () => {
  it('should have worker.ts module with runOnce export', async () => {
    const worker = await import('../worker');
    expect(worker.runOnce).toBeDefined();
    expect(typeof worker.runOnce).toBe('function');
  });

  it('should have queue.ts module with InMemoryQueue class', async () => {
    const queue = await import('../queue');
    expect(queue.InMemoryQueue).toBeDefined();
  });

  it('should have Queue interface defined', async () => {
    const queue = await import('../queue');
    expect(queue.Queue || queue.default).toBeDefined();
  });
});

describe('outbox_events table and worker (integration tests)', () => {
  beforeAll(async () => {
    if (!hasDatabaseUrl) {
      return;
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return;
    }

    const pool = new pg.Pool({ connectionString: databaseUrl });
    closePool = async () => {
      await pool.end();
    };

    dbClient = await pool.connect();
    schemaName = `ci_outbox_${randomUUID().split('-').join('_')}`;
    await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);

    // Load baseline and RLS migrations first
    const baselineMigration = readFileSync(resolve(dbPackageRoot, 'migrations/001-baseline.sql'), 'utf8').split('public.').join(`${schemaName}.`);
    const rlsMigration = readFileSync(resolve(dbPackageRoot, 'migrations/002-rls-baseline.sql'), 'utf8').split('public.').join(`${schemaName}.`);

    await dbClient.query(baselineMigration);
    await dbClient.query(rlsMigration);

    // Load outbox migration
    const outboxMigration = readFileSync(outboxMigrationPath, 'utf8').split('public.').join(`${schemaName}.`);
    await dbClient.query(outboxMigration);
  });

  afterAll(async () => {
    if (dbClient) {
      try {
        await dbClient.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade;`);
      } finally {
        dbClient.release();
      }
    }

    if (closePool) {
      await closePool();
    }
  });

  runWithDb('AC1: given outbox_events exists and a row is inserted with event_type=audit.recorded, when worker.runOnce() executes, then the in-memory queue contains exactly one message and the row\'s consumed_at is set', async () => {
    // Import the worker and queue modules
    const { runOnce } = await import('../worker');
    const { InMemoryQueue } = await import('../queue');

    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const queue = new InMemoryQueue();
    const orgId = randomUUID();
    const aggregateId = randomUUID();

    // Insert an outbox event with a valid event type
    const insertResult = await dbClient.query(
      `INSERT INTO ${schemaName}.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, consumed_at`,
      [
        orgId,
        EventType.AUDIT_RECORDED,
        'audit',
        aggregateId,
        JSON.stringify({ action: 'test' }),
        '1.0.0',
      ],
    );

    const insertedId = insertResult.rows[0].id;
    expect(insertedId).toBeDefined();
    expect(insertResult.rows[0].consumed_at).toBeNull();

    // Run the worker once — pass schemaName so the worker polls the isolated test schema
    // (objectively-wrong omission in RED: without schema the worker polls "public" and misses the row)
    await runOnce(dbClient, queue, schemaName);

    // Verify the queue received exactly one message
    expect(queue.messages).toHaveLength(1);
    const message = queue.messages[0];
    expect(message).toMatchObject({
      eventType: EventType.AUDIT_RECORDED,
      aggregateType: 'audit',
      aggregateId,
      orgId,
      payload: { action: 'test' },
      appVersion: '1.0.0',
    });

    // Verify the consumed_at timestamp is set
    const checkResult = await dbClient.query(
      `SELECT consumed_at FROM ${schemaName}.outbox_events WHERE id = $1`,
      [insertedId],
    );
    expect(checkResult.rows[0].consumed_at).not.toBeNull();
    expect(checkResult.rows[0].consumed_at).toBeInstanceOf(Date);
  });

  runWithDb('AC2: given event_type is constrained to EventType members, when an insertion uses invalid.event (not in EventType), then the worker rejects publishing and the test fails fast', async () => {
    const { runOnce } = await import('../worker');
    const { InMemoryQueue } = await import('../queue');

    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const queue = new InMemoryQueue();
    const orgId = randomUUID();
    const aggregateId = randomUUID();

    // Try to insert an outbox event with an invalid event type
    // This should fail at the database constraint level or be caught by the worker
    const invalidEventType = 'invalid.event';

    let insertedId: string | null = null;
    try {
      const result = await dbClient.query(
        `INSERT INTO ${schemaName}.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          orgId,
          invalidEventType,
          'invalid',
          aggregateId,
          JSON.stringify({}),
          '1.0.0',
        ],
      );
      insertedId = result.rows[0].id;
    } catch (insertError) {
      // Expected: DB constraint should reject invalid event type
      expect(insertError).toBeDefined();
      const errorMsg = String(insertError);
      expect(
        errorMsg.includes('invalid') ||
        errorMsg.includes('constraint') ||
        errorMsg.includes('check')
      ).toBe(true);
      return;
    }

    // If insert succeeded, the worker must reject it during publishing
    // Pass schemaName for isolated test schema (same fix as AC1 — objectively-wrong RED omission)
    if (insertedId) {
      await expect(runOnce(dbClient, queue, schemaName)).rejects.toThrow(/invalid|unknown|event.type/i);
    }
  });

  runWithDb('AC3: given the partial index on (org_id, created_at) WHERE consumed_at IS NULL exists, when EXPLAIN runs the unconsumed query, then it uses the index', async () => {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const indexQuery = `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = $1
        AND tablename = 'outbox_events'
        AND indexname LIKE '%unconsumed%'
    `;

    const indexResult = await dbClient.query(indexQuery, [schemaName]);
    expect(indexResult.rows.length).toBeGreaterThan(0);
    expect(indexResult.rows[0].indexname).toMatch(/outbox_events.*unconsumed/);

    // Verify the index is used by running EXPLAIN
    const explainQuery = `
      EXPLAIN (FORMAT JSON)
      SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, consumed_at, app_version
      FROM ${schemaName}.outbox_events
      WHERE consumed_at IS NULL
      ORDER BY org_id, created_at
      LIMIT 100
    `;

    const explainResult = await dbClient.query(explainQuery);
    const plan = JSON.parse(explainResult.rows[0]['QUERY PLAN'])[0];

    // Extract the plan tree to find if an index is used
    function findIndexInPlan(node: any): boolean {
      if (node['Index Name']) {
        return node['Index Name'].includes('unconsumed');
      }
      if (node['Plans']) {
        return node['Plans'].some((childNode: any) => findIndexInPlan(childNode));
      }
      return false;
    }

    expect(findIndexInPlan(plan['Plan'])).toBe(true);
  });
});
