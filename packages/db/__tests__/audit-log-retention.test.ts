/**
 * Slot F-4 — Static tests for migration 036-audit-log-retention.sql.
 *
 * No DB connection — pure file-content assertions, mirroring the style of
 * approval-token-prune.test.ts (034). These tests pin the contract that
 * migration 036 (a) defines `prune_audit_events`, (b) deletes the right
 * age window from the live audit table (`audit_events`), and (c) wraps
 * cron.schedule in a pg_extension guard so the migration is a no-op on
 * Postgres images without pg_cron.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '..',
  'migrations',
  '036-audit-log-retention.sql',
);

describe('Slot F-4 migration 036 — audit_events retention prune cron', () => {
  it('migration file 036-audit-log-retention.sql exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('declares prune_audit_events() function', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.prune_audit_events\s*\(\s*\)/i,
    );
  });

  it('prune body deletes rows older than 90 days from audit_events', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // Pin the exact age predicate — protects against accidental change to
    // the retention window, which is a security/compliance contract.
    // The live audit table column is `occurred_at` (migration 004); a flat
    // `created_at` would silently fail.
    expect(sql).toMatch(/occurred_at\s*<\s*now\s*\(\s*\)\s*-\s*interval\s*'90 days'/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+public\.audit_events/i);
  });

  it('preserves retention_class = security rows past the 90-day window', () => {
    // Defence-in-depth: a flat 90-day prune would destroy compliance-relevant
    // security events (admin/role grants, mfa events, impersonation). Pin
    // the class exclusion so the contract is auditable.
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/retention_class\s*<>\s*'security'/i);
  });

  it('schedules the prune via pg_cron at 04:00 UTC daily', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/cron\.schedule\s*\(/i);
    // Cron expression "0 4 * * *" — daily at 04:00.
    expect(sql).toMatch(/'0\s+4\s+\*\s+\*\s+\*'/);
  });

  it('wraps cron.schedule in a pg_extension guard so migration is no-op without pg_cron', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/pg_extension/i);
    expect(sql).toMatch(/extname\s*=\s*'pg_cron'/i);
    expect(sql).toMatch(/DO\s+\$\$/i);
  });
});
