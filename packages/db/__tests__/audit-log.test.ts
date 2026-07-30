/**
 * TASK-000067 / T-010 RED tests — audit_log monthly partitioning (ADR-008).
 *
 * Static migration contract tests: no DB connection required. These fail until
 * the GREEN step appends the audit_log partitioning migration and schema file.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(packageRoot, 'migrations');
const schemaPath = resolve(packageRoot, 'schema', 'audit-log.ts');
const renewalMigrationPath = resolve(migrationsDir, '556-audit-log-partition-safety.sql');

function readSqlMigrations(): Array<{ filename: string; sql: string }> {
  return readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => ({
      filename,
      sql: readFileSync(resolve(migrationsDir, filename), 'utf8'),
    }));
}

function auditLogPartitionMigration(): { filename: string; sql: string } {
  const migration = readSqlMigrations().find(
    ({ sql }) =>
      /\baudit_log\b/i.test(sql) && /PARTITION\s+BY\s+RANGE\s*\(/i.test(sql),
  );

  expect(
    migration,
    'expected an appended audit_log migration using declarative RANGE partitioning',
  ).toBeDefined();

  return migration!;
}

describe('T-010 audit_log partitioning migration contract', () => {
  it('adds the audit_log Drizzle schema surface', () => {
    expect(existsSync(schemaPath), 'packages/db/schema/audit-log.ts must exist').toBe(true);

    const schema = readFileSync(schemaPath, 'utf8');
    expect(schema).toMatch(/pgTable\s*\(\s*['"]audit_log['"]/i);
    expect(schema).toMatch(/orgId\s*:/);
    expect(schema).not.toMatch(/tenantId\s*:|tenant_id/i);
  });

  it('declares audit_log as a RANGE-partitioned table on occurred_at', () => {
    const { sql } = auditLogPartitionMigration();

    expect(sql).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.audit_log/i);
    expect(sql).toMatch(/PARTITION\s+BY\s+RANGE\s*\(\s*occurred_at\s*\)/i);
    expect(sql).toMatch(/\borg_id\s+uuid\s+not\s+null/i);
    expect(sql).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('creates 12 monthly child partitions up-front for the current year', () => {
    const { sql } = auditLogPartitionMigration();
    const partitionOfCount = (sql.match(/PARTITION\s+OF\s+public\.audit_log/gi) ?? []).length;
    const usesTwelveMonthLoop = /generate_series\s*\(\s*(?:0\s*,\s*11|1\s*,\s*12)\s*\)|\.\.\s*12\b/i.test(sql);
    const invokesCreatorForTwelveMonths = /audit_log_create_partitions\s*\(\s*12\s*\)/i.test(sql);

    expect(sql).toMatch(/CREATE\s+TABLE[\s\S]+PARTITION\s+OF\s+public\.audit_log/i);
    expect(partitionOfCount >= 12 || usesTwelveMonthLoop || invokesCreatorForTwelveMonths).toBe(true);
    expect(sql).toMatch(/date_trunc\s*\(\s*['"]year['"]\s*,\s*(?:current_date|now\s*\(\s*\))/i);
  });

  it('defines partition create and detach-only retention functions without pg_cron scheduling', () => {
    const { sql } = auditLogPartitionMigration();

    expect(sql).toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.audit_log_create_partitions\s*\(\s*[^)]*\b(?:n|months)\s+int(?:eger)?/i);
    expect(sql).toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.audit_log_detach_old\s*\(\s*[^)]*\bmonths\s+int(?:eger)?/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.audit_log\s+DETACH\s+PARTITION/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.audit_log_/i);
    expect(sql).not.toMatch(/cron\.schedule\s*\(/i);
  });

  it('adds a rolling 24-month creator, daily renewal, and a default safety partition', () => {
    expect(existsSync(renewalMigrationPath), 'migration 556 must renew audit_log partitions').toBe(true);

    const sql = readFileSync(renewalMigrationPath, 'utf8');
    expect(sql).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.audit_log_default[\s\S]+PARTITION\s+OF\s+public\.audit_log\s+DEFAULT/i);
    expect(sql).toMatch(/audit_log_create_partitions\s*\(\s*24\s*\)/i);
    expect(sql).toMatch(/cron\.schedule\s*\([\s\S]*audit_log_partition_maintenance_daily/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.[^\s]+[\s\S]+FROM\s+public\.audit_log_default/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.audit_log\s+ATTACH\s+PARTITION/i);
  });

  it('post-check inserts next-year and current rows, verifies tableoid, then removes both', () => {
    expect(existsSync(renewalMigrationPath), 'migration 556 must contain the executable post-check').toBe(true);

    const sql = readFileSync(renewalMigrationPath, 'utf8');
    expect(sql).toMatch(/DO\s+\$\$[\s\S]+INSERT\s+INTO\s+public\.audit_log[\s\S]+RETURNING\s+tableoid/i);
    expect(sql).toMatch(/interval\s+'1 year'/i);
    expect(sql).toMatch(/audit_log_default/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+public\.audit_log[\s\S]+probe/i);
    expect(sql).toMatch(/RAISE\s+NOTICE[\s\S]+future_partition[\s\S]+current_partition/i);
  });
});
