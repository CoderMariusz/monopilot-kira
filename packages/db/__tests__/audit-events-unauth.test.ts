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
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');
const rlsBaselineMigrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const auditMigrationPath = resolve(packageRoot, 'migrations/004-audit.sql');
const migrationPath = resolve(
  packageRoot,
  'migrations/060-audit-events-org-id-nullable.sql',
);
const sentinelOrgId = '00000000-0000-0000-0000-000000000000';

let pool: pg.Pool | undefined;
let client: pg.PoolClient | undefined;
let schemaName = 'public';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function migrationForSchema(path: string): string {
  return readFileSync(path, 'utf8').split('public.').join(`${quoteIdentifier(schemaName)}.`);
}

beforeAll(async () => {
  if (!hasDatabaseUrl) {
    return;
  }

  pool = getOwnerConnection();
  client = await pool.connect();
  schemaName = `ci_audit_unauth_${randomUUID().split('-').join('_')}`;
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);

  await client.query(migrationForSchema(baselineMigrationPath));
  await client.query(migrationForSchema(rlsBaselineMigrationPath));
  await client.query(migrationForSchema(auditMigrationPath));
  await client.query(`GRANT USAGE ON SCHEMA ${quoteIdentifier(schemaName)} TO app_user`);

  await client.query(
    `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
     (org_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
     VALUES ($1, 'system', 'auth.failed_login', 'auth', $2, $3, 'security')`,
    [sentinelOrgId, `sentinel-${randomUUID()}`, randomUUID()],
  );

  await client.query(migrationForSchema(migrationPath));
});

afterAll(async () => {
  if (client) {
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    } finally {
      client.release();
    }
  }

  if (pool) {
    await pool.end();
  }
});

describe('T-087 audit_events unauthenticated NULL-org events', () => {
  it('adds migration 060 to make org_id nullable and backfill sentinel rows', () => {
    expect(existsSync(migrationPath), 'migration 060 must exist').toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.audit_events\s+ALTER\s+COLUMN\s+org_id\s+DROP\s+NOT\s+NULL/i,
    );
    expect(sql).toMatch(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+is_unauthenticated\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i,
    );
    expect(sql).toMatch(/UPDATE\s+public\.audit_events/i);
    expect(sql).toMatch(/org_id\s*=\s*NULL/i);
    expect(sql).toMatch(/is_unauthenticated\s*=\s*true/i);
    expect(sql).toMatch(new RegExp(sentinelOrgId, 'i'));
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.audit_events/i);
    expect(sql).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  runIntegrationTest('allows service-role insert of unauthenticated audit events with NULL org_id', async () => {
    const requestId = randomUUID();
    const resourceId = `unauth-${randomUUID()}`;

    const result = await client!.query<{ org_id: string | null; is_unauthenticated: boolean }>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, is_unauthenticated, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES (NULL, true, 'system', 'auth.failed_login', 'auth', $1, $2, 'security')
       RETURNING org_id, is_unauthenticated`,
      [resourceId, requestId],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.org_id).toBeNull();
    expect(result.rows[0]?.is_unauthenticated).toBe(true);
  });

  runIntegrationTest('hides NULL-org audit events from app_user SELECT while service role can count them', async () => {
    const resourceId = `unauth-rls-${randomUUID()}`;

    await client!.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, is_unauthenticated, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES (NULL, true, 'system', 'auth.failed_login', 'auth', $1, $2, 'security')`,
      [resourceId, randomUUID()],
    );

    const serviceResult = await client!.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM ${quoteIdentifier(schemaName)}.audit_events
       WHERE resource_id = $1
         AND org_id IS NULL
         AND is_unauthenticated = true`,
      [resourceId],
    );

    let appResult: pg.QueryResult<{ cnt: string }>;
    try {
      await client!.query('BEGIN');
      await client!.query('SET LOCAL ROLE app_user');
      appResult = await client!.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM ${quoteIdentifier(schemaName)}.audit_events
         WHERE resource_id = $1
           AND org_id IS NULL
           AND is_unauthenticated = true`,
        [resourceId],
      );
      await client!.query('ROLLBACK');
    } catch (error) {
      await client!.query('ROLLBACK');
      throw error;
    }

    expect(serviceResult.rows[0]?.cnt).toBe('1');
    expect(appResult.rows[0]?.cnt).toBe('0');
  });

  runIntegrationTest('backfills all legacy all-zero sentinel org ids to NULL unauthenticated rows', async () => {
    const sentinelResult = await client!.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM ${quoteIdentifier(schemaName)}.audit_events
       WHERE org_id = $1`,
      [sentinelOrgId],
    );
    const unauthResult = await client!.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM ${quoteIdentifier(schemaName)}.audit_events
       WHERE org_id IS NULL
         AND is_unauthenticated = true`,
    );

    expect(sentinelResult.rows[0]?.cnt).toBe('0');
    expect(Number(unauthResult.rows[0]?.cnt ?? '0')).toBeGreaterThanOrEqual(1);
  });
});
