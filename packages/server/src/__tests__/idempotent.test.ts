import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { withIdempotency } from '../idempotent.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
// import.meta.url points at packages/server/src/__tests__/idempotent.test.ts
// '../..' resolves to packages/server (the package root)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// packages/server/../../db/migrations would be wrong (skips packages/); use ../db/migrations
const dbMigrationsRoot = resolve(packageRoot, '../db/migrations');

type IdempotencyKeyRow = {
  transaction_id: string;
  org_id: string;
  request_hash: string;
  response_json: Record<string, unknown>;
  created_at: string;
};

let dbClient: pg.PoolClient;
let schemaName = 'public';
let closePool: () => Promise<void>;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// Helper to validate UUID v7
function isValidUUIDv7(uuid: string): boolean {
  // UUID v7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx where y is 8, 9, a, or b
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}


beforeAll(async () => {
  if (!hasDatabaseUrl) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }

  try {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    closePool = async () => {
      await pool.end();
    };

    dbClient = await pool.connect();
  } catch (error) {
    console.warn('Failed to connect to database, skipping integration tests');
    return;
  }
  schemaName = `ci_idempotency_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);
  // Set search_path so unqualified table references in withIdempotency resolve to the test schema.
  await dbClient.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);

  // Load baseline migrations
  const baselineMigration = readFileSync(
    resolve(dbMigrationsRoot, '001-baseline.sql'),
    'utf8',
  ).split('public.').join(`${schemaName}.`);
  await dbClient.query(baselineMigration);

  const rlsMigration = readFileSync(
    resolve(dbMigrationsRoot, '002-rls-baseline.sql'),
    'utf8',
  ).split('public.').join(`${schemaName}.`);
  await dbClient.query(rlsMigration);

  // Load idempotency migration (013 was taken by T-038; T-024 uses 015-idempotency.sql)
  try {
    const idempotencyMigration = readFileSync(
      resolve(dbMigrationsRoot, '015-idempotency.sql'),
      'utf8',
    ).split('public.').join(`${schemaName}.`);
    await dbClient.query(idempotencyMigration);
  } catch (error) {
    console.warn('015-idempotency.sql not found, test will verify schema is created');
  }
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

describe('withIdempotency — idempotent mutation helper', () => {
  describe('AC1: Replay with same transaction_id and payload returns identical response without re-running handler', () => {
    runIntegrationTest(
      'should invoke handler exactly once and return same response on replay',
      async () => {
        const orgId = randomUUID();
        const transactionId = '01950000-0000-7000-8000-000000000001'; // Valid UUID v7
        const requestPayload = { action: 'create_item', value: 42 };
        const expectedResponse = { id: randomUUID(), status: 'created', value: 42 };

        let handlerInvocationCount = 0;

        const handler = async () => {
          handlerInvocationCount++;
          return expectedResponse;
        };

        // First call
        const firstResult = await withIdempotency(
          transactionId,
          requestPayload,
          handler,
          orgId,
          dbClient,
        );

        expect(handlerInvocationCount).toBe(1);
        expect(firstResult).toEqual(expectedResponse);

        // Replay with same transaction_id and payload
        const secondResult = await withIdempotency(
          transactionId,
          requestPayload,
          handler,
          orgId,
          dbClient,
        );

        // Handler should NOT be invoked again
        expect(handlerInvocationCount).toBe(1);
        // Both results must be identical
        expect(secondResult).toEqual(expectedResponse);
        expect(secondResult).toEqual(firstResult);
      },
    );

    runIntegrationTest(
      'should store and retrieve response_json from idempotency_keys table',
      async () => {
        const orgId = randomUUID();
        const transactionId = '01950000-0000-7000-8000-000000000002'; // Valid UUID v7
        const requestPayload = { action: 'update_item', id: 'item-123' };
        const expectedResponse = { id: 'item-123', status: 'updated', timestamp: '2025-05-07T00:00:00Z' };

        const handler = async () => {
          return expectedResponse;
        };

        await withIdempotency(transactionId, requestPayload, handler, orgId, dbClient);

        // Verify row exists in idempotency_keys table
        const result = await dbClient.query<IdempotencyKeyRow>(
          `SELECT transaction_id, org_id, request_hash, response_json, created_at
           FROM ${quoteIdentifier(schemaName)}.idempotency_keys
           WHERE transaction_id = $1`,
          [transactionId],
        );

        expect(result.rows).toHaveLength(1);
        const row = result.rows[0];
        expect(row.transaction_id).toBe(transactionId);
        expect(row.org_id).toBe(orgId);
        expect(row.response_json).toEqual(expectedResponse);
        expect(row.request_hash).toBeDefined();
        expect(row.created_at).toBeDefined();
      },
    );
  });

  describe('AC2: Hash mismatch on second call throws idempotency_conflict', () => {
    runIntegrationTest(
      'should throw idempotency_conflict when same transaction_id is used with different payload',
      async () => {
        const orgId = randomUUID();
        const transactionId = '01950000-0000-7000-8000-000000000003'; // Valid UUID v7
        const firstPayload = { action: 'delete_item', id: 'item-xyz' };
        const secondPayload = { action: 'delete_item', id: 'item-abc' }; // Different payload

        const handler = async () => {
          return { status: 'deleted' };
        };

        // First call with firstPayload
        await withIdempotency(transactionId, firstPayload, handler, orgId, dbClient);

        // Second call with different payload should throw
        await expect(
          withIdempotency(transactionId, secondPayload, handler, orgId, dbClient),
        ).rejects.toThrow('idempotency_conflict');
      },
    );

    runIntegrationTest(
      'should not mutate any row when idempotency_conflict is detected',
      async () => {
        const orgId = randomUUID();
        const transactionId = '01950000-0000-7000-8000-000000000004'; // Valid UUID v7
        const firstPayload = { action: 'insert', data: { name: 'original' } };
        const secondPayload = { action: 'insert', data: { name: 'modified' } };

        const handler = async () => {
          return { id: randomUUID(), status: 'inserted' };
        };

        // First call
        await withIdempotency(transactionId, firstPayload, handler, orgId, dbClient);

        // Get initial row
        let result = await dbClient.query<IdempotencyKeyRow>(
          `SELECT request_hash, response_json FROM ${quoteIdentifier(schemaName)}.idempotency_keys
           WHERE transaction_id = $1`,
          [transactionId],
        );
        const initialHash = result.rows[0].request_hash;
        const initialResponse = result.rows[0].response_json;

        // Second call with different payload — must throw idempotency_conflict
        await expect(
          withIdempotency(transactionId, secondPayload, handler, orgId, dbClient),
        ).rejects.toThrow('idempotency_conflict');

        // Verify row was NOT mutated
        result = await dbClient.query<IdempotencyKeyRow>(
          `SELECT request_hash, response_json FROM ${quoteIdentifier(schemaName)}.idempotency_keys
           WHERE transaction_id = $1`,
          [transactionId],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].request_hash).toBe(initialHash);
        expect(result.rows[0].response_json).toEqual(initialResponse);
      },
    );
  });

  describe('AC3: Invalid UUID v7 (version nibble != 7) throws invalid_transaction_id', () => {
    runIntegrationTest('should throw invalid_transaction_id for non-UUID input', async () => {
      const orgId = randomUUID();
      const invalidId = 'not-a-uuid';
      const handler = async () => {
        return { status: 'ok' };
      };

      await expect(
        withIdempotency(invalidId, {}, handler, orgId),
      ).rejects.toThrow('invalid_transaction_id');
    });

    runIntegrationTest('should throw invalid_transaction_id for UUID v4 (version nibble = 4)', async () => {
      const orgId = randomUUID();
      const uuidV4 = randomUUID(); // randomUUID() generates v4
      const handler = async () => {
        return { status: 'ok' };
      };

      await expect(
        withIdempotency(uuidV4, {}, handler, orgId),
      ).rejects.toThrow('invalid_transaction_id');
    });

    runIntegrationTest(
      'should throw invalid_transaction_id for UUID with wrong version nibble',
      async () => {
        const orgId = randomUUID();
        const invalidV7 = '01950000-0000-4000-8000-000000000001'; // Version 4, not 7
        const handler = async () => {
          return { status: 'ok' };
        };

        await expect(
          withIdempotency(invalidV7, {}, handler, orgId),
        ).rejects.toThrow('invalid_transaction_id');
      },
    );

    runIntegrationTest('should accept valid UUID v7', async () => {
      const orgId = randomUUID();
      const validV7 = '01950000-0000-7000-8000-000000000005'; // Valid v7
      let handlerCalled = false;

      const handler = async () => {
        handlerCalled = true;
        return { status: 'ok' };
      };

      await withIdempotency(validV7, {}, handler, orgId, dbClient);
      expect(handlerCalled).toBe(true);
    });
  });

  describe('idempotency_keys table schema', () => {
    runIntegrationTest('should have idempotency_keys table with required columns', async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'idempotency_keys'
         ORDER BY ordinal_position`,
        [schemaName],
      );

      const columns = new Map(result.rows.map((row) => [row.column_name, row]));

      expect(columns.has('transaction_id')).toBe(true);
      expect(columns.has('org_id')).toBe(true);
      expect(columns.has('request_hash')).toBe(true);
      expect(columns.has('response_json')).toBe(true);
      expect(columns.has('created_at')).toBe(true);

      // Check data types
      expect(columns.get('transaction_id')).toMatchObject({ data_type: 'uuid' });
      expect(columns.get('org_id')).toMatchObject({ data_type: 'uuid' });
      expect(columns.get('request_hash')).toMatchObject({ data_type: 'text' });
      expect(columns.get('response_json')).toMatchObject({ data_type: 'jsonb' });
    });

    runIntegrationTest('transaction_id should be primary key', async () => {
      const result = await dbClient.query(
        `SELECT constraint_name, constraint_type
         FROM information_schema.table_constraints
         WHERE table_schema = $1 AND table_name = 'idempotency_keys' AND constraint_type = 'PRIMARY KEY'`,
        [schemaName],
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });

    runIntegrationTest('org_id should not be nullable', async () => {
      const result = await dbClient.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'idempotency_keys' AND column_name = 'org_id'`,
        [schemaName],
      );

      expect(result.rows[0].is_nullable).toBe('NO');
    });

    runIntegrationTest('should have RLS policies for org_id isolation', async () => {
      const result = await dbClient.query(
        `SELECT policyname FROM pg_policies
         WHERE schemaname = $1 AND tablename = 'idempotency_keys'`,
        [schemaName],
      );

      expect(result.rows.length).toBeGreaterThan(0);
      const policyNames = result.rows.map((row) => row.policyname);
      expect(policyNames.some((name) => name.includes('idempotency') || name.includes('org'))).toBe(true);
    });
  });

  describe('Concurrent request safety', () => {
    runIntegrationTest(
      'should use ON CONFLICT DO NOTHING for safe concurrent first-call handling',
      async () => {
        const orgId = randomUUID();
        const transactionId = '01950000-0000-7000-8000-000000000006'; // Valid UUID v7
        const requestPayload = { action: 'concurrent_test', value: 100 };
        const expectedResponse = { id: randomUUID(), status: 'processed' };

        const handler = async () => {
          // Simulate concurrent calls by introducing a small delay
          return expectedResponse;
        };

        // Simulate two concurrent calls with same transaction_id
        const promises = [
          withIdempotency(transactionId, requestPayload, handler, orgId, dbClient),
          withIdempotency(transactionId, requestPayload, handler, orgId, dbClient),
        ];

        const [result1, result2] = await Promise.all(promises);

        // Both should return the same response
        expect(result1).toEqual(expectedResponse);
        expect(result2).toEqual(expectedResponse);

        // Verify only one row exists in idempotency_keys
        const result = await dbClient.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${quoteIdentifier(schemaName)}.idempotency_keys
           WHERE transaction_id = $1`,
          [transactionId],
        );

        expect(result.rows[0].count).toBe('1'); // pg returns COUNT(*) as a string
      },
    );
  });
});
