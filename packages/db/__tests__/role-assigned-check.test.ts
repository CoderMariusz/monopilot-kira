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
  'migrations/052-validate-role-assigned-check.sql',
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

describe('T-064 role.assigned audit retention constraint validation migration', () => {
  it('adds migration 052 with a target pre-flight guard before validating the existing CHECK', () => {
    expect(existsSync(migrationPath), 'migration 052 must exist').toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/SELECT\s+COUNT\s*\(\s*\*\s*\)[\s\S]+FROM\s+public\.audit_events/i);
    expect(sql).toMatch(/action\s*=\s*'role\.assigned'/i);
    expect(sql).toMatch(/retention_class\s*<>\s*'security'/i);
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.audit_events\s+VALIDATE\s+CONSTRAINT\s+audit_events_role_assigned_security_check\s*;/i,
    );
    expect(sql).not.toMatch(/\bADD\s+CONSTRAINT\b|\bDROP\s+CONSTRAINT\b/i);
  });

  runIntegrationTest('pre-flight SELECT finds zero role.assigned retention violators', async () => {
    const result = await client!.query<{ violating_rows: string }>(
      `SELECT COUNT(*)::text AS violating_rows
       FROM public.audit_events
       WHERE action = 'role.assigned'
         AND retention_class <> 'security'`,
    );

    expect(result.rows[0]?.violating_rows).toBe('0');
  });

  runIntegrationTest('marks audit_events_role_assigned_security_check as validated', async () => {
    const result = await client!.query<{ convalidated: boolean }>(
      `SELECT convalidated
       FROM pg_constraint
       WHERE conrelid = 'public.audit_events'::regclass
         AND conname = 'audit_events_role_assigned_security_check'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.convalidated).toBe(true);
  });

  runIntegrationTest('rejects role.assigned audit events without security retention', async () => {
    const insertPromise = client!.query(
      `INSERT INTO public.audit_events
       (org_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, 'user', 'role.assigned', 'role', $2, $3, 'standard')`,
      [randomUUID(), `role-${randomUUID()}`, randomUUID()],
    );

    await expect(insertPromise).rejects.toMatchObject({ code: '23514' });
  });
});
