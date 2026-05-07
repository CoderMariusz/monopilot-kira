import { createHash } from 'node:crypto';
import pg from 'pg';

/**
 * Validates that the given string is a UUID v7.
 * UUID v7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where the 13th hex digit (version nibble, index 14 in the string) MUST be '7'.
 */
function isUUIDv7(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return false;
  }
  // Index 14 is the version nibble: '00000000-0000-V...'
  //                                              ^14
  return id[14] === '7';
}

/**
 * Produces a deterministic JSON string regardless of key insertion order.
 * Recursively sorts object keys at every nesting level.
 * Arrays preserve element order (order is significant for arrays).
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          canonicalStringify((value as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  );
}

/**
 * Deterministically hash a request payload to a hex string (SHA-256).
 * Uses canonicalStringify to ensure stable output regardless of key insertion
 * order at any nesting depth.
 */
function hashPayload(payload: Record<string, unknown>): string {
  const canonical = canonicalStringify(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

type IdempotencyRow = {
  request_hash: string;
  response_json: Record<string, unknown>;
};

/**
 * Idempotent mutation helper (R14).
 *
 * @param transactionId  Client-generated UUID v7 idempotency key.
 * @param requestPayload The request payload hashed for conflict detection.
 * @param handler        Side-effecting function invoked exactly once per unique transaction_id.
 * @param orgId          The org UUID for row ownership.
 * @param db             Optional pg.PoolClient (defaults to a new pool from DATABASE_URL).
 *
 * Behaviour:
 *  - Throws 'invalid_transaction_id' if transactionId is not a valid UUID v7.
 *  - On first call: runs handler, persists result, returns it.
 *  - On replay with matching hash: returns cached response_json, handler NOT invoked.
 *  - On replay with different hash: throws 'idempotency_conflict', row NOT mutated.
 *  - INSERT … ON CONFLICT DO NOTHING ensures concurrent first-calls are safe.
 */
export async function withIdempotency<T>(
  transactionId: string,
  requestPayload: Record<string, unknown>,
  handler: () => Promise<T>,
  orgId: string,
  db?: pg.PoolClient,
): Promise<T> {
  if (!isUUIDv7(transactionId)) {
    throw new Error('invalid_transaction_id');
  }

  const requestHash = hashPayload(requestPayload);

  // Acquire a db connection if one was not supplied.
  let pool: pg.Pool | undefined;
  let client: pg.PoolClient;
  let ownsClient = false;

  if (db) {
    client = db;
  } else {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set and no db client was provided');
    }
    pool = new pg.Pool({ connectionString });
    client = await pool.connect();
    ownsClient = true;
  }

  try {
    // Step 1: Check for an existing row (cache hit path — handler must NOT run).
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_hash, response_json
         FROM idempotency_keys
        WHERE transaction_id = $1`,
      [transactionId],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) {
        throw new Error('idempotency_conflict');
      }
      // Cache hit with matching hash — return without running handler.
      return row.response_json as T;
    }

    // Step 2: Cache miss — run the handler, then persist.
    const response = await handler();

    await client.query(
      `INSERT INTO idempotency_keys (transaction_id, org_id, request_hash, response_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [transactionId, orgId, requestHash, JSON.stringify(response)],
    );

    // Step 3: Re-fetch to handle a possible concurrent winner that inserted first.
    const persisted = await client.query<IdempotencyRow>(
      `SELECT request_hash, response_json
         FROM idempotency_keys
        WHERE transaction_id = $1`,
      [transactionId],
    );

    if (persisted.rows.length > 0) {
      const row = persisted.rows[0];
      if (row.request_hash !== requestHash) {
        throw new Error('idempotency_conflict');
      }
      return row.response_json as T;
    }

    // Fallback: INSERT was DO-NOTHING and SELECT returned nothing (shouldn't happen).
    return response;
  } finally {
    if (ownsClient) {
      client.release();
      if (pool) {
        await pool.end();
      }
    }
  }
}
