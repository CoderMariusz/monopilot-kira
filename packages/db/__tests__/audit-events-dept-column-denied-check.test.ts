import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  packageRoot,
  'migrations/058-audit-events-dept-column-denied-check.sql',
);

let pool: pg.Pool | undefined;
let client: pg.PoolClient | undefined;

beforeAll(async () => {
  if (!hasDatabaseUrl) {
    return;
  }

  pool = getOwnerConnection();
  client = await pool.connect();
});

afterAll(async () => {
  if (client) {
    client.release();
  }

  if (pool) {
    await pool.end();
  }
});

describe('T-083 dept_column_denied audit event security payload constraint', () => {
  it('adds migration 058 with a NOT VALID dept_column_denied CHECK constraint', () => {
    expect(existsSync(migrationPath), 'migration 058 must exist').toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.audit_events[\s\S]+ADD\s+CONSTRAINT\s+audit_events_dept_column_denied_security_check/i);
    expect(sql).toMatch(/CHECK\s*\([\s\S]+action\s*<>\s*'dept_column_denied'[\s\S]+after_state\s+IS\s+NOT\s+NULL[\s\S]+after_state\s+\?\s+'dept_id'[\s\S]+after_state\s+\?\s+'column_key'[\s\S]+after_state\s+\?\s+'actor_user_id'[\s\S]+\)/i);
    expect(sql).toMatch(/NOT\s+VALID\s*;/i);
    expect(sql).not.toMatch(/VALIDATE\s+CONSTRAINT\s+audit_events_dept_column_denied_security_check/i);
  });

  runIntegrationTest('keeps audit_events_dept_column_denied_security_check unvalidated', async () => {
    const result = await client!.query<{ convalidated: boolean }>(
      `SELECT convalidated
       FROM pg_constraint
       WHERE conrelid = 'public.audit_events'::regclass
         AND conname = 'audit_events_dept_column_denied_security_check'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.convalidated).toBe(false);
  });

  runIntegrationTest('rejects dept_column_denied audit events missing dept_id with SQLSTATE 23514', async () => {
    const actorUserId = randomUUID();
    const insertPromise = client!.query(
      `INSERT INTO public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class, after_state)
       VALUES ($1, $2, 'user', 'dept_column_denied', 'dept_column', $3, $4, 'security', $5::jsonb)`,
      [
        randomUUID(),
        actorUserId,
        `dept-column-${randomUUID()}`,
        randomUUID(),
        JSON.stringify({
          column_key: 'target_weight',
          actor_user_id: actorUserId,
        }),
      ],
    );

    await expect(insertPromise).rejects.toMatchObject({ code: '23514' });
  });

  runIntegrationTest('accepts dept_column_denied audit events with dept_id, column_key, and actor_user_id', async () => {
    const actorUserId = randomUUID();
    const result = await client!.query<{ id: string }>(
      `INSERT INTO public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class, after_state)
       VALUES ($1, $2, 'user', 'dept_column_denied', 'dept_column', $3, $4, 'security', $5::jsonb)
       RETURNING id`,
      [
        randomUUID(),
        actorUserId,
        `dept-column-${randomUUID()}`,
        randomUUID(),
        JSON.stringify({
          dept_id: randomUUID(),
          column_key: 'target_weight',
          actor_user_id: actorUserId,
        }),
      ],
    );

    expect(result.rows).toHaveLength(1);
  });
});
